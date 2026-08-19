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

describe("Publish preview distinguishes ALREADY_PUBLISHED from a real CONFLICT", () => {
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
  let documentId: string;

  it("sets up an organization, product, and document", async () => {
    adminToken = await registerAndLogin("owner@already-published.example", "Passw0rd!", "Owner");
    const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Already Published Org" }).expect(201);
    orgId = orgRes.body.id;

    const productRes = await request(http).post("/api/products").set(auth(adminToken, orgId)).send({ name: "Thing", modelDesignation: "T-1" }).expect(201);
    const productId = productRes.body.id;

    await prisma.unit.createMany({
      data: Array.from({ length: 20 }, (_, i) => {
        const n = i + 1;
        const serial = String(n).padStart(6, "0");
        return { organizationId: orgId, productId, serialNumber: serial, serialPrefix: "", serialSequence: BigInt(n), serialSeqLength: 6 };
      }),
    });

    const docRes = await request(http).post("/api/documents").set(auth(adminToken, orgId)).send({ name: "Manual", documentType: "MANUAL" }).expect(201);
    documentId = docRes.body.id;
  });

  it("a real CONFLICT (different revision) is reported with reason CONFLICT", async () => {
    const first = await uploadRevision(adminToken, orgId, documentId, "1.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${first.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "000001", serialTo: "000010" })
      .expect(201);
    await submitApprove(adminToken, orgId, documentId, first.id);
    await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: first.id }).expect(201);

    const second = await uploadRevision(adminToken, orgId, documentId, "1.1", "DE");
    await request(http)
      .post(`/api/documents/revisions/${second.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "000005", serialTo: "000015" }) // overlaps 1.0's range
      .expect(201);
    await submitApprove(adminToken, orgId, documentId, second.id);

    const preview = await request(http).get(`/api/publications/preview/${second.id}`).set(auth(adminToken, orgId)).expect(200);
    expect(preview.body.conflicts).toHaveLength(1);
    expect(preview.body.conflicts[0].reason).toBe("CONFLICT");
    expect(preview.body.canPublish).toBe(false);

    // The real publish still rejects it too — the distinction is presentation-only.
    const publishRes = await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: second.id });
    expect(publishRes.status).toBe(409);
  });

  it("re-previewing an already-published revision with an unchanged rule set is reported with reason ALREADY_PUBLISHED, not CONFLICT", async () => {
    const rev = await uploadRevision(adminToken, orgId, documentId, "2.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ serialFrom: "000016", serialTo: "000020" }) // untouched range
      .expect(201);
    await submitApprove(adminToken, orgId, documentId, rev.id);
    const publishRes = await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: rev.id });
    expect(publishRes.status).toBe(201);

    // Preview the SAME revision again, now that it's already ACTIVE.
    const preview = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgId)).expect(200);
    expect(preview.body.conflicts).toHaveLength(1);
    expect(preview.body.conflicts[0].reason).toBe("ALREADY_PUBLISHED");
    expect(preview.body.conflicts[0].existingPublicationStableId).toBe(publishRes.body.stableId);
    // Still correctly reflects that a second identical publish would be
    // rejected by the real endpoint — this is not "safe to publish", it's
    // "already done", and the real POST would 409 too:
    expect(preview.body.canPublish).toBe(false);
    const secondAttempt = await request(http).post("/api/publications").set(auth(adminToken, orgId)).send({ revisionId: rev.id });
    expect(secondAttempt.status).toBe(409);
  });
});
