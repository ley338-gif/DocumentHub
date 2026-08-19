# Platform Administration

Document Hub has three cleanly separated levels of access:

```
PLATFORM ADMIN        — SaaS operator, administers the whole installation
      ↓
TENANT ADMINISTRATOR  — manages one customer organization
      ↓
EDITOR / PUBLISHER / VIEWER — day-to-day work inside one organization
```

No level implicitly grants privileges of the level above it. This document
records the architectural decisions behind that separation and the invariants
that keep it that way — see also `docs/architecture.md` for tenant isolation
and `docs/publication-lifecycle.md` for the publish/revoke domain this phase
builds on top of.

## Platform vs. tenant privilege

`User.platformRole` (`USER` | `PLATFORM_ADMIN`) is a field on `User` —
**not** a value of `MembershipRole` and **not** derived from any
`OrganizationMembership`. This was a deliberate choice over the alternative
(`OrganizationMembership.role = PLATFORM_ADMIN`): platform administration is
not "administering one particular organization especially well", it's a
different axis of authority that a user can hold independently of — or
alongside — any number of ordinary tenant memberships. A platform admin who
is *also* a tenant `ADMINISTRATOR` somewhere is fully normal and handled by
keeping the two roles on separate fields that are never cross-read.

`PlatformAdminGuard` (`src/common/guards/platform-admin.guard.ts`) is the
single authorization point for every `/api/platform/*` route. It never runs
alongside `TenantGuard`/`RolesGuard`, and no controller anywhere does an
inline `if (user.platformRole === ...)` check outside that one guard.

## Platform Admin Bootstrap

The very first platform admin cannot be created through any HTTP endpoint —
that would be a self-escalation vector. Instead:

```
BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... npm run bootstrap:platform-admin
```

runs `src/bootstrap-platform-admin.ts` as a standalone script
(`NestFactory.createApplicationContext`). It is idempotent: re-running with
an email that's already a platform admin is a no-op; re-running with an
email that exists as an ordinary user promotes that account's
`platformRole` in place (its password is left untouched — the script grants
a privilege, it does not reset credentials). Every run writes a
`PLATFORM_ADMIN_CREATED` `PlatformAuditEvent`.

## Registration Mode

`REGISTRATION_MODE` (env var, default `INVITE_ONLY`):

- **`INVITE_ONLY`** (production-like default) — `POST /api/auth/register` is
  disabled, and `POST /api/organizations` is restricted to platform admins.
  The only way to create a `User` is by accepting an `Invitation`.
- **`SELF_SERVICE`** — restores the original open register →
  create-organization flow, for local development convenience. The e2e test
  suite runs in this mode (`apps/api/.env.test`) so the existing spec files'
  `registerAndLogin` helpers keep working unchanged; the platform e2e spec
  toggles `INVITE_ONLY` explicitly for the assertions that need it.

The frontend reads the live mode via `GET /api/auth/registration-mode`
(public, unauthenticated) — `/register` shows the self-service form only in
`SELF_SERVICE`, and points to the invitation flow otherwise.

## Invitation Flow

`Invitation` (`src/invitations/`) is the single onboarding primitive used by
both:

- the platform tenant-create wizard (creates the `Organization` and the
  first-administrator `Invitation` atomically), and
- a tenant administrator inviting a colleague (`POST
  /api/organizations/:organizationId/invitations`).

Only `tokenHash` (SHA-256 of the raw token) is ever persisted — the raw
token is returned exactly once, to the inviter, as a copyable link
(`/invite/:token`). No mail provider is required or assumed; the
architecture doesn't preclude adding one later (the raw token is available
at creation time for whoever wires up an email send).

Accepting an invitation (`POST /api/invitations/:token/accept`) branches on
whether the invited email already has an account:

- **New email** — the request body supplies `fullName` + `password`; a
  `User` and an `ACTIVE` membership are created in one transaction, and the
  response includes a fresh access token (auto-login, same shape as
  register+login).
- **Existing email** — the request must be authenticated as that exact
  user. Anonymous → `401 INVITATION_LOGIN_REQUIRED` (frontend redirects to
  `/login?from=/invite/:token`). Authenticated as a *different* email →
  `403 FORBIDDEN`, deterministic, never silently succeeds.

The invitation is atomically claimed inside the transaction (`updateMany`
guarded by `status = PENDING`) before any account/membership work happens,
so two concurrent accept requests for the same token can't both succeed.
"Resend" revokes the existing pending invitation and issues a fresh one —
the only way to re-show a link, since the raw token is never stored.

