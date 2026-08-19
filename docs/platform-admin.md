# Platform Admin — Quickstart

Short, task-focused. For the *why* behind the platform/tenant privilege
model, see [platform-administration.md](platform-administration.md).

## Pilot-Admin quickstart (the SaaS operator)

1. **Deploy.** `docker compose up -d --build` — see
   [deployment.md](deployment.md).
2. **Bootstrap the first platform admin** (CLI only — there is no HTTP
   endpoint for this, by design):
   ```bash
   docker compose exec -e BOOTSTRAP_ADMIN_EMAIL=you@example.com \
     -e BOOTSTRAP_ADMIN_PASSWORD='<a real password>' \
     api node dist/src/bootstrap-platform-admin.js
   ```
3. **Log in** at the Web origin (`/login`) with that email/password.
4. **Create the first tenant**: Platform Admin portal → Tenants → New
   Tenant. This creates the organization and sends an invitation (returned
   directly in the create-tenant response today — no outbound email
   integration yet) to the tenant's first administrator.
5. **Relay that invitation link** to the actual customer/tenant admin. They
   accept it at `/invite/:token`, set a password, and land in their own
   tenant — with no visibility into the platform admin portal or any other
   tenant.

From here, day-to-day platform operator tasks all live under
`/platform/*`: tenant list + detail + usage, suspend/close a tenant,
platform user list, the platform audit trail, and the system info page
(version, health).

## What a Platform Admin can and cannot do

- **Can**: manage the installation — create/suspend/close tenants, view
  platform-wide usage, manage other platform admins, read the platform
  audit trail.
- **Cannot**: see or modify a tenant's actual data (products, documents,
  units) by virtue of being a platform admin. `platformRole` and tenant
  `OrganizationMembership.role` are completely separate — a platform admin
  who also happens to need access to a specific tenant's data needs an
  actual membership in that tenant, same as anyone else. There is no
  impersonation feature.

## Tenant-Admin quickstart (a customer's own administrator)

1. Accept your invitation at `/invite/:token` (sets your password, creates
   your account, activates your `ADMINISTRATOR` membership in your
   organization).
2. Log in. You land in `/app` — your organization's own workspace, with no
   visibility into any other tenant or the platform admin portal.
3. **Invite your team**: Settings → Users → Invite, picking their role
   (`ADMINISTRATOR`/`EDITOR`/`PUBLISHER`/`VIEWER`).
4. Build out your product structure, upload documents, and publish — see
   [domain-model.md](domain-model.md) and
   [publication-lifecycle.md](publication-lifecycle.md) for the actual
   product workflow, which this document doesn't repeat.

## Registration mode

`REGISTRATION_MODE` (env var) controls whether `/register` (open
self-signup) exists at all:

- `INVITE_ONLY` (default, and the only mode a real pilot/production
  deployment should use) — the only way into the system is via an
  invitation from a platform admin (first tenant admin) or a tenant admin
  (further team members).
- `SELF_SERVICE` — anyone can self-register. Dev/demo convenience only;
  production must never fall back to this just because the variable is
  unset (the default is `INVITE_ONLY` specifically to guard against that).

## Last-Administrator Protection

A tenant can never be left with zero active `ADMINISTRATOR` members — the
API rejects a role change or suspension that would leave that tenant with
none, including a self-change (an administrator cannot demote or suspend
themselves if they're the last one). Same principle for platform admins.
This is enforced server-side; it isn't just a UI guard.
