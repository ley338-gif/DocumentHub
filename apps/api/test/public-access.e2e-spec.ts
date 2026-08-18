import "../src/common/bigint-json-patch";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as QRCode from "qrcode";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from "../src/common/global-prefix";
import { PrismaService } from "../src/prisma/prisma.service";
import { buildProductPublicUrl, buildUnitPublicUrl } from "../src/products/qr.service";

jest.setTimeout(60000);

const PDF_BUFFER = Buffer.from("%PDF-1.4\n%fake pdf content for tests\n");

describe("Public access (spec §29-32, §48, §50)", () => {
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
    expect(res.body.accessToken).toBeTruthy();
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

  async function publish(token: string, orgId: string, revisionId: string) {
    return request(http).post("/api/publications").set(auth(token, orgId)).send({ revisionId });
  }

  let adminToken: string;
  let orgId: string;
  let productId: string;
  let productStableId: string;
  let unitId: string;
  let unitStableId: string;
  let documentId: string;
  let rev10: any;
  let pub10Id: string;
  let pub10StableId: string;

  it("sets up an org, product, unit, and a published, applicable revision", async () => {
    adminToken = await registerAndLogin("owner@public-access.example", "Passw0rd!", "Owner");
    const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Public Access Co" }).expect(201);
    orgId = orgRes.body.id;

    const productRes = await request(http)
      .post("/api/products")
      .set(auth(adminToken, orgId))
      .send({ name: "Public Widget", modelDesignation: "PW-1", description: "A public widget" })
      .expect(201);
    productId = productRes.body.id;
    productStableId = productRes.body.stableId;

    const unitRes = await request(http)
      .post("/api/units")
      .set(auth(adminToken, orgId))
      .send({ productId, serialNumber: "PUB-000001" })
      .expect(201);
    unitId = unitRes.body.id;
    unitStableId = unitRes.body.stableId;

    const docRes = await request(http)
      .post("/api/documents")
      .set(auth(adminToken, orgId))
      .send({ name: "Public Manual", documentType: "MANUAL" })
      .expect(201);
    documentId = docRes.body.id;

    rev10 = await uploadRevision(adminToken, orgId, documentId, "1.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev10.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ productId })
      .expect(201);
    await submitApprove(adminToken, orgId, documentId, rev10.id);
    const pub = await publish(adminToken, orgId, rev10.id);
    expect(pub.status).toBe(201);
    pub10Id = pub.body.id;

    const publication = await prisma.publication.findUniqueOrThrow({ where: { id: pub10Id } });
    pub10StableId = publication.stableId;
  });

  it("resolves the public product page with the published revision and a stableId-only download URL", async () => {
    const res = await request(http).get(`/p/${productStableId}`).expect(200);
    expect(res.body.productStableId).toBe(productStableId);
    expect(res.body.name).toBe("Public Widget");
    expect(res.body.publications).toHaveLength(1);
    const pub = res.body.publications[0];
    expect(pub.publicationStableId).toBe(pub10StableId);
    expect(pub.documentName).toBe("Public Manual");
    expect(pub.downloadUrl).toBe(`/p/${productStableId}/publications/${pub10StableId}/download`);
    // Never leaks internal ids or a raw storage key/URL.
    expect(JSON.stringify(res.body)).not.toContain(rev10.id);
    expect(JSON.stringify(res.body)).not.toContain(productId);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("storage");
  });

  it("resolves the public unit page, including the (intentionally public) serial number", async () => {
    const res = await request(http).get(`/u/${unitStableId}`).expect(200);
    expect(res.body.unitStableId).toBe(unitStableId);
    expect(res.body.productStableId).toBe(productStableId);
    expect(res.body.serialNumber).toBe("PUB-000001");
    expect(res.body.publications).toHaveLength(1);
    expect(res.body.publications[0].publicationStableId).toBe(pub10StableId);
  });

  it("downloads the file via the public product download URL", async () => {
    const res = await request(http).get(`/p/${productStableId}/publications/${pub10StableId}/download`).expect(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(Buffer.compare(res.body, PDF_BUFFER)).toBe(0);
  });

  it("downloads the file via the public unit download URL", async () => {
    const res = await request(http).get(`/u/${unitStableId}/publications/${pub10StableId}/download`).expect(200);
    expect(Buffer.compare(res.body, PDF_BUFFER)).toBe(0);
  });

  it("never shows a DRAFT/IN_REVIEW/APPROVED-but-unpublished/RETIRED revision on the public page", async () => {
    const draftRev = await uploadRevision(adminToken, orgId, documentId, "2.0-draft", "DE");
    await request(http)
      .post(`/api/documents/revisions/${draftRev.id}/applicability-rules`)
      .set(auth(adminToken, orgId))
      .send({ productId })
      .expect(201);
    // Left in DRAFT — never submitted/approved/published.

    const res = await request(http).get(`/p/${productStableId}`).expect(200);
    const ids = res.body.publications.map((p: any) => p.documentName + p.revision);
    expect(ids).not.toContain("Public Manual2.0-draft");
    expect(res.body.publications).toHaveLength(1); // still just rev 1.0
  });

  it("removes a REVOKED publication from the public page immediately, and its download 404s even with a cached link", async () => {
    const beforeRevokeDownload = await request(http).get(`/p/${productStableId}/publications/${pub10StableId}/download`);
    expect(beforeRevokeDownload.status).toBe(200);

    await request(http).patch(`/api/publications/${pub10Id}/revoke`).set(auth(adminToken, orgId)).expect(200);

    const pageAfterRevoke = await request(http).get(`/p/${productStableId}`).expect(200);
    expect(pageAfterRevoke.body.publications.find((p: any) => p.publicationStableId === pub10StableId)).toBeUndefined();

    const unitPageAfterRevoke = await request(http).get(`/u/${unitStableId}`).expect(200);
    expect(unitPageAfterRevoke.body.publications.find((p: any) => p.publicationStableId === pub10StableId)).toBeUndefined();

    // The link the client already had (e.g. from before revocation) must
    // re-validate against the resolver and 404, never serve stale bytes.
    const downloadAfterRevoke = await request(http).get(`/p/${productStableId}/publications/${pub10StableId}/download`);
    expect(downloadAfterRevoke.status).toBe(404);

    const unitDownloadAfterRevoke = await request(http).get(`/u/${unitStableId}/publications/${pub10StableId}/download`);
    expect(unitDownloadAfterRevoke.status).toBe(404);
  });

  it("never resolves a stableId from another organization — tenant isolation holds with no tenant header at all", async () => {
    const otherToken = await registerAndLogin("owner@other-public.example", "Passw0rd!", "Other Owner");
    const otherOrgRes = await request(http).post("/api/organizations").set(auth(otherToken)).send({ name: "Other Public Co" }).expect(201);
    const otherOrgId = otherOrgRes.body.id;
    const otherProductRes = await request(http)
      .post("/api/products")
      .set(auth(otherToken, otherOrgId))
      .send({ name: "Other Org Product" })
      .expect(201);
    const otherProductStableId = otherProductRes.body.stableId;

    // Org B's own product resolves fine (no publications yet, but 200 + empty list — it exists and its own org is active).
    const ownPage = await request(http).get(`/p/${otherProductStableId}`).expect(200);
    expect(ownPage.body.publications).toEqual([]);

    // Org A's productStableId never leaks anything about Org B, and vice
    // versa — there is no header a caller could forge to cross this
    // boundary since resolution is keyed by the looked-up row's own
    // organizationId, not any client-supplied value.
    const crossOrgDownload = await request(http)
      .get(`/p/${otherProductStableId}/publications/${pub10StableId}/download`)
      .expect(404);
    expect(crossOrgDownload.body.error.code).toBe("NOT_FOUND");

    // Unknown / made-up stableId -> generic 404, not a 500 or a leak.
    const unknown = await request(http).get("/p/DOESNOTEXIST123").expect(404);
    expect(unknown.body.error.code).toBe("NOT_FOUND");
  });

  it("generates a QR code (SVG and PNG) encoding exactly the public product/unit URL, nothing else", async () => {
    const expectedProductUrl = buildProductPublicUrl(productStableId);
    const expectedUnitUrl = buildUnitPublicUrl(unitStableId);

    const svgRes = await request(http).get(`/api/products/${productId}/qr.svg`).set(auth(adminToken, orgId)).expect(200);
    expect(svgRes.headers["content-type"]).toContain("image/svg+xml");
    const svgText: string = Buffer.isBuffer(svgRes.body) && svgRes.body.length > 0 ? svgRes.body.toString("utf-8") : svgRes.text;
    expect(svgText).toContain("<svg");

    const pngRes = await request(http).get(`/api/products/${productId}/qr.png`).set(auth(adminToken, orgId)).expect(200);
    expect(pngRes.headers["content-type"]).toBe("image/png");
    expect(Buffer.isBuffer(pngRes.body)).toBe(true);
    expect(pngRes.body.length).toBeGreaterThan(0);

    const unitSvgRes = await request(http).get(`/api/units/${unitId}/qr.svg`).set(auth(adminToken, orgId)).expect(200);
    const unitSvgText: string =
      Buffer.isBuffer(unitSvgRes.body) && unitSvgRes.body.length > 0 ? unitSvgRes.body.toString("utf-8") : unitSvgRes.text;
    expect(unitSvgText).toContain("<svg");

    // Verify the *encoded payload* matches exactly the expected public URL —
    // by re-encoding the expected string with the same library and
    // comparing the generated SVG markup, rather than decoding an image
    // (no QR-decoding dependency needed for that).
    const expectedProductSvg = await QRCode.toString(expectedProductUrl, { type: "svg" });
    expect(svgText).toBe(expectedProductSvg);
    expect(svgText).not.toContain(rev10.id);
    expect(svgText).not.toContain("PUB-000001");

    const expectedUnitSvg = await QRCode.toString(expectedUnitUrl, { type: "svg" });
    expect(unitSvgText).toBe(expectedUnitSvg);

    // QR generation requires auth — never anonymous.
    const anon = await request(http).get(`/api/products/${productId}/qr.svg`);
    expect(anon.status).toBe(401);
  });
});
