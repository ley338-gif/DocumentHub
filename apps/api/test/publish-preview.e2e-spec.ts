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

describe("Publish preview (spec §46-47, §63-65)", () => {
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
  let productId: string;
  let documentId: string;

  it("sets up an organization, product, and 100 units (SN 000001-000100)", async () => {
    adminToken = await registerAndLogin("owner@preview-test.example", "Passw0rd!", "Owner");
    const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Preview Test Org" }).expect(201);
    orgId = orgRes.body.id;

    const productRes = await request(http)
      .post("/api/products")
      .set(auth(adminToken, orgId))
      .send({ name: "Widget", modelDesignation: "W-1" })
      .expect(201);
    productId = productRes.body.id;

    await prisma.unit.createMany({
      data: Array.from({ length: 100 }, (_, i) => {
        const serial = String(i + 1).padStart(6, "0");
        return {
          organizationId: orgId,
          productId,
          serialNumber: serial,
          serialPrefix: "",
          serialSequence: BigInt(i + 1),
          serialSeqLength: 6,
        };
      }),
    });

    const docRes = await request(http).post("/api/documents").set(auth(adminToken, orgId)).send({ name: "Manual", documentType: "MANUAL" }).expect(201);
    documentId = docRes.body.id;
  });

  it("reports affected units and a plain-language description for a ranged rule, and blocks publish until approved", async () => {
    const rev = await uploadRevision(adminToken, orgId, documentId, "1.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "000001", serialTo: "000050" })
      .expect(201);

    const previewBeforeApproval = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgId)).expect(200);
    expect(previewBeforeApproval.body.revisionStatus).toBe("DRAFT");
    expect(previewBeforeApproval.body.canPublish).toBe(false); // not APPROVED yet
    expect(previewBeforeApproval.body.totalAffectedUnitsCount).toBe(50);
    expect(previewBeforeApproval.body.rules).toHaveLength(1);
    expect(previewBeforeApproval.body.rules[0].affectedUnitsCount).toBe(50);
    expect(previewBeforeApproval.body.rules[0].description).toContain("Seriennummer 000001–000050");
    expect(previewBeforeApproval.body.conflicts).toHaveLength(0);

    await submitApprove(adminToken, orgId, documentId, rev.id);
    const previewAfterApproval = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgId)).expect(200);
    expect(previewAfterApproval.body.revisionStatus).toBe("APPROVED");
    expect(previewAfterApproval.body.canPublish).toBe(true);

    await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: rev.id }).expect(201);
  });

  it("surfaces the same conflict the real publish would reject, before the publish call is even made", async () => {
    const conflicting = await uploadRevision(adminToken, orgId, documentId, "1.1", "DE");
    await request(http)
      .post(`/api/documents/revisions/${conflicting.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "000030", serialTo: "000080" }) // overlaps 1.0's 000001-000050
      .expect(201);
    await submitApprove(adminToken, orgId, documentId, conflicting.id);

    const preview = await request(http).get(`/api/publications/preview/${conflicting.id}`).set(auth(adminToken, orgId)).expect(200);
    expect(preview.body.canPublish).toBe(false);
    expect(preview.body.conflicts.length).toBeGreaterThan(0);
    expect(preview.body.totalAffectedUnitsCount).toBe(51); // 000030-000080 inclusive

    const publishRes = await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: conflicting.id });
    expect(publishRes.status).toBe(409);
    expect(publishRes.body.error.code).toBe("APPLICABILITY_CONFLICT");
  });

  it("a Viewer (below Editor) is rejected by the preview endpoint, and an unauthenticated caller too", async () => {
    const rev = await uploadRevision(adminToken, orgId, documentId, "2.0", "DE");

    const viewerToken = await registerAndLogin("viewer@preview-test.example", "Passw0rd!", "Viewer");
    const invitation = await request(http)
      .post(`/api/organizations/${orgId}/invitations`)
      .set(auth(adminToken, orgId))
      .send({ email: "viewer@preview-test.example", role: "VIEWER" })
      .expect(201);
    await request(http).post(`/api/invitations/${invitation.body.token}/accept`).set(auth(viewerToken)).send({}).expect(201);

    await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(viewerToken, orgId)).expect(403);

    await request(http).get(`/api/publications/preview/${rev.id}`).expect(401);
  });
});
