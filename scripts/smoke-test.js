#!/usr/bin/env node
// Document Hub end-to-end smoke test — exercises the real documented
// product flow over plain HTTP (never Prisma/SQL directly) against a
// running deployment: bootstrap admin -> tenant -> invite -> accept ->
// product -> unit -> document -> revision -> applicability -> preview ->
// approve -> publish -> public QR page -> public download.
//
// Two modes:
//   node scripts/smoke-test.js seed <state-file>    creates fresh data,
//     writes every ID/URL/hash needed to verify it later to <state-file>.
//   node scripts/smoke-test.js verify <state-file>  re-reads <state-file>
//     and re-checks every one of those facts still holds (login works,
//     the publication snapshot/SHA-256/download/historical resolution/
//     audit trail are all intact) — this is the second half of a real
//     backup/restore acceptance test (see docs/backup-restore.md): seed,
//     back up, destroy, restore, verify.
//
// Config via env: API_BASE_URL (default http://localhost:3000),
// BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD (must match whatever you
// ran scripts/bootstrap-platform-admin with).

const API = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";

const fs = require("fs");
const crypto = require("crypto");

function log(msg) {
  process.stdout.write(`[smoke-test] ${msg}\n`);
}

// A minimal but structurally valid single-page PDF (plain ASCII, no
// compression/binary streams) so byte-for-byte comparison after
// download/restore never has to worry about text-vs-binary encoding.
function makeMinimalPdf(text) {
  const escaped = text.replace(/[()\\]/g, (c) => `\\${c}`);
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    `4 0 obj<</Length ${escaped.length + 40}>>stream\nBT /F1 10 Tf 10 100 Td (${escaped}) Tj ET\nendstream endobj`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

async function req(path, { method = "GET", token, body, isForm = false } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let payload = body;
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function seed(stateFile) {
  if (!ADMIN_PASSWORD) throw new Error("BOOTSTRAP_ADMIN_PASSWORD is required");

  log("Logging in as platform admin...");
  const { accessToken: platformToken } = await req("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  const suffix = Date.now();
  const tenantAdminEmail = `smoketest-tenant-admin-${suffix}@example.com`;
  const tenantAdminPassword = "SmokeTestPassw0rd!";

  log("Creating tenant...");
  const { tenant, invitationToken } = await req("/api/platform/tenants", {
    method: "POST",
    token: platformToken,
    body: { name: `Smoke Test Tenant ${suffix}`, adminEmail: tenantAdminEmail },
  });

  log("Accepting tenant admin invitation...");
  const { accessToken: tenantToken } = await req(`/api/invitations/${invitationToken}/accept`, {
    method: "POST",
    body: { fullName: "Smoke Test Admin", password: tenantAdminPassword },
  });
  async function tenantReq(path, { method = "GET", body, isForm = false } = {}) {
    const headers = { Authorization: `Bearer ${tenantToken}`, "X-Organization-Id": tenant.id };
    let payload = body;
    if (body && !isForm) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, { method, headers, body: payload });
    const contentType = res.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
    return data;
  }

  log("Creating product...");
  const product = await tenantReq("/api/products", { method: "POST", body: { name: `Smoke Widget ${suffix}` } });

  log("Creating unit...");
  const unit = await tenantReq("/api/units", {
    method: "POST",
    body: { productId: product.id, serialNumber: `SN-SMOKE-${suffix}` },
  });

  log("Creating document...");
  const document = await tenantReq("/api/documents", {
    method: "POST",
    body: { name: `Smoke Manual ${suffix}`, documentType: "MANUAL" },
  });

  log("Uploading revision file...");
  // Only application/pdf is an accepted revision MIME type (see
  // ALLOWED_MIME_TYPES in revisions.service.ts) — a minimal but genuinely
  // valid single-page PDF, with a nonce in its text stream so each seed run
  // produces distinct bytes/SHA-256.
  const fileContent = makeMinimalPdf(`Smoke test manual, generated ${new Date().toISOString()}, nonce ${suffix}`);
  const sha256 = crypto.createHash("sha256").update(fileContent).digest("hex");
  const form = new FormData();
  form.append("revision", "A");
  form.append("language", "de");
  form.append("file", new Blob([fileContent], { type: "application/pdf" }), "manual.pdf");
  const revisionRes = await fetch(`${API}/api/documents/${document.id}/revisions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tenantToken}`, "X-Organization-Id": tenant.id },
    body: form,
  });
  const revision = await revisionRes.json();
  if (!revisionRes.ok) throw new Error(`revision upload failed: ${JSON.stringify(revision)}`);
  if (revision.sha256 !== sha256) {
    throw new Error(`SHA-256 mismatch immediately after upload: expected ${sha256}, got ${revision.sha256}`);
  }

  log("Adding applicability rule (whole product)...");
  await tenantReq(`/api/documents/revisions/${revision.id}/applicability-rules`, {
    method: "POST",
    body: { productId: product.id },
  });

  log("Preview (before approval — conflicts/applicability only, publish not yet allowed)...");
  await tenantReq(`/api/publications/preview/${revision.id}`);

  log("Submitting + approving revision...");
  await tenantReq(`/api/documents/${document.id}/revisions/${revision.id}/submit`, { method: "PATCH" });
  await tenantReq(`/api/documents/${document.id}/revisions/${revision.id}/approve`, { method: "PATCH" });

  log("Preview (after approval — must now allow publish)...");
  const preview = await tenantReq(`/api/publications/preview/${revision.id}`);
  if (!preview.canPublish) {
    throw new Error(`preview says this approved revision cannot be published: ${JSON.stringify(preview)}`);
  }

  log("Publishing...");
  const publication = await tenantReq("/api/publications", { method: "POST", body: { revisionId: revision.id } });

  log("Resolving public unit page...");
  const publicUnitPage = await req(`/u/${unit.stableId}`);
  const publicPub = publicUnitPage.publications?.find((p) => p.publicationStableId === publication.stableId);
  if (!publicPub) throw new Error("published publication not visible on public unit page");

  log("Downloading via public route...");
  const downloadRes = await fetch(`${API}${publicPub.downloadUrl}`);
  if (!downloadRes.ok) throw new Error(`public download failed: ${downloadRes.status}`);
  const downloaded = await downloadRes.text();
  const downloadedSha = crypto.createHash("sha256").update(downloaded).digest("hex");
  if (downloadedSha !== sha256) throw new Error("downloaded content SHA-256 does not match upload");

  log("Checking tenant audit trail...");
  const audit = await tenantReq("/api/audit?pageSize=50");
  const publishEvent = audit.items?.find((e) => e.action === "PUBLICATION_CREATED" && e.objectId === publication.id);
  if (!publishEvent) throw new Error("no PUBLICATION_CREATED audit event found for this publication");

  const state = {
    createdAt: new Date().toISOString(),
    tenant: { id: tenant.id, name: tenant.name },
    tenantAdmin: { email: tenantAdminEmail, password: tenantAdminPassword },
    product: { id: product.id },
    unit: { id: unit.id, stableId: unit.stableId, serialNumber: unit.serialNumber },
    document: { id: document.id },
    revision: { id: revision.id, sha256 },
    publication: { id: publication.id, stableId: publication.stableId },
    fileContent,
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  log(`Seed complete. State written to ${stateFile}`);
  log(`  Tenant:      ${tenant.name} (${tenant.id})`);
  log(`  Unit:        ${unit.serialNumber} / stableId ${unit.stableId}`);
  log(`  Public page: ${API.replace(":3000", ":8080")}/u/${unit.stableId}`);
}

async function verify(stateFile) {
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  let failures = 0;
  function check(label, cond) {
    if (cond) {
      log(`  PASS  ${label}`);
    } else {
      log(`  FAIL  ${label}`);
      failures += 1;
    }
  }

  log(`Verifying seeded state from ${stateFile} (created ${state.createdAt})...`);

  log("Platform admin login...");
  const { accessToken: platformToken } = await req("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  }).catch((e) => {
    check("platform admin login", false);
    throw e;
  });
  check("platform admin login", !!platformToken);

  log("Tenant admin login...");
  let tenantToken;
  try {
    ({ accessToken: tenantToken } = await req("/api/auth/login", {
      method: "POST",
      body: { email: state.tenantAdmin.email, password: state.tenantAdmin.password },
    }));
    check("tenant admin login", !!tenantToken);
  } catch (e) {
    check("tenant admin login", false);
  }

  function withOrg(path) {
    return fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${tenantToken}`, "X-Organization-Id": state.tenant.id },
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));
  }

  if (tenantToken) {
    const tenantDetail = await req(`/api/platform/tenants/${state.tenant.id}`, { token: platformToken }).catch(() => null);
    check("tenant still exists", !!tenantDetail && tenantDetail.id === state.tenant.id);

    const unitRes = await withOrg(`/api/units?serialNumber=${encodeURIComponent(state.unit.serialNumber)}`);
    const foundUnit = unitRes.ok && unitRes.body.items?.find((u) => u.id === state.unit.id);
    check("unit still exists (found by serialNumber lookup)", !!foundUnit);

    const revisionRes = await withOrg(`/api/documents/${state.document.id}/revisions/${state.revision.id}`);
    check("revision still exists", revisionRes.ok);
    check("revision SHA-256 unchanged", revisionRes.ok && revisionRes.body.sha256 === state.revision.sha256);

    const pubRes = await withOrg(`/api/publications/${state.publication.id}`);
    check("publication snapshot still exists and is ACTIVE", pubRes.ok && pubRes.body.status === "ACTIVE");

    const auditRes = await withOrg("/api/audit?pageSize=50");
    const publishEvent = auditRes.ok && auditRes.body.items?.find((e) => e.action === "PUBLICATION_CREATED" && e.objectId === state.publication.id);
    check("tenant audit event for the publication still exists", !!publishEvent);
  }

  log("Public unit page...");
  const publicUnitPage = await req(`/u/${state.unit.stableId}`).catch(() => null);
  const publicPub = publicUnitPage?.publications?.find((p) => p.publicationStableId === state.publication.stableId);
  check("public unit page still resolves the publication", !!publicPub);

  log("Public download + SHA-256 verification...");
  let downloadOk = false;
  if (publicPub) {
    const downloadRes = await fetch(`${API}${publicPub.downloadUrl}`).catch(() => null);
    if (downloadRes && downloadRes.ok) {
      const downloaded = await downloadRes.text();
      downloadOk = downloaded === state.fileContent;
    }
  }
  check("public download returns byte-identical content", downloadOk);

  log("Historical resolution (effectiveAt = seed time)...");
  const historical = await withOrg(
    `/api/publications/resolve?unitId=${state.unit.id}&effectiveAt=${encodeURIComponent(state.createdAt)}`,
  );
  const historicalMatch = historical.ok && historical.body.resolved?.some((s) => s.publicationId === state.publication.id);
  check("historical resolution as of seed time still finds the publication", !!historicalMatch);

  log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

async function main() {
  const [, , mode, stateFile] = process.argv;
  if (!mode || !stateFile || !["seed", "verify"].includes(mode)) {
    console.error("Usage: node scripts/smoke-test.js <seed|verify> <state-file>");
    process.exit(2);
  }
  if (mode === "seed") await seed(stateFile);
  else await verify(stateFile);
}

main().catch((err) => {
  console.error(`[smoke-test] ERROR: ${err.message}`);
  process.exit(1);
});
