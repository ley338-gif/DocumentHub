import "../src/common/bigint-json-patch";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from "../src/common/global-prefix";
import { PrismaService } from "../src/prisma/prisma.service";

jest.setTimeout(60000);

describe("CSV unit import (spec §33-35)", () => {
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

  function uploadCsv(token: string, orgId: string, csv: string, filename = "units.csv") {
    return request(http)
      .post("/api/imports/units/preview")
      .set(auth(token, orgId))
      .attach("file", Buffer.from(csv, "utf-8"), { filename, contentType: "text/csv" });
  }

  let editorToken: string;
  let orgId: string;
  let productId: string;
  let productStableId: string;
  let variantId: string;
  let variantStableId: string;
  let batchId: string;
  let batchStableId: string;
  let otherProductId: string;
  let otherProductStableId: string;

  it("sets up organization, product, variant, and batch", async () => {
    editorToken = await registerAndLogin("owner@csv-import.example", "Passw0rd!", "Owner");
    const orgRes = await request(http).post("/api/organizations").set(auth(editorToken)).send({ name: "CSV Import Co" }).expect(201);
    orgId = orgRes.body.id;

    const productRes = await request(http)
      .post("/api/products")
      .set(auth(editorToken, orgId))
      .send({ name: "Widget", internalProductNumber: "WID-1" })
      .expect(201);
    productId = productRes.body.id;
    productStableId = productRes.body.stableId;

    const variantRes = await request(http)
      .post(`/api/products/${productId}/variants`)
      .set(auth(editorToken, orgId))
      .send({ name: "Standard", internalVariantNumber: "STD" })
      .expect(201);
    variantId = variantRes.body.id;
    variantStableId = variantRes.body.stableId;

    const batchRes = await request(http)
      .post("/api/batches")
      .set(auth(editorToken, orgId))
      .send({ productId, name: "2027-Q1" })
      .expect(201);
    batchId = batchRes.body.id;
    batchStableId = batchRes.body.stableId;

    const otherProductRes = await request(http)
      .post("/api/products")
      .set(auth(editorToken, orgId))
      .send({ name: "Gadget" })
      .expect(201);
    otherProductId = otherProductRes.body.id;
    otherProductStableId = otherProductRes.body.stableId;
    void otherProductId;
  });

  it("previews a small valid CSV without persisting anything", async () => {
    const csv = [
      "serialNumber,productReference,variantReference,batchReference,manufacturedAt,internalReference",
      `SN-P-000001,${productStableId},${variantStableId},${batchStableId},2024-01-15,ref-1`,
      `SN-P-000002,${productStableId},,,,`,
    ].join("\n");

    const before = await prisma.unit.count({ where: { organizationId: orgId } });
    const res = await uploadCsv(editorToken, orgId, csv).expect(201);

    expect(res.body.totalRows).toBe(2);
    expect(res.body.validRows).toHaveLength(2);
    expect(res.body.invalidRows).toHaveLength(0);
    expect(res.body.importId).toBeTruthy();
    expect(res.body.validRows[0].productId).toBe(productId);
    expect(res.body.validRows[0].variantId).toBe(variantId);
    expect(res.body.validRows[0].batchId).toBe(batchId);

    const after = await prisma.unit.count({ where: { organizationId: orgId } });
    expect(after).toBe(before); // preview must never persist
  });

  it("returns the raw header row and the auto-detected mapping alongside the preview, for an editable mapping-review UI step", async () => {
    const csv = ["serialNumber,productReference,Some Custom Column", `SN-MAP-000001,${productStableId},whatever`].join("\n");
    const res = await uploadCsv(editorToken, orgId, csv).expect(201);
    expect(res.body.headers).toEqual(["serialNumber", "productReference", "Some Custom Column"]);
    expect(res.body.columnMapping).toEqual({ serialNumber: 0, productReference: 1 });
    expect(res.body.unknownColumns).toEqual(["Some Custom Column"]);
  });

  it("a CSV whose headers auto-detection cannot recognize is rejected without an explicit mapping, then succeeds once one is supplied", async () => {
    const csv = ["Col A,Col B", `SN-OVERRIDE-000001,${productStableId}`].join("\n");

    const withoutMapping = await uploadCsv(editorToken, orgId, csv);
    expect(withoutMapping.status).toBe(400);
    expect(withoutMapping.body.error.code).toBe("FILE_VALIDATION_FAILED");
    // Even on rejection, the raw headers are attached so a mapping-review UI
    // step never has to re-parse the CSV itself (and risk disagreeing with
    // this service's own parsing of quoted/escaped header cells).
    expect(withoutMapping.body.error.details.headers).toEqual(["Col A", "Col B"]);
    expect(withoutMapping.body.error.details.columnMapping).toEqual({});

    const withMapping = await request(http)
      .post("/api/imports/units/preview")
      .set(auth(editorToken, orgId))
      .field("columnMapping", JSON.stringify({ serialNumber: 0, productReference: 1 }))
      .attach("file", Buffer.from(csv, "utf-8"), { filename: "units.csv", contentType: "text/csv" })
      .expect(201);

    expect(withMapping.body.totalRows).toBe(1);
    expect(withMapping.body.validRows).toHaveLength(1);
    expect(withMapping.body.validRows[0].serialNumber).toBe("SN-OVERRIDE-000001");
    expect(withMapping.body.columnMapping).toEqual({ serialNumber: 0, productReference: 1 });

    // The corrected mapping is real, not cosmetic — it commits like any
    // other validated preview.
    const commit = await request(http)
      .post(`/api/imports/units/${withMapping.body.importId}/commit`)
      .set(auth(editorToken, orgId))
      .expect(201);
    expect(commit.body.importedCount).toBe(1);
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { organizationId_serialNumber: { organizationId: orgId, serialNumber: "SN-OVERRIDE-000001" } },
    });
    expect(unit.productId).toBe(productId);
  });

  it("a rejection's attached headers reflect real CSV parsing (quoted header containing a comma), not a naive comma-split", async () => {
    // A quoted header cell containing a literal comma — a naive client-side
    // `line.split(",")` would misparse this into 3 cells instead of 2. The
    // service's real parseCsvText handles it correctly, and that's exactly
    // what gets attached to the rejection error for a mapping-review UI to
    // render — proving the UI never has to (and must not) re-implement CSV
    // parsing itself.
    const csv = ['"Ref, with comma",Other', "unmapped-serial,unmapped-product"].join("\n");
    const res = await uploadCsv(editorToken, orgId, csv);
    expect(res.status).toBe(400);
    expect(res.body.error.details.headers).toEqual(["Ref, with comma", "Other"]);
  });

  it("an override corrects a misdetected mapping even when both headers look auto-detectable", async () => {
    // Headers named correctly, but the two columns are actually swapped in
    // the data — the override tells the importer the true column for each
    // field, proving the override (not header-name auto-detection) is what
    // decides the result.
    const swapped = ["serialNumber,productReference", `${productStableId},SN-PARTIAL-000001`].join("\n");

    const res = await request(http)
      .post("/api/imports/units/preview")
      .set(auth(editorToken, orgId))
      .field("columnMapping", JSON.stringify({ serialNumber: 1, productReference: 0 }))
      .attach("file", Buffer.from(swapped, "utf-8"), { filename: "units.csv", contentType: "text/csv" })
      .expect(201);

    expect(res.body.validRows).toHaveLength(1);
    expect(res.body.validRows[0].serialNumber).toBe("SN-PARTIAL-000001");
    expect(res.body.validRows[0].productId).toBe(productId);
  });

  it("commits a previewed import, creating exactly the valid rows with serial decomposition computed", async () => {
    const csv = [
      "serial_number,product_reference",
      `SN-COMMIT-000010,${productStableId}`,
      `SN-COMMIT-000011,${productStableId}`,
    ].join("\n");

    const preview = await uploadCsv(editorToken, orgId, csv).expect(201);
    expect(preview.body.validRows).toHaveLength(2);

    const commit = await request(http)
      .post(`/api/imports/units/${preview.body.importId}/commit`)
      .set(auth(editorToken, orgId))
      .expect(201);
    expect(commit.body.importedCount).toBe(2);

    const unit = await prisma.unit.findUniqueOrThrow({
      where: { organizationId_serialNumber: { organizationId: orgId, serialNumber: "SN-COMMIT-000010" } },
    });
    expect(unit.serialPrefix).toBe("SN-COMMIT-");
    expect(unit.serialSequence.toString()).toBe("10");
    expect(unit.serialSeqLength).toBe(6);

    const auditEvents = await prisma.auditEvent.findMany({ where: { organizationId: orgId, action: "UNIT_IMPORTED" } });
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);
    const summarized = auditEvents.find((e) => (e.after as any)?.importId === preview.body.importId);
    expect(summarized).toBeTruthy();
    expect((summarized!.after as any).count).toBe(2);
  });

  it("rejects rows with a duplicate serial within the CSV itself", async () => {
    const csv = [
      "serialNumber,productReference",
      `SN-DUPE-000001,${productStableId}`,
      `SN-DUPE-000001,${productStableId}`,
      `SN-DUPE-000002,${productStableId}`,
    ].join("\n");

    const res = await uploadCsv(editorToken, orgId, csv).expect(201);
    expect(res.body.validRows).toHaveLength(1);
    expect(res.body.validRows[0].serialNumber).toBe("SN-DUPE-000002");
    expect(res.body.invalidRows).toHaveLength(2);
    for (const invalid of res.body.invalidRows) {
      expect(invalid.errors.some((e: string) => e.includes("more than once"))).toBe(true);
    }
  });

  it("rejects a serial that already exists in the organization", async () => {
    const seedCsv = ["serialNumber,productReference", `SN-EXIST-000001,${productStableId}`].join("\n");
    const seedPreview = await uploadCsv(editorToken, orgId, seedCsv).expect(201);
    await request(http).post(`/api/imports/units/${seedPreview.body.importId}/commit`).set(auth(editorToken, orgId)).expect(201);

    const dupeCsv = ["serialNumber,productReference", `SN-EXIST-000001,${productStableId}`].join("\n");
    const res = await uploadCsv(editorToken, orgId, dupeCsv).expect(201);
    expect(res.body.validRows).toHaveLength(0);
    expect(res.body.invalidRows).toHaveLength(1);
    expect(res.body.invalidRows[0].errors.some((e: string) => e.includes("already exists"))).toBe(true);
  });

  it("rejects an unknown product reference", async () => {
    const csv = ["serialNumber,productReference", "SN-UNKNOWN-1,does-not-exist"].join("\n");
    const res = await uploadCsv(editorToken, orgId, csv).expect(201);
    expect(res.body.validRows).toHaveLength(0);
    expect(res.body.invalidRows[0].errors.some((e: string) => e.includes("does not match any product"))).toBe(true);
  });

  it("rejects a variant/batch that belongs to a different product", async () => {
    const csv = [
      "serialNumber,productReference,variantReference",
      `SN-WRONGVARIANT-1,${otherProductStableId},${variantStableId}`,
    ].join("\n");
    const res = await uploadCsv(editorToken, orgId, csv).expect(201);
    expect(res.body.validRows).toHaveLength(0);
    expect(res.body.invalidRows[0].errors.some((e: string) => e.includes("does not belong to product"))).toBe(true);
  });

  it("handles a 5,000-row CSV end to end (preview -> commit) within a reasonable time", async () => {
    const lines = ["serialNumber,productReference"];
    for (let i = 1; i <= 5000; i++) {
      lines.push(`SN-BULK-${String(i).padStart(6, "0")},${productStableId}`);
    }
    const csv = lines.join("\n");

    const start = Date.now();
    const preview = await uploadCsv(editorToken, orgId, csv).expect(201);
    expect(preview.body.totalRows).toBe(5000);
    expect(preview.body.validRows).toHaveLength(5000);
    expect(preview.body.invalidRows).toHaveLength(0);

    const commit = await request(http)
      .post(`/api/imports/units/${preview.body.importId}/commit`)
      .set(auth(editorToken, orgId))
      .expect(201);
    const duration = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`CSV preview+commit of 5000 rows took ${duration}ms`);

    expect(commit.body.importedCount).toBe(5000);
    expect(duration).toBeLessThan(30000);

    const count = await prisma.unit.count({ where: { organizationId: orgId, serialPrefix: "SN-BULK-" } });
    expect(count).toBe(5000);
  });

  it("requires Editor role or higher", async () => {
    const viewerToken = await registerAndLogin("viewer@csv-import.example", "Passw0rd!", "Viewer");
    await request(http)
      .post(`/api/organizations/${orgId}/members`)
      .set(auth(editorToken, orgId))
      .send({ email: "viewer@csv-import.example", role: "VIEWER" })
      .expect(201);

    const csv = ["serialNumber,productReference", `SN-RBAC-1,${productStableId}`].join("\n");
    const res = await uploadCsv(viewerToken, orgId, csv);
    expect(res.status).toBe(403);
  });
});
