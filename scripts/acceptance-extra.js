#!/usr/bin/env node
// Extends scripts/smoke-test.js's baseline flow with the parts of a full
// acceptance run that aren't "seed one of everything and check it's
// still there": bulk unit import at scale, a second revision that
// supersedes the first (and historical resolution across that boundary),
// revoke, tenant suspension, and confirming suspension never hides
// already-published public documentation. Run smoke-test.js seed first;
// pass its state file here.
//
// Usage: node scripts/acceptance-extra.js <state-file>
// Config via env: API_BASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD
// (same as smoke-test.js).

const fs = require("fs");
const crypto = require("crypto");

const API = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";

function log(msg) {
  process.stdout.write(`[acceptance-extra] ${msg}\n`);
}
let failures = 0;
function check(label, cond) {
  if (cond) log(`  PASS  ${label}`);
  else {
    log(`  FAIL  ${label}`);
    failures += 1;
  }
}

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
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

async function main() {
  const stateFile = process.argv[2];
  if (!stateFile) {
    console.error("Usage: node scripts/acceptance-extra.js <state-file>");
    process.exit(2);
  }
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));

  log("Logging in as platform admin and tenant admin...");
  const { accessToken: platformToken } = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json());
  const { accessToken: tenantToken0 } = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: state.tenantAdmin.email, password: state.tenantAdmin.password }),
  }).then((r) => r.json());
  let tenantToken = tenantToken0;

  const orgHeaders = () => ({ Authorization: `Bearer ${tenantToken}`, "X-Organization-Id": state.tenant.id });
  async function tReq(path, { method = "GET", body, isForm = false } = {}) {
    const headers = { ...orgHeaders() };
    let payload = body;
    if (body && !isForm) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, { method, headers, body: payload });
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body: data };
  }
  async function pReq(path, { method = "GET", body } = {}) {
    const headers = { Authorization: `Bearer ${platformToken}` };
    let payload = body;
    if (body) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, { method, headers, body: payload });
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body: data };
  }

  const productRes = await tReq(`/api/products/${state.product.id}`);
  check("fetched product detail (for stableId)", productRes.ok);
  const productStableId = productRes.body.stableId;

  // --- 1. Bulk import 5,000 units --------------------------------------
  log("Importing 5,000 units via CSV...");
  const rows = ["serialNumber,productReference"];
  for (let i = 1; i <= 5000; i++) {
    rows.push(`SN-BULK-${Date.now()}-${i},${productStableId}`);
  }
  const csv = rows.join("\n");
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "units.csv");
  const previewRes = await fetch(`${API}/api/imports/units/preview`, {
    method: "POST",
    headers: orgHeaders(),
    body: form,
  }).then((r) => r.json());
  check("CSV preview accepted 5,000 rows", previewRes.totalRows === 5000 && previewRes.validRows === 5000);
  const importId = previewRes.importId;
  const commitRes = await tReq(`/api/imports/units/${importId}/commit`, { method: "POST" });
  check("CSV commit succeeded", commitRes.ok);
  check(`5,000 units actually created (got ${commitRes.body.importedCount})`, commitRes.body.importedCount === 5000);

  // --- 2. A second document that stays published throughout, used to  --
  //        prove revoke/suspension only affect what they're supposed to.
  log("Publishing a second, independent document (control group for revoke/suspension checks)...");
  const stayDoc = await tReq("/api/documents", {
    method: "POST",
    body: { name: `Stays Published ${Date.now()}`, documentType: "MANUAL" },
  }).then((r) => r.body);
  const stayContent = makeMinimalPdf(`Stays-published control document, ${Date.now()}`);
  const stayForm = new FormData();
  stayForm.append("revision", "A");
  stayForm.append("language", "de");
  stayForm.append("file", new Blob([stayContent], { type: "application/pdf" }), "stay.pdf");
  const stayRevision = await fetch(`${API}/api/documents/${stayDoc.id}/revisions`, {
    method: "POST",
    headers: orgHeaders(),
    body: stayForm,
  }).then((r) => r.json());
  await tReq(`/api/documents/revisions/${stayRevision.id}/applicability-rules`, {
    method: "POST",
    body: { productId: state.product.id },
  });
  await tReq(`/api/documents/${stayDoc.id}/revisions/${stayRevision.id}/submit`, { method: "PATCH" });
  await tReq(`/api/documents/${stayDoc.id}/revisions/${stayRevision.id}/approve`, { method: "PATCH" });
  const stayPub = await tReq("/api/publications", { method: "POST", body: { revisionId: stayRevision.id } }).then((r) => r.body);
  check("control-group publication published", !!stayPub.id);

  // --- 3. Second revision of the ORIGINAL document -> supersedes the ---
  //        first publication; used for historical resolution + revoke.
  log("Publishing a second revision of the original document (supersedes the first)...");
  const beforeSecondPublish = new Date().toISOString();
  const rev2Content = makeMinimalPdf(`Second revision, ${Date.now()}`);
  const rev2Form = new FormData();
  rev2Form.append("revision", "B");
  rev2Form.append("language", "de");
  rev2Form.append("file", new Blob([rev2Content], { type: "application/pdf" }), "manual-b.pdf");
  const rev2 = await fetch(`${API}/api/documents/${state.document.id}/revisions`, {
    method: "POST",
    headers: orgHeaders(),
    body: rev2Form,
  }).then((r) => r.json());
  await tReq(`/api/documents/revisions/${rev2.id}/applicability-rules`, { method: "POST", body: { productId: state.product.id } });
  await tReq(`/api/documents/${state.document.id}/revisions/${rev2.id}/submit`, { method: "PATCH" });
  await tReq(`/api/documents/${state.document.id}/revisions/${rev2.id}/approve`, { method: "PATCH" });
  const afterFirstPublishBeforeSecond = beforeSecondPublish;
  const pub2 = await tReq("/api/publications", { method: "POST", body: { revisionId: rev2.id } }).then((r) => r.body);
  check("second revision published (supersedes first)", !!pub2.id && pub2.id !== state.publication.id);

  // --- 4. Historical resolution across the supersede boundary ----------
  log("Checking historical resolution across the supersede boundary...");
  const historicalOld = await tReq(
    `/api/publications/resolve?unitId=${state.unit.id}&effectiveAt=${encodeURIComponent(afterFirstPublishBeforeSecond)}`,
  );
  const foundOld = historicalOld.ok && historicalOld.body.resolved?.some((s) => s.publicationId === state.publication.id);
  check("resolution just before the second publish still finds the FIRST publication", !!foundOld);

  const historicalNew = await tReq(`/api/publications/resolve?unitId=${state.unit.id}&effectiveAt=${encodeURIComponent(new Date().toISOString())}`);
  const foundNew = historicalNew.ok && historicalNew.body.resolved?.some((s) => s.publicationId === pub2.id);
  check("resolution now finds the SECOND publication", !!foundNew);

  // --- 5. Revoke the second publication ---------------------------------
  log("Revoking the second publication...");
  const revokeRes = await tReq(`/api/publications/${pub2.id}/revoke`, { method: "PATCH" });
  check("revoke succeeded", revokeRes.ok);

  const publicUnitAfterRevoke = await fetch(`${API}/u/${state.unit.stableId}`).then((r) => r.json());
  const stillThere = publicUnitAfterRevoke.publications?.some((p) => p.publicationStableId === pub2.stableId);
  check("revoked publication is immediately gone from the public unit page", !stillThere);

  const auditRes = await tReq("/api/audit?pageSize=50");
  const revokeEvent = auditRes.ok && auditRes.body.items?.find((e) => e.action === "PUBLICATION_REVOKED" && e.objectId === pub2.id);
  check("PUBLICATION_REVOKED audit event recorded", !!revokeEvent);

  const controlStillPublic1 = await fetch(`${API}/u/${state.unit.stableId}`).then((r) => r.json());
  const controlOk1 = controlStillPublic1.publications?.some((p) => p.publicationStableId === stayPub.stableId);
  check("control-group publication unaffected by the revoke", !!controlOk1);

  // --- 6. Suspend the tenant, verify existing public docs stay up ------
  log("Suspending the tenant...");
  const suspendRes = await pReq(`/api/platform/tenants/${state.tenant.id}/status`, { method: "PATCH", body: { status: "SUSPENDED" } });
  check("tenant suspended", suspendRes.ok);

  const publicAfterSuspend = await fetch(`${API}/u/${state.unit.stableId}`).then((r) => r.json());
  const controlOk2 = publicAfterSuspend.publications?.some((p) => p.publicationStableId === stayPub.stableId);
  check("control-group publication STILL publicly visible while tenant is SUSPENDED", !!controlOk2);

  const downloadAfterSuspend = await fetch(`${API}${publicAfterSuspend.publications.find((p) => p.publicationStableId === stayPub.stableId).downloadUrl}`);
  check("control-group publication still downloads while tenant is SUSPENDED", downloadAfterSuspend.ok);

  log("Confirming writes are blocked while suspended...");
  const blockedWrite = await tReq("/api/products", { method: "POST", body: { name: "Should Be Blocked" } });
  check("write (create product) rejected while tenant is SUSPENDED", !blockedWrite.ok && blockedWrite.status !== 201);

  const platformAuditRes = await pReq("/api/platform/audit?pageSize=50");
  const suspendEvent = platformAuditRes.ok && platformAuditRes.body.items?.find((e) => e.action === "PLATFORM_TENANT_SUSPENDED" && e.targetId === state.tenant.id);
  check("PLATFORM_TENANT_SUSPENDED platform-audit event recorded", !!suspendEvent);

  log("Reactivating the tenant (cleanup)...");
  const reactivateRes = await pReq(`/api/platform/tenants/${state.tenant.id}/status`, { method: "PATCH", body: { status: "ACTIVE" } });
  check("tenant reactivated", reactivateRes.ok);

  log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`[acceptance-extra] ERROR: ${err.stack ?? err.message}`);
  process.exit(1);
});
