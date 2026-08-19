import "../src/common/bigint-json-patch";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { PasswordService } from "../src/auth/password.service";
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from "../src/common/global-prefix";
import { hashInvitationToken } from "../src/invitations/invitation-token";

jest.setTimeout(60000);

describe("Platform Administration (spec: Document Hub platform-vs-tenant phase)", () => {
  let app: INestApplication;
  let http: any;
  let prisma: PrismaService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDES });
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string, orgId?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (orgId) headers["X-Organization-Id"] = orgId;
    return headers;
  }

  async function registerAndLogin(email: string, password: string, fullName: string) {
    await request(http).post("/api/auth/register").send({ email, password, fullName });
    const res = await request(http).post("/api/auth/login").send({ email, password });
    return res.body.accessToken as string;
  }

  // Platform admins are never created via any HTTP endpoint (see
  // src/bootstrap-platform-admin.ts) — tests create one the same way the
  // real bootstrap script does, directly via Prisma, then log in normally.
  async function createPlatformAdminAndLogin(email: string, password: string, fullName: string) {
    const passwordHash = await passwords.hash(password);
    await prisma.user.create({ data: { email, passwordHash, fullName, platformRole: "PLATFORM_ADMIN" } });
    const res = await request(http).post("/api/auth/login").send({ email, password });
    return res.body.accessToken as string;
  }

  let platformAdminToken: string;

  beforeAll(async () => {
    platformAdminToken = await createPlatformAdminAndLogin(
      `operator-${Date.now()}@document-hub-platform.example`,
      "Passw0rd!",
      "Platform Operator",
    );
  });

  // -------------------------------------------------------------------
  // Platform Access
  // -------------------------------------------------------------------
  describe("Platform Access", () => {
    it("rejects an unauthenticated caller", async () => {
      await request(http).get("/api/platform/tenants").expect(401);
    });

    it("rejects a normal user (no platform role)", async () => {
      const token = await registerAndLogin("normal-user@platform-access.example", "Passw0rd!", "Normal User");
      await request(http).get("/api/platform/tenants").set(auth(token)).expect(403);
    });

    it("rejects a tenant administrator (membership role never implies platform privilege)", async () => {
      const adminToken = await registerAndLogin("tenant-admin@platform-access.example", "Passw0rd!", "Tenant Admin");
      await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Platform Access Test Org" }).expect(201);
      await request(http).get("/api/platform/tenants").set(auth(adminToken)).expect(403);
    });

    it("allows a platform admin", async () => {
      await request(http).get("/api/platform/tenants").set(auth(platformAdminToken)).expect(200);
    });
  });

  // -------------------------------------------------------------------
  // Privilege Escalation
  // -------------------------------------------------------------------
  describe("Privilege Escalation", () => {
    it("a normal user cannot assign themselves PLATFORM_ADMIN (no such field is ever accepted by any endpoint)", async () => {
      const token = await registerAndLogin("escalate-self@platform-security.example", "Passw0rd!", "Escalator");
      // /api/auth/register's DTO whitelist-strips any unknown field (incl.
      // platformRole) — forbidNonWhitelisted makes an explicit attempt 400,
      // proving there is no accidental pass-through.
      const res = await request(http)
        .post("/api/auth/register")
        .send({ email: "escalate-self-2@platform-security.example", password: "Passw0rd!", fullName: "X", platformRole: "PLATFORM_ADMIN" });
      expect(res.status).toBe(400);

      const me = await request(http).get("/api/auth/me").set(auth(token)).expect(200);
      expect(me.body.platformRole).toBe("USER");
    });

    it("a tenant administrator cannot assign PLATFORM_ADMIN to anyone via any tenant-scoped endpoint", async () => {
      const adminToken = await registerAndLogin("escalate-admin@platform-security.example", "Passw0rd!", "Admin");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Escalation Org" }).expect(201);
      const orgId = orgRes.body.id;
      // The invitation role is constrained to MembershipRole — PLATFORM_ADMIN
      // isn't even a member of that enum, so class-validator rejects it.
      const res = await request(http)
        .post(`/api/organizations/${orgId}/invitations`)
        .set(auth(adminToken, orgId))
        .send({ email: "someone@platform-security.example", role: "PLATFORM_ADMIN" });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // Tenant Creation (platform wizard)
  // -------------------------------------------------------------------
  describe("Tenant Creation", () => {
    it("platform admin creates a tenant, which creates an organization and a pending invitation — no manual DB action", async () => {
      const res = await request(http)
        .post("/api/platform/tenants")
        .set(auth(platformAdminToken))
        .send({ name: "Created By Platform GmbH", adminEmail: "first-admin@created-by-platform.example" })
        .expect(201);

      expect(res.body.tenant.status).toBe("TRIAL");
      expect(res.body.invitation.email).toBe("first-admin@created-by-platform.example");
      expect(res.body.invitation.role).toBe("ADMINISTRATOR");
      expect(res.body.invitationToken).toBeTruthy();

      const org = await prisma.organization.findUnique({ where: { id: res.body.tenant.id } });
      expect(org).toBeTruthy();
      const invitation = await prisma.invitation.findFirst({ where: { organizationId: res.body.tenant.id } });
      expect(invitation?.status).toBe("PENDING");
    });

    it("a non-platform-admin cannot create a tenant via the platform endpoint", async () => {
      const token = await registerAndLogin("not-platform-admin@tenant-creation.example", "Passw0rd!", "X");
      await request(http)
        .post("/api/platform/tenants")
        .set(auth(token))
        .send({ name: "Should Fail", adminEmail: "x@example.com" })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------
  // Invitation lifecycle + First Tenant Admin
  // -------------------------------------------------------------------
  describe("Invitation lifecycle", () => {
    async function createTenantWithInvitation(adminEmail: string, tenantName: string) {
      const res = await request(http)
        .post("/api/platform/tenants")
        .set(auth(platformAdminToken))
        .send({ name: tenantName, adminEmail })
        .expect(201);
      return { orgId: res.body.tenant.id as string, token: res.body.invitationToken as string };
    }

    it("a valid token is accepted, creates the user, and grants an active ADMINISTRATOR membership", async () => {
      const { orgId, token } = await createTenantWithInvitation("valid-token@invitation-flow.example", "Valid Token Tenant");

      const accept = await request(http)
        .post(`/api/invitations/${token}/accept`)
        .send({ fullName: "First Admin", password: "Passw0rd!" })
        .expect(201);
      expect(accept.body.createdNewAccount).toBe(true);
      expect(accept.body.accessToken).toBeTruthy();

      const membership = await prisma.organizationMembership.findFirst({
        where: { organizationId: orgId, role: "ADMINISTRATOR" },
        include: { user: true },
      });
      expect(membership?.status).toBe("ACTIVE");
      expect(membership?.user.email).toBe("valid-token@invitation-flow.example");

      // Login now works through the normal flow, entirely via the product.
      const login = await request(http)
        .post("/api/auth/login")
        .send({ email: "valid-token@invitation-flow.example", password: "Passw0rd!" })
        .expect(201);
      expect(login.body.accessToken).toBeTruthy();
    });

    it("an expired token is rejected", async () => {
      const { token } = await createTenantWithInvitation("expired-token@invitation-flow.example", "Expired Token Tenant");
      await prisma.invitation.update({
        where: { tokenHash: hashInvitationToken(token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(http).get(`/api/invitations/${token}`).expect(404);
      await request(http).post(`/api/invitations/${token}/accept`).send({ fullName: "X", password: "Passw0rd!" }).expect(404);
    });

    it("a revoked token is rejected", async () => {
      const adminToken = await registerAndLogin("revoke-owner@invitation-flow.example", "Passw0rd!", "Owner");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Revoke Test Org" }).expect(201);
      const orgId = orgRes.body.id;

      const invitation = await request(http)
        .post(`/api/organizations/${orgId}/invitations`)
        .set(auth(adminToken, orgId))
        .send({ email: "revoked-invitee@invitation-flow.example", role: "VIEWER" })
        .expect(201);

      await request(http)
        .delete(`/api/organizations/${orgId}/invitations/${invitation.body.invitation.id}`)
        .set(auth(adminToken, orgId))
        .expect(200);

      await request(http)
        .post(`/api/invitations/${invitation.body.token}/accept`)
        .send({ fullName: "X", password: "Passw0rd!" })
        .expect(404);
    });

    it("a used token cannot be accepted a second time", async () => {
      const { token } = await createTenantWithInvitation("used-token@invitation-flow.example", "Used Token Tenant");
      await request(http).post(`/api/invitations/${token}/accept`).send({ fullName: "X", password: "Passw0rd!" }).expect(201);
      await request(http).post(`/api/invitations/${token}/accept`).send({ fullName: "X", password: "Passw0rd!" }).expect(404);
    });

    it("wrong-email handling is deterministic: an existing user must be logged in as the invited email, not any other", async () => {
      const adminToken = await registerAndLogin("owner@wrong-email.example", "Passw0rd!", "Owner");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Wrong Email Org" }).expect(201);
      const orgId = orgRes.body.id;

      // The invited email already has an account.
      const invitedUserToken = await registerAndLogin("invited@wrong-email.example", "Passw0rd!", "Invited");
      const otherUserToken = await registerAndLogin("someone-else@wrong-email.example", "Passw0rd!", "Someone Else");

      const invitation = await request(http)
        .post(`/api/organizations/${orgId}/invitations`)
        .set(auth(adminToken, orgId))
        .send({ email: "invited@wrong-email.example", role: "VIEWER" })
        .expect(201);

      // Anonymous accept of an already-registered email -> must log in first.
      const anonymous = await request(http).post(`/api/invitations/${invitation.body.token}/accept`).send({});
      expect(anonymous.status).toBe(401);

      // Authenticated as the WRONG user -> deterministic rejection, never silently succeeds.
      const wrongUser = await request(http)
        .post(`/api/invitations/${invitation.body.token}/accept`)
        .set(auth(otherUserToken))
        .send({});
      expect(wrongUser.status).toBe(403);

      // Authenticated as the correct, invited user -> succeeds.
      await request(http).post(`/api/invitations/${invitation.body.token}/accept`).set(auth(invitedUserToken)).send({}).expect(201);
    });
  });

  // -------------------------------------------------------------------
  // Tenant Membership lifecycle
  // -------------------------------------------------------------------
  describe("Tenant Membership lifecycle", () => {
    async function setupOrgWithRoles() {
      const adminToken = await registerAndLogin(`admin-${Date.now()}@membership.example`, "Passw0rd!", "Admin");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: `Membership Org ${Date.now()}` }).expect(201);
      const orgId = orgRes.body.id;

      async function inviteAndAccept(email: string, role: string) {
        const memberToken = await registerAndLogin(email, "Passw0rd!", "Member");
        const invitation = await request(http)
          .post(`/api/organizations/${orgId}/invitations`)
          .set(auth(adminToken, orgId))
          .send({ email, role })
          .expect(201);
        await request(http).post(`/api/invitations/${invitation.body.token}/accept`).set(auth(memberToken)).send({}).expect(201);
        const members = await request(http).get(`/api/organizations/${orgId}/members`).set(auth(adminToken, orgId)).expect(200);
        return { token: memberToken, membership: members.body.find((m: any) => m.user.email === email) };
      }

      return { adminToken, orgId, inviteAndAccept };
    }

    it("ADMIN can invite, change role, suspend, and reactivate a membership", async () => {
      const { adminToken, orgId, inviteAndAccept } = await setupOrgWithRoles();
      const editor = await inviteAndAccept(`editor-${Date.now()}@membership.example`, "EDITOR");

      const roleChange = await request(http)
        .patch(`/api/organizations/${orgId}/members/${editor.membership.id}/role`)
        .set(auth(adminToken, orgId))
        .send({ role: "PUBLISHER" })
        .expect(200);
      expect(roleChange.body.role).toBe("PUBLISHER");

      const suspend = await request(http)
        .patch(`/api/organizations/${orgId}/members/${editor.membership.id}/status`)
        .set(auth(adminToken, orgId))
        .send({ status: "SUSPENDED" })
        .expect(200);
      expect(suspend.body.status).toBe("SUSPENDED");

      const reactivate = await request(http)
        .patch(`/api/organizations/${orgId}/members/${editor.membership.id}/status`)
        .set(auth(adminToken, orgId))
        .send({ status: "ACTIVE" })
        .expect(200);
      expect(reactivate.body.status).toBe("ACTIVE");
    });

    it("EDITOR, PUBLISHER, VIEWER cannot manage memberships", async () => {
      const { orgId, inviteAndAccept } = await setupOrgWithRoles();
      const editor = await inviteAndAccept(`editor2-${Date.now()}@membership.example`, "EDITOR");
      const publisher = await inviteAndAccept(`publisher2-${Date.now()}@membership.example`, "PUBLISHER");
      const viewer = await inviteAndAccept(`viewer2-${Date.now()}@membership.example`, "VIEWER");

      for (const nonAdmin of [editor, publisher, viewer]) {
        await request(http)
          .post(`/api/organizations/${orgId}/invitations`)
          .set(auth(nonAdmin.token, orgId))
          .send({ email: "irrelevant@membership.example", role: "VIEWER" })
          .expect(403);
        await request(http)
          .patch(`/api/organizations/${orgId}/members/${viewer.membership.id}/role`)
          .set(auth(nonAdmin.token, orgId))
          .send({ role: "EDITOR" })
          .expect(403);
        await request(http)
          .patch(`/api/organizations/${orgId}/members/${viewer.membership.id}/status`)
          .set(auth(nonAdmin.token, orgId))
          .send({ status: "SUSPENDED" })
          .expect(403);
      }
    });
  });

  // -------------------------------------------------------------------
  // Last Administrator Protection
  // -------------------------------------------------------------------
  describe("Last Administrator Protection", () => {
    it("cannot demote the final active administrator (including a self-change)", async () => {
      const adminToken = await registerAndLogin(`sole-admin-${Date.now()}@last-admin.example`, "Passw0rd!", "Sole Admin");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: `Last Admin Org ${Date.now()}` }).expect(201);
      const orgId = orgRes.body.id;

      const members = await request(http).get(`/api/organizations/${orgId}/members`).set(auth(adminToken, orgId)).expect(200);
      const selfMembership = members.body[0];

      const res = await request(http)
        .patch(`/api/organizations/${orgId}/members/${selfMembership.id}/role`)
        .set(auth(adminToken, orgId))
        .send({ role: "VIEWER" });
      expect(res.status).toBe(409);
    });

    it("cannot suspend the final active administrator", async () => {
      const adminToken = await registerAndLogin(`sole-admin2-${Date.now()}@last-admin.example`, "Passw0rd!", "Sole Admin");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: `Last Admin Org 2 ${Date.now()}` }).expect(201);
      const orgId = orgRes.body.id;

      const members = await request(http).get(`/api/organizations/${orgId}/members`).set(auth(adminToken, orgId)).expect(200);
      const selfMembership = members.body[0];

      const res = await request(http)
        .patch(`/api/organizations/${orgId}/members/${selfMembership.id}/status`)
        .set(auth(adminToken, orgId))
        .send({ status: "SUSPENDED" });
      expect(res.status).toBe(409);
    });

    it("demoting one of two administrators is allowed", async () => {
      const adminToken = await registerAndLogin(`admin-a-${Date.now()}@last-admin.example`, "Passw0rd!", "Admin A");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: `Two Admin Org ${Date.now()}` }).expect(201);
      const orgId = orgRes.body.id;

      const secondAdminEmail = `admin-b-${Date.now()}@last-admin.example`;
      const secondAdminToken = await registerAndLogin(secondAdminEmail, "Passw0rd!", "Admin B");
      const invitation = await request(http)
        .post(`/api/organizations/${orgId}/invitations`)
        .set(auth(adminToken, orgId))
        .send({ email: secondAdminEmail, role: "ADMINISTRATOR" })
        .expect(201);
      await request(http).post(`/api/invitations/${invitation.body.token}/accept`).set(auth(secondAdminToken)).send({}).expect(201);

      const members = await request(http).get(`/api/organizations/${orgId}/members`).set(auth(adminToken, orgId)).expect(200);
      const selfMembership = members.body.find((m: any) => m.user.email !== secondAdminEmail);

      await request(http)
        .patch(`/api/organizations/${orgId}/members/${selfMembership.id}/role`)
        .set(auth(adminToken, orgId))
        .send({ role: "VIEWER" })
        .expect(200);
    });
  });

  // -------------------------------------------------------------------
  // Tenant Isolation (membership/invitation surface)
  // -------------------------------------------------------------------
  describe("Tenant Isolation", () => {
    it("Tenant A admin cannot read Tenant B's members", async () => {
      const adminA = await registerAndLogin(`admin-a-iso-${Date.now()}@isolation.example`, "Passw0rd!", "Admin A");
      const adminB = await registerAndLogin(`admin-b-iso-${Date.now()}@isolation.example`, "Passw0rd!", "Admin B");
      const orgB = await request(http).post("/api/organizations").set(auth(adminB)).send({ name: `Org B ${Date.now()}` }).expect(201);

      // adminA sends X-Organization-Id: org B while authenticated as a
      // non-member of org B -> must be rejected by TenantGuard, never leak.
      const res = await request(http).get(`/api/organizations/${orgB.body.id}/members`).set(auth(adminA, orgB.body.id));
      expect(res.status).toBe(403);
    });

    it("Tenant A admin cannot revoke Tenant B's invitation", async () => {
      const adminA = await registerAndLogin(`admin-a-iso2-${Date.now()}@isolation.example`, "Passw0rd!", "Admin A");
      const orgA = await request(http).post("/api/organizations").set(auth(adminA)).send({ name: `Org A2 ${Date.now()}` }).expect(201);
      const adminB = await registerAndLogin(`admin-b-iso2-${Date.now()}@isolation.example`, "Passw0rd!", "Admin B");
      const orgB = await request(http).post("/api/organizations").set(auth(adminB)).send({ name: `Org B2 ${Date.now()}` }).expect(201);

      const invitation = await request(http)
        .post(`/api/organizations/${orgB.body.id}/invitations`)
        .set(auth(adminB, orgB.body.id))
        .send({ email: "victim@isolation.example", role: "VIEWER" })
        .expect(201);

      // adminA tries to revoke it while scoped to their OWN org (org A) — the
      // invitation belongs to org B, so it must not be found under org A.
      const res = await request(http)
        .delete(`/api/organizations/${orgA.body.id}/invitations/${invitation.body.invitation.id}`)
        .set(auth(adminA, orgA.body.id));
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------
  // Tenant Suspension enforcement
  // -------------------------------------------------------------------
  describe("Tenant Suspension enforcement", () => {
    it("ACTIVE tenant: writes allowed; SUSPENDED: writes blocked but public QR + download keep working; reactivated: writes allowed again", async () => {
      const adminToken = await registerAndLogin(`suspend-admin-${Date.now()}@suspension.example`, "Passw0rd!", "Admin");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: `Suspension Org ${Date.now()}` }).expect(201);
      const orgId = orgRes.body.id;
      await prisma.organization.update({ where: { id: orgId }, data: { status: "ACTIVE" } });

      const productRes = await request(http)
        .post("/api/products")
        .set(auth(adminToken, orgId))
        .send({ name: "Suspend Test Product" })
        .expect(201);
      const productId = productRes.body.id;
      const productStableId = productRes.body.stableId;

      const docRes = await request(http)
        .post("/api/documents")
        .set(auth(adminToken, orgId))
        .send({ name: "Suspend Test Doc", documentType: "MANUAL" })
        .expect(201);
      const PDF_BUFFER = Buffer.from("%PDF-1.4\n%fake pdf\n");
      const revRes = await request(http)
        .post(`/api/documents/${docRes.body.id}/revisions`)
        .set(auth(adminToken, orgId))
        .field("revision", "1.0")
        .field("language", "DE")
        .attach("file", PDF_BUFFER, { filename: "1.0.pdf", contentType: "application/pdf" })
        .expect(201);
      await request(http)
        .post(`/api/documents/revisions/${revRes.body.id}/applicability-rules`)
        .set(auth(adminToken, orgId))
        .send({ productId })
        .expect(201);
      await request(http)
        .patch(`/api/documents/${docRes.body.id}/revisions/${revRes.body.id}/submit`)
        .set(auth(adminToken, orgId))
        .expect(200);
      await request(http)
        .patch(`/api/documents/${docRes.body.id}/revisions/${revRes.body.id}/approve`)
        .set(auth(adminToken, orgId))
        .expect(200);
      await request(http)
        .post("/api/publications")
        .set(auth(adminToken, orgId))
        .send({ revisionId: revRes.body.id })
        .expect(201);

      // Suspend via the platform endpoint.
      await request(http)
        .patch(`/api/platform/tenants/${orgId}/status`)
        .set(auth(platformAdminToken))
        .send({ status: "SUSPENDED" })
        .expect(200);

      // Writes blocked now.
      const blockedProduct = await request(http)
        .post("/api/products")
        .set(auth(adminToken, orgId))
        .send({ name: "Should Be Blocked" });
      expect(blockedProduct.status).toBe(403);

      const blockedPublish = await request(http)
        .patch(`/api/products/${productId}`)
        .set(auth(adminToken, orgId))
        .send({ name: "Renamed" });
      expect(blockedPublish.status).toBe(403);

      // Reads still allowed for the tenant's own admin.
      await request(http).get("/api/products").set(auth(adminToken, orgId)).expect(200);

      // Public QR page and download remain available while suspended.
      const publicPage = await request(http).get(`/p/${productStableId}`).expect(200);
      expect(publicPage.body.publications.length).toBeGreaterThan(0);
      const publicationStableId = publicPage.body.publications[0].publicationStableId;
      await request(http).get(`/p/${productStableId}/publications/${publicationStableId}/download`).expect(200);

      // Reactivate.
      await request(http)
        .patch(`/api/platform/tenants/${orgId}/status`)
        .set(auth(platformAdminToken))
        .send({ status: "ACTIVE" })
        .expect(200);

      await request(http)
        .post("/api/products")
        .set(auth(adminToken, orgId))
        .send({ name: "Allowed Again" })
        .expect(201);
    });

    it("CLOSED tenant blocks the tenant context entirely (reads included) but keeps public access", async () => {
      const adminToken = await registerAndLogin(`closed-admin-${Date.now()}@suspension.example`, "Passw0rd!", "Admin");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: `Closed Org ${Date.now()}` }).expect(201);
      const orgId = orgRes.body.id;

      const productRes = await request(http).post("/api/products").set(auth(adminToken, orgId)).send({ name: "Closed Test Product" }).expect(201);

      await request(http)
        .patch(`/api/platform/tenants/${orgId}/status`)
        .set(auth(platformAdminToken))
        .send({ status: "CLOSED" })
        .expect(200);

      const blockedRead = await request(http).get("/api/products").set(auth(adminToken, orgId));
      expect(blockedRead.status).toBe(403);

      await request(http).get(`/p/${productRes.body.stableId}`).expect(200);
    });
  });

  // -------------------------------------------------------------------
  // Global User Suspension
  // -------------------------------------------------------------------
  describe("User Suspension", () => {
    it("a globally suspended user cannot authenticate a new session, and an already-issued token is rejected on the next request", async () => {
      const email = `suspend-me-${Date.now()}@user-suspension.example`;
      const token = await registerAndLogin(email, "Passw0rd!", "Suspend Me");
      await request(http).get("/api/auth/me").set(auth(token)).expect(200);

      const user = await prisma.user.findUnique({ where: { email } });
      await request(http)
        .patch(`/api/platform/users/${user!.id}/status`)
        .set(auth(platformAdminToken))
        .send({ status: "SUSPENDED" })
        .expect(200);

      // The already-issued JWT is now rejected — proves the check is live
      // per-request (JwtStrategy re-reads User.status), not just at login.
      await request(http).get("/api/auth/me").set(auth(token)).expect(401);

      // A fresh login attempt is also rejected.
      const loginAttempt = await request(http).post("/api/auth/login").send({ email, password: "Passw0rd!" });
      expect(loginAttempt.status).toBe(400);
    });

    it("a platform admin cannot suspend their own platform account", async () => {
      const me = await request(http).get("/api/auth/me").set(auth(platformAdminToken)).expect(200);
      const res = await request(http)
        .patch(`/api/platform/users/${me.body.id}/status`)
        .set(auth(platformAdminToken))
        .send({ status: "SUSPENDED" });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // Platform Audit
  // -------------------------------------------------------------------
  describe("Platform Audit", () => {
    it("a tenant suspension creates a PlatformAuditEvent", async () => {
      const adminToken = await registerAndLogin(`audit-admin-${Date.now()}@platform-audit.example`, "Passw0rd!", "Admin");
      const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: `Audit Org ${Date.now()}` }).expect(201);
      const orgId = orgRes.body.id;

      await request(http)
        .patch(`/api/platform/tenants/${orgId}/status`)
        .set(auth(platformAdminToken))
        .send({ status: "SUSPENDED" })
        .expect(200);

      const events = await prisma.platformAuditEvent.findMany({
        where: { targetType: "Organization", targetId: orgId, action: "PLATFORM_TENANT_SUSPENDED" },
      });
      expect(events.length).toBeGreaterThan(0);
    });

    it("platform audit is readable only by a platform admin", async () => {
      const token = await registerAndLogin(`audit-reader-${Date.now()}@platform-audit.example`, "Passw0rd!", "Reader");
      await request(http).get("/api/platform/audit").set(auth(token)).expect(403);
      await request(http).get("/api/platform/audit").set(auth(platformAdminToken)).expect(200);
    });
  });
});
