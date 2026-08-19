import "../src/common/bigint-json-patch";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from "../src/common/global-prefix";

jest.setTimeout(60000);

const PDF_BUFFER = Buffer.from("%PDF-1.4\n%fake pdf content for tests\n");

describe("Publication History API: filters, actor names, and frozen historical data", () => {
  let app: INestApplication;
  let http: any;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDES });
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
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

  async function uploadRevision(token: string, orgId: string, documentId: string, revision: string, language: string) {
    const res = await request(http)
      .post(`/api/documents/${documentId}/revisions`)
      .set(auth(token, orgId))
      .field("revision", revision)
      .field("language", language)
      .attach("file", PDF_BUFFER, { filename: `${revision}.pdf`, contentType: "application/pdf" });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function submitApprove(token: string, orgId: string, documentId: string, revisionId: string) {
    await request(http).patch(`/api/documents/${documentId}/revisions/${revisionId}/submit`).set(auth(token, orgId)).expect(200);
    await request(http).patch(`/api/documents/${documentId}/revisions/${revisionId}/approve`).set(auth(token, orgId)).expect(200);
  }

  let adminToken: string;
  let orgId: string;
  let productAId: string;
  let productBId: string;
  let documentId: string;

  it("sets up an organization with two products and a document", async () => {
    adminToken = await registerAndLogin("owner@pub-history.example", "Passw0rd!", "Anna Admin");
    const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Pub History Org" }).expect(201);
    orgId = orgRes.body.id;

    const productA = await request(http)
      .post("/api/products")
      .set(auth(adminToken, orgId))
      .send({ name: "PumpMaster 400", modelDesignation: "PM-400" })
      .expect(201);
    productAId = productA.body.id;

    const productB = await request(http)
      .post("/api/products")
      .set(auth(adminToken, orgId))
      .send({ name: "ValveController 100" })
      .expect(201);
    productBId = productB.body.id;

    const docRes = await request(http).post("/api/documents").set(auth(adminToken, orgId)).send({ name: "Manual", documentType: "MANUAL" }).expect(201);
    documentId = docRes.body.id;
  });

  // -----------------------------------------------------------------------
  // THE critical test: renaming a product after publish must never change
  // what Publication History shows for that historical publication.
  // -----------------------------------------------------------------------
  let renameTestPublicationId: string;

  it("freezes the product name at publish time — a later rename does not change the historical snapshot", async () => {
    const rev = await uploadRevision(adminToken, orgId, documentId, "1.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ productId: productAId })
      .expect(201);
    await submitApprove(adminToken, orgId, documentId, rev.id);

    const publishRes = await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: rev.id }).expect(201);
    renameTestPublicationId = publishRes.body.id;

    // Sanity: right after publish, the frozen rule carries "PumpMaster 400".
    const beforeRename = await request(http).get(`/api/publications/${renameTestPublicationId}`).set(auth(adminToken, orgId)).expect(200);
    const rulesBefore = beforeRename.body.snapshot.applicabilityRules;
    expect(rulesBefore[0].productName).toBe("PumpMaster 400");

    // Rename the LIVE product.
    await request(http).patch(`/api/products/${productAId}`).set(auth(adminToken, orgId)).send({ name: "PumpMaster 500" }).expect(200);

    // Confirm the live product really did rename (sanity, not the point of this test).
    const liveProduct = await request(http).get(`/api/products/${productAId}`).set(auth(adminToken, orgId)).expect(200);
    expect(liveProduct.body.name).toBe("PumpMaster 500");

    // The historical snapshot, read again via the SAME API a UI would use,
    // must still say "PumpMaster 400" — not "PumpMaster 500".
    const afterRename = await request(http).get(`/api/publications/${renameTestPublicationId}`).set(auth(adminToken, orgId)).expect(200);
    const rulesAfter = afterRename.body.snapshot.applicabilityRules;
    expect(rulesAfter[0].productName).toBe("PumpMaster 400");
    expect(rulesAfter[0].productId).toBe(productAId); // same product, just renamed

    // Same via the list endpoint (what the History table actually renders).
    const listRes = await request(http).get("/api/publications").set(auth(adminToken, orgId)).expect(200);
    const listed = listRes.body.items.find((p: any) => p.id === renameTestPublicationId);
    expect(listed.snapshot.applicabilityRules[0].productName).toBe("PumpMaster 400");

    // Direct DB check too, bypassing the API entirely, as the strongest proof.
    const snapshot = await prisma.publicationSnapshot.findUniqueOrThrow({ where: { publicationId: renameTestPublicationId } });
    expect((snapshot.applicabilityRules as any)[0].productName).toBe("PumpMaster 400");
  });

  it("GET /api/publications/:id 404s for another organization's publication (tenant isolation)", async () => {
    const otherToken = await registerAndLogin("owner@pub-history-other.example", "Passw0rd!", "Other Owner");
    const otherOrgRes = await request(http).post("/api/organizations").set(auth(otherToken)).send({ name: "Other Org" }).expect(201);
    const otherOrgId = otherOrgRes.body.id;

    const res = await request(http).get(`/api/publications/${renameTestPublicationId}`).set(auth(otherToken, otherOrgId));
    expect(res.status).toBe(404);
  });

  it("Viewer can read publication history (list + detail)", async () => {
    await registerAndLogin("viewer@pub-history.example", "Passw0rd!", "Viktor Viewer");
    await request(http)
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(adminToken, orgId))
      .send({ email: "viewer@pub-history.example", role: "VIEWER" })
      .expect(201);
    const viewerLogin = await request(http).post("/api/auth/login").send({ email: "viewer@pub-history.example", password: "Passw0rd!" });
    const viewerToken = viewerLogin.body.accessToken;

    await request(http).get("/api/publications").set(auth(viewerToken, orgId)).expect(200);
    await request(http).get(`/api/publications/${renameTestPublicationId}`).set(auth(viewerToken, orgId)).expect(200);
  });

  it("publishedByName is a real resolved name, not a raw id", async () => {
    const res = await request(http).get(`/api/publications/${renameTestPublicationId}`).set(auth(adminToken, orgId)).expect(200);
    expect(res.body.publishedByName).toBe("Anna Admin");
  });

  it("filters by productId (scopedProductIds) and by status", async () => {
    // Second revision, scoped to Product B this time.
    const revB = await uploadRevision(adminToken, orgId, documentId, "1.1", "DE");
    await request(http)
      .post(`/api/documents/revisions/${revB.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ productId: productBId, serialFrom: "999001", serialTo: "999999" }) // disjoint from product A's unscoped rule at a different specificity tier so no conflict
      .expect(201);
    await submitApprove(adminToken, orgId, documentId, revB.id);
    const pubB = await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: revB.id }).expect(201);

    const filteredByA = await request(http).get("/api/publications").query({ productId: productAId }).set(auth(adminToken, orgId)).expect(200);
    expect(filteredByA.body.items.map((p: any) => p.id)).toContain(renameTestPublicationId);
    expect(filteredByA.body.items.map((p: any) => p.id)).not.toContain(pubB.body.id);

    const filteredByB = await request(http).get("/api/publications").query({ productId: productBId }).set(auth(adminToken, orgId)).expect(200);
    expect(filteredByB.body.items.map((p: any) => p.id)).toContain(pubB.body.id);
    expect(filteredByB.body.items.map((p: any) => p.id)).not.toContain(renameTestPublicationId);

    const activeOnly = await request(http).get("/api/publications").query({ status: "ACTIVE" }).set(auth(adminToken, orgId)).expect(200);
    expect(activeOnly.body.items.every((p: any) => p.status === "ACTIVE")).toBe(true);

    await request(http).patch(`/api/publications/${pubB.body.id}/revoke`).set(auth(adminToken, orgId)).expect(200);
    const revokedOnly = await request(http).get("/api/publications").query({ status: "REVOKED" }).set(auth(adminToken, orgId)).expect(200);
    expect(revokedOnly.body.items.map((p: any) => p.id)).toContain(pubB.body.id);
  });

  it("filters by publishedAt date range (from/to)", async () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const noneInFuture = await request(http)
      .get("/api/publications")
      .query({ from: farFuture })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(noneInFuture.body.items).toHaveLength(0);

    const farPast = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    const includesAll = await request(http)
      .get("/api/publications")
      .query({ from: farPast, to: new Date().toISOString() })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(includesAll.body.total).toBeGreaterThanOrEqual(1);
  });
});

describe("Audit API: actorId filter, search, and resolved actor names", () => {
  let app: INestApplication;
  let http: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDES });
    await app.init();
    http = app.getHttpServer();
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

  let adminToken: string;
  let orgId: string;
  let adminUserId: string;

  it("sets up an org and generates a real audit trail", async () => {
    adminToken = await registerAndLogin("owner@audit-api.example", "Passw0rd!", "Audit Admin");
    const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Audit API Org" }).expect(201);
    orgId = orgRes.body.id;

    const me = await request(http).get("/api/auth/me").set(auth(adminToken, orgId)).expect(200);
    adminUserId = me.body.id;

    await request(http).post("/api/products").set(auth(adminToken, orgId)).send({ name: "Audit Test Product" }).expect(201);
    await request(http).post("/api/documents").set(auth(adminToken, orgId)).send({ name: "Audit Test Doc", documentType: "MANUAL" }).expect(201);
  });

  it("actorName is a real resolved name, not a raw id", async () => {
    const res = await request(http).get("/api/audit").set(auth(adminToken, orgId)).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const withActor = res.body.items.find((e: any) => e.actorId === adminUserId);
    expect(withActor.actorName).toBe("Audit Admin");
  });

  it("filters by actorId", async () => {
    const res = await request(http).get("/api/audit").query({ actorId: adminUserId }).set(auth(adminToken, orgId)).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((e: any) => e.actorId === adminUserId)).toBe(true);
  });

  it("filters by free-text search across action/objectType/objectId", async () => {
    const res = await request(http).get("/api/audit").query({ search: "PRODUCT_CREATED" }).set(auth(adminToken, orgId)).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((e: any) => e.action === "PRODUCT_CREATED")).toBe(true);
  });

  it("Viewer can read audit; tenant isolation holds", async () => {
    await registerAndLogin("viewer@audit-api.example", "Passw0rd!", "Audit Viewer");
    await request(http)
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(adminToken, orgId))
      .send({ email: "viewer@audit-api.example", role: "VIEWER" })
      .expect(201);
    const viewerLogin = await request(http).post("/api/auth/login").send({ email: "viewer@audit-api.example", password: "Passw0rd!" });
    await request(http).get("/api/audit").set(auth(viewerLogin.body.accessToken, orgId)).expect(200);

    const otherToken = await registerAndLogin("owner@audit-api-other.example", "Passw0rd!", "Other Owner");
    const otherOrgRes = await request(http).post("/api/organizations").set(auth(otherToken)).send({ name: "Other Audit Org" }).expect(201);
    const otherOrgId = otherOrgRes.body.id;
    const crossOrg = await request(http).get("/api/audit").set(auth(otherToken, otherOrgId)).expect(200);
    // Org B's own audit list must never contain org A's events.
    expect(crossOrg.body.items.every((e: any) => e.actorId !== adminUserId)).toBe(true);
  });
});
