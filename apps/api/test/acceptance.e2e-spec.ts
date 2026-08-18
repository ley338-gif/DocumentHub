import "../src/common/bigint-json-patch";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { parseSerial } from "../src/applicability/serial";
import { PublicationResolverService } from "../src/publications/resolver.service";

jest.setTimeout(60000);

const PDF_BUFFER = Buffer.from("%PDF-1.4\n%fake pdf content for tests\n");

describe("Acceptance (spec §69-78)", () => {
  let app: INestApplication;
  let http: any;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix("api", { exclude: ["health", "p/:stableId", "u/:stableId"] });
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
    expect(res.body.accessToken).toBeTruthy();
    return res.body.accessToken as string;
  }

  async function uploadRevision(
    token: string,
    orgId: string,
    documentId: string,
    revision: string,
    language: string,
  ) {
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

  async function publish(token: string, orgId: string, revisionId: string) {
    const res = await request(http).post("/api/publications").set(auth(token, orgId)).send({ revisionId });
    return res;
  }

  // ---------------------------------------------------------------------
  // Shared fixtures for the main scenario (spec §69-77)
  // ---------------------------------------------------------------------
  let adminToken: string;
  let orgId: string;
  let productId: string;
  let variantId: string;
  let manualDocumentId: string;
  let manual41: any;
  let manual42: any;
  let manual41PublicationId: string;
  let manual42PublicationId: string;
  let afterManual42PublishedAt: Date;
  let safetyDocumentId: string;
  let safety23PublicationId: string;
  let afterSafetyPublishedAt: Date;
  let unit2187Id: string;
  let batchId: string;

  it("sets up organization, product, and variant", async () => {
    adminToken = await registerAndLogin("owner@test-manufacturer.example", "Passw0rd!", "Owner");
    const orgRes = await request(http)
      .post("/api/organizations")
      .set(auth(adminToken))
      .send({ name: "Test Manufacturer" })
      .expect(201);
    orgId = orgRes.body.id;

    const productRes = await request(http)
      .post("/api/products")
      .set(auth(adminToken, orgId))
      .send({ name: "PumpMaster 400" })
      .expect(201);
    productId = productRes.body.id;

    const variantRes = await request(http)
      .post(`/api/products/${productId}/variants`)
      .set(auth(adminToken, orgId))
      .send({ name: "H" })
      .expect(201);
    variantId = variantRes.body.id;
  });

  it("bulk-creates 5,000 units within a reasonable time (spec §35/§78)", async () => {
    const data = [];
    for (let i = 1; i <= 5000; i++) {
      const serialNumber = String(i).padStart(6, "0");
      const parsed = parseSerial(serialNumber);
      data.push({
        organizationId: orgId,
        productId,
        variantId,
        serialNumber,
        serialPrefix: parsed.prefix,
        serialSequence: parsed.sequence,
        serialSeqLength: parsed.sequenceLength,
      });
    }

    const start = Date.now();
    await prisma.unit.createMany({ data });
    const duration = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`Bulk insert of 5000 units took ${duration}ms`);
    expect(duration).toBeLessThan(30000);

    const count = await prisma.unit.count({ where: { organizationId: orgId } });
    expect(count).toBe(5000);
  });

  it("publishes Manual 4.1 (SN 000001-001999) and 4.2 (SN >=002000, open-ended) without conflict", async () => {
    const docRes = await request(http)
      .post("/api/documents")
      .set(auth(adminToken, orgId))
      .send({ name: "Manual", documentType: "MANUAL" })
      .expect(201);
    manualDocumentId = docRes.body.id;

    manual41 = await uploadRevision(adminToken, orgId, manualDocumentId, "4.1", "DE");
    await request(http)
      .post(`/api/documents/revisions/${manual41.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "000001", serialTo: "001999" })
      .expect(201);
    await submitApprove(adminToken, orgId, manualDocumentId, manual41.id);
    const pub41 = await publish(adminToken, orgId, manual41.id);
    expect(pub41.status).toBe(201);
    expect(pub41.body.id).toBeTruthy();
    manual41PublicationId = pub41.body.id;

    manual42 = await uploadRevision(adminToken, orgId, manualDocumentId, "4.2", "DE");
    await request(http)
      .post(`/api/documents/revisions/${manual42.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "002000" })
      .expect(201);
    await submitApprove(adminToken, orgId, manualDocumentId, manual42.id);
    const pub42 = await publish(adminToken, orgId, manual42.id);
    expect(pub42.status).toBe(201);
    manual42PublicationId = pub42.body.id;
    expect(manual42PublicationId).toBeTruthy();

    afterManual42PublishedAt = new Date();
  });

  it("resolves SN 001843 to Manual 4.1 and SN 002187 to Manual 4.2", async () => {
    const res1843 = await request(http)
      .get("/api/publications/resolve")
      .query({ productId, serialNumber: "001843", language: "DE" })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(res1843.body.conflicts).toHaveLength(0);
    expect(res1843.body.resolved).toHaveLength(1);
    expect(res1843.body.resolved[0].documentRevisionId).toBe(manual41.id);

    const res2187 = await request(http)
      .get("/api/publications/resolve")
      .query({ productId, serialNumber: "002187", language: "DE" })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(res2187.body.resolved).toHaveLength(1);
    expect(res2187.body.resolved[0].documentRevisionId).toBe(manual42.id);
  });

  it("publishes Safety Notice 2.3 scoped to a batch containing SN 002187 — resolves alongside Manual, not competing", async () => {
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { organizationId_serialNumber: { organizationId: orgId, serialNumber: "002187" } },
    });
    unit2187Id = unit.id;

    const batchRes = await request(http)
      .post("/api/batches")
      .set(auth(adminToken, orgId))
      .send({ productId, name: "2027-Q2-B" })
      .expect(201);
    batchId = batchRes.body.id;

    await request(http)
      .patch(`/api/units/${unit2187Id}`)
      .set(auth(adminToken, orgId))
      .send({ batchId })
      .expect(200);

    const docRes = await request(http)
      .post("/api/documents")
      .set(auth(adminToken, orgId))
      .send({ name: "Safety Notice", documentType: "SAFETY_NOTICE" })
      .expect(201);
    safetyDocumentId = docRes.body.id;

    const rev23 = await uploadRevision(adminToken, orgId, safetyDocumentId, "2.3", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev23.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ batchId })
      .expect(201);
    await submitApprove(adminToken, orgId, safetyDocumentId, rev23.id);
    const pubSafety = await publish(adminToken, orgId, rev23.id);
    expect(pubSafety.status).toBe(201);
    safety23PublicationId = pubSafety.body.id;
    afterSafetyPublishedAt = new Date();

    const res = await request(http)
      .get("/api/publications/resolve")
      .query({ unitId: unit2187Id, effectiveAt: afterSafetyPublishedAt.toISOString() })
      .set(auth(adminToken, orgId))
      .expect(200);

    expect(res.body.conflicts).toHaveLength(0);
    const revisionIds = res.body.resolved.map((s: any) => s.documentRevisionId).sort();
    expect(revisionIds).toEqual([manual42.id, rev23.id].sort());
  });

  it("resolves historically: before Safety Notice existed, only Manual 4.2 applied (spec §70)", async () => {
    const historical = await request(http)
      .get("/api/publications/resolve")
      .query({ unitId: unit2187Id, effectiveAt: afterManual42PublishedAt.toISOString() })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(historical.body.resolved.map((s: any) => s.documentRevisionId)).toEqual([manual42.id]);

    const now = await request(http)
      .get("/api/publications/resolve")
      .query({ unitId: unit2187Id, effectiveAt: new Date().toISOString() })
      .set(auth(adminToken, orgId))
      .expect(200);
    const nowIds = now.body.resolved.map((s: any) => s.documentRevisionId).sort();
    expect(nowIds).toEqual([manual42.id, (await prisma.documentRevision.findFirstOrThrow({ where: { documentId: safetyDocumentId } })).id].sort());
  });

  it("snapshot is byte-identical after live data mutates (spec §71)", async () => {
    const before = await prisma.publicationSnapshot.findUniqueOrThrow({
      where: { publicationId: manual41PublicationId },
    });

    await prisma.product.update({ where: { id: productId }, data: { name: "RENAMED PRODUCT" } });
    await prisma.applicabilityRule.updateMany({ where: { revisionId: manual41.id }, data: { serialTo: "999999" } });
    await prisma.documentRevision.update({ where: { id: manual41.id }, data: { status: "RETIRED" } });

    const after = await prisma.publicationSnapshot.findUniqueOrThrow({
      where: { publicationId: manual41PublicationId },
    });

    expect(after).toEqual(before);
  });

  it("rejects a publish whose applicability conflicts with an existing active publication (spec §75)", async () => {
    const conflictingRev = await uploadRevision(adminToken, orgId, manualDocumentId, "4.3", "DE");
    await request(http)
      .post(`/api/documents/revisions/${conflictingRev.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "001800", serialTo: "002500" })
      .expect(201);
    await submitApprove(adminToken, orgId, manualDocumentId, conflictingRev.id);

    const countBefore = await prisma.publication.count({ where: { organizationId: orgId } });
    const res = await publish(adminToken, orgId, conflictingRev.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("APPLICABILITY_CONFLICT");
    const countAfter = await prisma.publication.count({ where: { organizationId: orgId } });
    expect(countAfter).toBe(countBefore);
  });

  it("a unit-level rule wins over a product-level rule for that unit only (spec §76)", async () => {
    const docRes = await request(http)
      .post("/api/documents")
      .set(auth(adminToken, orgId))
      .send({ name: "Manual Specificity Test", documentType: "MANUAL" })
      .expect(201);
    const docId = docRes.body.id;

    const productRule = await uploadRevision(adminToken, orgId, docId, "1.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${productRule.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ productId })
      .expect(201);
    await submitApprove(adminToken, orgId, docId, productRule.id);
    await publish(adminToken, orgId, productRule.id).then((r) => expect(r.status).toBe(201));

    const unitOne = await prisma.unit.findUniqueOrThrow({
      where: { organizationId_serialNumber: { organizationId: orgId, serialNumber: "000001" } },
    });

    const unitRule = await uploadRevision(adminToken, orgId, docId, "1.1", "DE");
    await request(http)
      .post(`/api/documents/revisions/${unitRule.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ unitId: unitOne.id })
      .expect(201);
    await submitApprove(adminToken, orgId, docId, unitRule.id);
    await publish(adminToken, orgId, unitRule.id).then((r) => expect(r.status).toBe(201));

    const resUnitOne = await request(http)
      .get("/api/publications/resolve")
      .query({ unitId: unitOne.id })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(resUnitOne.body.resolved.map((s: any) => s.documentId)).toContain(docId);
    const winnerForUnitOne = resUnitOne.body.resolved.find((s: any) => s.documentId === docId);
    expect(winnerForUnitOne.documentRevisionId).toBe(unitRule.id);

    const unitTwo = await prisma.unit.findUniqueOrThrow({
      where: { organizationId_serialNumber: { organizationId: orgId, serialNumber: "000002" } },
    });
    const resUnitTwo = await request(http)
      .get("/api/publications/resolve")
      .query({ unitId: unitTwo.id })
      .set(auth(adminToken, orgId))
      .expect(200);
    const winnerForUnitTwo = resUnitTwo.body.resolved.find((s: any) => s.documentId === docId);
    expect(winnerForUnitTwo.documentRevisionId).toBe(productRule.id);
  });

  it("revoking a publication removes it from current resolution but not historical resolution, and is audited (spec §77)", async () => {
    const beforeRevoke = new Date();
    await request(http).patch(`/api/publications/${safety23PublicationId}/revoke`).set(auth(adminToken, orgId)).expect(200);

    const nowRes = await request(http)
      .get("/api/publications/resolve")
      .query({ unitId: unit2187Id, effectiveAt: new Date().toISOString() })
      .set(auth(adminToken, orgId))
      .expect(200);
    const safetyRevisionId = (await prisma.documentRevision.findFirstOrThrow({ where: { documentId: safetyDocumentId } })).id;
    expect(nowRes.body.resolved.map((s: any) => s.documentRevisionId)).not.toContain(safetyRevisionId);

    const historicalRes = await request(http)
      .get("/api/publications/resolve")
      .query({ unitId: unit2187Id, effectiveAt: beforeRevoke.toISOString() })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(historicalRes.body.resolved.map((s: any) => s.documentRevisionId)).toContain(safetyRevisionId);

    const auditRes = await request(http)
      .get("/api/audit")
      .query({ action: "PUBLICATION_REVOKED" })
      .set(auth(adminToken, orgId))
      .expect(200);
    expect(auditRes.body.items.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.body.items[0].objectId).toBe(safety23PublicationId);
  });

  // ---------------------------------------------------------------------
  // Tenant isolation (spec §73)
  // ---------------------------------------------------------------------
  it("enforces tenant isolation: another org's member cannot access Test Manufacturer's data", async () => {
    const otherToken = await registerAndLogin("owner@other-org.example", "Passw0rd!", "Other Owner");
    const otherOrgRes = await request(http)
      .post("/api/organizations")
      .set(auth(otherToken))
      .send({ name: "Other Org" })
      .expect(201);
    const otherOrgId = otherOrgRes.body.id;

    // Wrong org header for a token that has no membership there.
    const res1 = await request(http).get("/api/products").set(auth(otherToken, orgId));
    expect(res1.status).toBe(403);
    expect(res1.body.error.code).toBe("TENANT_VIOLATION");

    const res2 = await request(http).get("/api/units").set(auth(otherToken, orgId));
    expect(res2.status).toBe(403);

    const res3 = await request(http).get(`/api/documents/${manualDocumentId}/revisions`).set(auth(otherToken, orgId));
    expect(res3.status).toBe(403);

    const res4 = await request(http).get("/api/publications").set(auth(otherToken, orgId));
    expect(res4.status).toBe(403);

    // Resolver, called directly, must never leak org A's data under org B's id.
    const resolver = app.get(PublicationResolverService);
    await expect(
      resolver.resolvePublications({ organizationId: otherOrgId, productId, effectiveAt: new Date() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ---------------------------------------------------------------------
  // RBAC (spec §74)
  // ---------------------------------------------------------------------
  it("enforces RBAC: viewer read-only, editor cannot publish, publisher can, administrator manages members", async () => {
    const viewerToken = await registerAndLogin("viewer@test-manufacturer.example", "Passw0rd!", "Viewer User");
    const editorToken = await registerAndLogin("editor@test-manufacturer.example", "Passw0rd!", "Editor User");
    const publisherToken = await registerAndLogin("publisher@test-manufacturer.example", "Passw0rd!", "Publisher User");

    const inviteViewer = await request(http)
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(adminToken, orgId))
      .send({ email: "viewer@test-manufacturer.example", role: "VIEWER" })
      .expect(201);
    expect(inviteViewer.body.role).toBe("VIEWER");

    await request(http)
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(adminToken, orgId))
      .send({ email: "editor@test-manufacturer.example", role: "EDITOR" })
      .expect(201);

    await request(http)
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(adminToken, orgId))
      .send({ email: "publisher@test-manufacturer.example", role: "PUBLISHER" })
      .expect(201);

    // Viewer cannot create anything.
    const viewerCreate = await request(http)
      .post("/api/products")
      .set(auth(viewerToken, orgId))
      .send({ name: "Should Fail" });
    expect(viewerCreate.status).toBe(403);

    // Editor can create a document + revision, but cannot publish.
    const docRes = await request(http)
      .post("/api/documents")
      .set(auth(editorToken, orgId))
      .send({ name: "RBAC Test Doc", documentType: "MANUAL" })
      .expect(201);
    const rbacDocId = docRes.body.id;
    const rev = await uploadRevision(editorToken, orgId, rbacDocId, "1.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(editorToken, orgId))
      .send({})
      .expect(201);
    await request(http).patch(`/api/documents/${rbacDocId}/revisions/${rev.id}/submit`).set(auth(editorToken, orgId)).expect(200);

    const editorApprove = await request(http)
      .patch(`/api/documents/${rbacDocId}/revisions/${rev.id}/approve`)
      .set(auth(editorToken, orgId));
    expect(editorApprove.status).toBe(403);

    // Publisher can approve and publish.
    await request(http).patch(`/api/documents/${rbacDocId}/revisions/${rev.id}/approve`).set(auth(publisherToken, orgId)).expect(200);
    const publisherPublish = await publish(publisherToken, orgId, rev.id);
    expect(publisherPublish.status).toBe(201);

    // Administrator can manage members (role change).
    const membership = inviteViewer.body;
    const roleChange = await request(http)
      .patch(`/api/organizations/${orgId}/members/${membership.id}`)
      .set(auth(adminToken, orgId))
      .send({ role: "EDITOR" })
      .expect(200);
    expect(roleChange.body.role).toBe("EDITOR");

    // Non-administrator cannot manage members.
    const editorManageAttempt = await request(http)
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(editorToken, orgId))
      .send({ email: "someone-else@test-manufacturer.example", role: "VIEWER" });
    expect(editorManageAttempt.status).toBe(403);
  });
});
