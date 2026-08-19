import "../src/common/bigint-json-patch";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from "../src/common/global-prefix";
import { ruleScopeMatches } from "../src/applicability/specificity";
import { toAppliedRuleSnapshot } from "../src/applicability/to-applied-rule-snapshot";
import { UnitContext } from "../src/applicability/applicability.types";

jest.setTimeout(60000);

const PDF_BUFFER = Buffer.from("%PDF-1.4\n%fake pdf content for tests\n");

describe("Publish preview hardening: isolation, RBAC, reproducibility, domain-primitive parity", () => {
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

  async function invite(adminToken: string, orgId: string, email: string, role: string) {
    const memberToken = await registerAndLogin(email, "Passw0rd!", "Member");
    const invitation = await request(http)
      .post(`/api/organizations/${orgId}/invitations`)
      .set(auth(adminToken, orgId))
      .send({ email, role })
      .expect(201);
    await request(http).post(`/api/invitations/${invitation.body.token}/accept`).set(auth(memberToken)).send({}).expect(201);
    return memberToken;
  }

  // ---------------------------------------------------------------------
  // Org A fixtures
  // ---------------------------------------------------------------------
  let adminToken: string;
  let orgAId: string;
  let productAId: string;
  let documentAId: string;

  it("sets up Org A with a product, 200 units (SN 000001-000200), and a document", async () => {
    adminToken = await registerAndLogin("owner@hardening-a.example", "Passw0rd!", "Owner A");
    const orgRes = await request(http).post("/api/organizations").set(auth(adminToken)).send({ name: "Hardening Org A" }).expect(201);
    orgAId = orgRes.body.id;

    const productRes = await request(http)
      .post("/api/products")
      .set(auth(adminToken, orgAId))
      .send({ name: "Gadget", modelDesignation: "G-1" })
      .expect(201);
    productAId = productRes.body.id;

    await prisma.unit.createMany({
      data: Array.from({ length: 200 }, (_, i) => {
        const n = i + 1;
        const serial = String(n).padStart(6, "0");
        return {
          organizationId: orgAId,
          productId: productAId,
          serialNumber: serial,
          serialPrefix: "",
          serialSequence: BigInt(n),
          serialSeqLength: 6,
        };
      }),
    });

    const docRes = await request(http).post("/api/documents").set(auth(adminToken, orgAId)).send({ name: "Manual", documentType: "MANUAL" }).expect(201);
    documentAId = docRes.body.id;
  });

  // -----------------------------------------------------------------------
  // #1 Affected Units — exact count matches the database, not "a number"
  // -----------------------------------------------------------------------
  it("#1 affected-units count equals the exact number of matching rows in the database", async () => {
    const rev = await uploadRevision(adminToken, orgAId, documentAId, "1.0", "DE");
    // SN 000050-000099 inclusive = exactly 50 units.
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ serialFrom: "000050", serialTo: "000099" })
      .expect(201);

    const dbCount = await prisma.unit.count({
      where: { organizationId: orgAId, productId: productAId, serialSequence: { gte: 50n, lte: 99n } },
    });
    expect(dbCount).toBe(50);

    const preview = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
    expect(preview.body.totalAffectedUnitsCount).toBe(dbCount);
    expect(preview.body.rules[0].affectedUnitsCount).toBe(dbCount);
    // Structured scope data, not just prose (raised in review).
    expect(preview.body.rules[0].scope.serialFrom).toBe("000050");
    expect(preview.body.rules[0].scope.serialTo).toBe("000099");
  });

  // -----------------------------------------------------------------------
  // #2 Range change — preview reflects the new range, not a cached one
  // -----------------------------------------------------------------------
  it("#2 changing the serial range updates the preview's affected-units count accordingly", async () => {
    const rev = await uploadRevision(adminToken, orgAId, documentAId, "1.1", "DE");
    const ruleRes = await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ serialFrom: "000001", serialTo: "000010" }) // 10 units
      .expect(201);
    const ruleId = ruleRes.body.id;

    const before = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
    expect(before.body.totalAffectedUnitsCount).toBe(10);

    await request(http)
      .patch(`/api/documents/revisions/${rev.id}/applicability-rules/${ruleId}`)
      .set(auth(adminToken, orgAId))
      .send({ serialFrom: "000001", serialTo: "000030" }) // now 30 units
      .expect(200);

    const after = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
    expect(after.body.totalAffectedUnitsCount).toBe(30);
    expect(after.body.rules[0].scope.serialTo).toBe("000030");
  });

  // -----------------------------------------------------------------------
  // #3 / #4 Conflict vs no-conflict — UI-visible conflict must correspond to
  // a real backend rejection, and an absence of conflict must really publish.
  // -----------------------------------------------------------------------
  it("#3 a conflict shown in preview corresponds exactly to a real publish rejection", async () => {
    const base = await uploadRevision(adminToken, orgAId, documentAId, "2.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${base.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ serialFrom: "000100", serialTo: "000150" })
      .expect(201);
    await submitApprove(adminToken, orgAId, documentAId, base.id);
    await request(http).post("/api/publications").set(auth(adminToken, orgAId)).send({ revisionId: base.id }).expect(201);

    const conflicting = await uploadRevision(adminToken, orgAId, documentAId, "2.1", "DE");
    await request(http)
      .post(`/api/documents/revisions/${conflicting.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ serialFrom: "000120", serialTo: "000160" }) // overlaps 100-150
      .expect(201);
    await submitApprove(adminToken, orgAId, documentAId, conflicting.id);

    const preview = await request(http).get(`/api/publications/preview/${conflicting.id}`).set(auth(adminToken, orgAId)).expect(200);
    expect(preview.body.conflicts.length).toBeGreaterThan(0);
    expect(preview.body.canPublish).toBe(false);
    const conflictingPublicationStableId = preview.body.conflicts[0].existingPublicationStableId;

    const publishRes = await request(http).post("/api/publications").set(auth(adminToken, orgAId)).send({ revisionId: conflicting.id });
    expect(publishRes.status).toBe(409);
    expect(publishRes.body.error.code).toBe("APPLICABILITY_CONFLICT");
    // The publication the preview named as conflicting must be a real ACTIVE publication.
    const activePub = await prisma.publication.findFirst({ where: { organizationId: orgAId, status: "ACTIVE", documentRevisionId: base.id } });
    expect(activePub?.stableId).toBe(conflictingPublicationStableId);
  });

  it("#4 no conflict in preview means the publish genuinely succeeds", async () => {
    const rev = await uploadRevision(adminToken, orgAId, documentAId, "3.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ serialFrom: "000170", serialTo: "000180" }) // untouched range so far
      .expect(201);
    await submitApprove(adminToken, orgAId, documentAId, rev.id);

    const preview = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
    expect(preview.body.conflicts).toHaveLength(0);
    expect(preview.body.canPublish).toBe(true);

    const publishRes = await request(http).post("/api/publications").set(auth(adminToken, orgAId)).send({ revisionId: rev.id });
    expect(publishRes.status).toBe(201);
    const pub = await prisma.publication.findUnique({ where: { id: publishRes.body.id } });
    expect(pub?.status).toBe("ACTIVE");
  });

  // -----------------------------------------------------------------------
  // #5 Specificity — a unit-level override does not conflict with a
  // product-level rule (different specificity tiers), and the preview
  // reports the override's real, narrow effective scope (1 unit).
  // -----------------------------------------------------------------------
  it("#5 preview explains a unit-level override's effective scope correctly against a product-level rule", async () => {
    const docRes = await request(http).post("/api/documents").set(auth(adminToken, orgAId)).send({ name: "Override Manual", documentType: "MANUAL" }).expect(201);
    const docId = docRes.body.id;

    const productRuleRev = await uploadRevision(adminToken, orgAId, docId, "1.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${productRuleRev.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ productId: productAId })
      .expect(201);
    await submitApprove(adminToken, orgAId, docId, productRuleRev.id);
    await request(http).post("/api/publications").set(auth(adminToken, orgAId)).send({ revisionId: productRuleRev.id }).expect(201);

    const targetUnit = await prisma.unit.findUniqueOrThrow({ where: { organizationId_serialNumber: { organizationId: orgAId, serialNumber: "000001" } } });

    const unitRuleRev = await uploadRevision(adminToken, orgAId, docId, "1.1", "DE");
    await request(http)
      .post(`/api/documents/revisions/${unitRuleRev.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ unitId: targetUnit.id })
      .expect(201);
    await submitApprove(adminToken, orgAId, docId, unitRuleRev.id);

    const preview = await request(http).get(`/api/publications/preview/${unitRuleRev.id}`).set(auth(adminToken, orgAId)).expect(200);
    // Different specificity tiers (200 vs 600) never conflict — the override
    // simply wins for that one unit at resolution time; verified separately
    // by the acceptance suite's real resolver test (spec §76). Here we only
    // check the preview reports this correctly:
    expect(preview.body.conflicts).toHaveLength(0);
    expect(preview.body.canPublish).toBe(true);
    expect(preview.body.rules[0].specificity).toBe(600);
    expect(preview.body.rules[0].affectedUnitsCount).toBe(1);
    expect(preview.body.rules[0].scope.unitId).toBe(targetUnit.id);
    expect(preview.body.rules[0].scope.unitSerialNumber).toBe("000001");

    await request(http).post("/api/publications").set(auth(adminToken, orgAId)).send({ revisionId: unitRuleRev.id }).expect(201);
  });

  // -----------------------------------------------------------------------
  // #6 Tenant isolation — an IDOR attempt against another org's revision
  // must reveal nothing, not even existence.
  // -----------------------------------------------------------------------
  it("#6 an org B user cannot preview an org A revision by guessing/reusing its id (IDOR)", async () => {
    const rev = await uploadRevision(adminToken, orgAId, documentAId, "9.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ serialFrom: "000001", serialTo: "000200" })
      .expect(201);

    const orgBAdminToken = await registerAndLogin("owner@hardening-b.example", "Passw0rd!", "Owner B");
    const orgBRes = await request(http).post("/api/organizations").set(auth(orgBAdminToken)).send({ name: "Hardening Org B" }).expect(201);
    const orgBId = orgBRes.body.id;

    // Real revision id from Org A, presented with Org B's own valid token
    // AND Org B's own X-Organization-Id — TenantGuard resolves the caller's
    // membership from the header, but PublishPreviewService itself must
    // still scope the DB lookup by that organizationId, not trust the id
    // alone. This must 404, not 403 with any distinguishing detail, and
    // certainly not 200 with Org A's data.
    const res = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(orgBAdminToken, orgBId));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(res.body)).not.toContain("000001");
    expect(JSON.stringify(res.body)).not.toContain(orgAId);

    // Sanity: the same call with the correct org header still works.
    await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
  });

  // -----------------------------------------------------------------------
  // #7 Permissions — Viewer forbidden, Editor allowed, Publisher allowed.
  // -----------------------------------------------------------------------
  it("#7 permission matrix: Viewer 403, Editor 200, Publisher 200", async () => {
    const rev = await uploadRevision(adminToken, orgAId, documentAId, "10.0", "DE");

    const viewerToken = await invite(adminToken, orgAId, "viewer@hardening-a.example", "VIEWER");
    const editorToken = await invite(adminToken, orgAId, "editor@hardening-a.example", "EDITOR");
    const publisherToken = await invite(adminToken, orgAId, "publisher@hardening-a.example", "PUBLISHER");

    await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(viewerToken, orgAId)).expect(403);
    await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(editorToken, orgAId)).expect(200);
    await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(publisherToken, orgAId)).expect(200);
  });

  // -----------------------------------------------------------------------
  // #8 Reload reproducibility — calling preview twice with no changes in
  // between yields byte-identical results.
  // -----------------------------------------------------------------------
  it("#8 calling preview twice in a row without changes is reproducible", async () => {
    const rev = await uploadRevision(adminToken, orgAId, documentAId, "11.0", "DE");
    await request(http)
      .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
      .set(auth(adminToken, orgAId))
      .send({ variantId: undefined, serialFrom: "000005", serialTo: "000015" })
      .expect(201);

    const first = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
    const second = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
    expect(second.body).toEqual(first.body);
  });

  // -----------------------------------------------------------------------
  // Domain-primitive parity: the DB-query path used by countAffectedUnits
  // (affected-units.ts) must agree with the pure predicate used everywhere
  // else (ruleScopeMatches, from specificity.ts) — same primitive, two
  // execution strategies (SQL WHERE vs in-memory), independently
  // cross-checked so they cannot silently drift apart.
  // -----------------------------------------------------------------------
  it("countAffectedUnits (SQL) agrees with ruleScopeMatches (pure predicate) over the same units and rules", async () => {
    const docRes = await request(http).post("/api/documents").set(auth(adminToken, orgAId)).send({ name: "Parity Check", documentType: "MANUAL" }).expect(201);
    const docId = docRes.body.id;
    const rev = await uploadRevision(adminToken, orgAId, docId, "1.0", "DE");

    const testRanges: [string, string][] = [
      ["000001", "000050"],
      ["000051", "000100"],
      ["000175", "000200"],
      ["000001", "000200"],
    ];

    for (const [from, to] of testRanges) {
      const ruleRes = await request(http)
        .post(`/api/documents/revisions/${rev.id}/applicability-rules`)
        .set(auth(adminToken, orgAId))
        .send({ serialFrom: from, serialTo: to })
        .expect(201);

      const liveRule = await prisma.applicabilityRule.findUniqueOrThrow({ where: { id: ruleRes.body.id } });
      const snapshot = toAppliedRuleSnapshot(liveRule);

      const allUnits = await prisma.unit.findMany({ where: { organizationId: orgAId, productId: productAId } });
      const expectedByPurePredicate = allUnits.filter((unit) => {
        const context: UnitContext = {
          unitId: unit.id,
          productId: unit.productId,
          productFamilyId: null,
          variantId: unit.variantId,
          batchId: unit.batchId,
          parsedSerial: { prefix: unit.serialPrefix, sequence: unit.serialSequence, sequenceLength: unit.serialSeqLength },
        };
        return ruleScopeMatches(snapshot, context, new Date());
      }).length;

      const dbCount = await prisma.unit.count({
        where: {
          organizationId: orgAId,
          serialPrefix: "",
          serialSequence: { gte: liveRule.serialFromSequence ?? undefined, lte: liveRule.serialToSequence ?? undefined },
        },
      });

      expect(dbCount).toBe(expectedByPurePredicate);

      // And the actual preview endpoint (which drives affected-units.ts,
      // the SQL-side implementation) must report the same number too.
      const preview = await request(http).get(`/api/publications/preview/${rev.id}`).set(auth(adminToken, orgAId)).expect(200);
      const thisRule = preview.body.rules.find((r: any) => r.ruleId === ruleRes.body.id);
      expect(thisRule.affectedUnitsCount).toBe(expectedByPurePredicate);

      await request(http).delete(`/api/documents/revisions/${rev.id}/applicability-rules/${ruleRes.body.id}`).set(auth(adminToken, orgAId)).expect(200);
    }
  });
});