## Tenant Lifecycle

`Organization.status`: `TRIAL` | `ACTIVE` | `SUSPENDED` | `CLOSED`.

| Status | Tenant writes | Tenant reads | Public QR/download |
|---|---|---|---|
| `TRIAL` / `ACTIVE` | allowed | allowed | allowed |
| `SUSPENDED` | **blocked** (403 `TENANT_SUSPENDED`) | allowed | allowed |
| `CLOSED` | blocked | **blocked** (403 `TENANT_CLOSED`) | allowed |

Enforced in exactly one place, `TenantGuard`
(`src/common/guards/tenant.guard.ts`): `CLOSED` refuses to resolve a tenant
context at all (blocks reads and writes alike — a closed tenant's own users
can't use `/app/*`); `SUSPENDED` still resolves a context but rejects every
`POST`/`PUT`/`PATCH`/`DELETE`. Platform Admin routes never go through this
guard, so lifecycle status has no bearing there.

**Public documentation policy** (the load-bearing invariant of this whole
phase): `PublicService` (`src/public/public.service.ts`) does **not** check
`Organization.status` at all. A commercial/administrative decision about a
tenant must never make documentation already delivered for a physical
machine disappear. This holds even for `CLOSED` — there is no hard-delete
path in this MVP (see "Non-Goals" below), so as long as the `Organization`
row exists, its already-published `/p/:stableId` and `/u/:stableId` pages
and downloads keep working regardless of lifecycle status.

## Membership Lifecycle & Last-Administrator Protection

`OrganizationMembership.status`: `ACTIVE` | `INVITED` | `SUSPENDED`
(pre-existing enum, `INVITED` is now vestigial — the Invitation flow means a
membership row is only ever created already-`ACTIVE`). A tenant admin can
suspend a colleague's membership (`PATCH
/members/:id/status`) without touching that user's global account or their
memberships in any other organization.

`OrganizationsService.assertNotLastActiveAdmin` is called from both the
role-change and status-change paths and blocks the change — server-side,
`409 LAST_ADMIN_PROTECTED` — whenever it would leave an organization with
zero active `ADMINISTRATOR` memberships. This applies identically to a
self-change: an admin can't accidentally strip their own role or suspend
themselves if they're the last one.

## Platform Audit

`PlatformAuditEvent` (`src/platform/platform-audit.service.ts`) is a
separate, append-only table from the tenant-scoped `AuditEvent` — platform
actions (tenant lifecycle, user suspension, admin bootstrap) are not any
single tenant's business record, so they are never written into a tenant's
own audit log. Where a platform action *does* directly affect a tenant
(e.g. a status change), a lightweight tenant-visible `AuditEvent` row
(`TENANT_STATUS_CHANGED`) is also written so the tenant's own history stays
honest about why their status changed — but `PlatformAuditEvent` remains
the authoritative operator record.

## Global User Suspension

`User.status`: `ACTIVE` | `SUSPENDED` (renamed from `DISABLED` to match
platform-facing terminology — migrated via `ALTER TYPE ... RENAME VALUE`,
no data loss, no code referenced the old value except the enum
declaration).

`JwtStrategy.validate()` re-fetches the `User` row on **every**
authenticated request (not just at login) and rejects with `401` if status
isn't `ACTIVE`. This is what makes suspension effective immediately against
an already-issued, still-unexpired JWT — the alternative (checking only at
login) would leave a suspended user's existing session working until it
naturally expired.

## Frontend context separation

The platform portal (`/platform/*`, `PlatformLayout.tsx`) is a separate
shell from the tenant workspace (`/app/*`, `AppLayout.tsx`) — no shared
sidebar, no org switcher inside the platform shell, no tenant nav inside
it. `Sidebar`'s optional `subtitle` prop ("Platform Administration") is the
one piece of shared chrome, so a platform admin can never mistake the
platform portal for being inside a customer's workspace. A platform admin
who also holds tenant memberships gets a "Zu meinen Organisationen" /
"Platform Administration" link in each shell to cross over — the two
contexts are never blended into one screen.

## Explicit Non-Goals (this phase)

No impersonation ("login as tenant"), no hard-delete of tenants or users
(`CLOSED`/`SUSPENDED` only — data retained, irreversible deletion is a
separate future process), no billing/Stripe/subscriptions, no SSO/SAML/
SCIM, no multiple platform-admin roles. See the PR description for the
full list.
