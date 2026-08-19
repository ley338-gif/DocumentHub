import type { AppliedRuleSnapshotDto } from "../../lib/api-types";

/**
 * Client-side presentation only — renders the FROZEN
 * AppliedRuleSnapshotDto fields already resolved by the backend at publish
 * time (productFamilyName/productName/variantName/batchName/
 * unitSerialNumber). This never fetches or recomputes anything; it only
 * formats data that's already on the object. A rule from a publication
 * created before this naming feature shipped will have these fields
 * `undefined` — fall back to the raw id so the row still renders something
 * useful instead of crashing or showing nothing.
 */
export function formatRuleScope(rule: AppliedRuleSnapshotDto): string {
  const parts: string[] = [];

  if (rule.productFamilyName) parts.push(`Produktfamilie „${rule.productFamilyName}“`);
  else if (rule.productFamilyId) parts.push(`Produktfamilie (${rule.productFamilyId.slice(0, 8)}…)`);

  if (rule.productName) parts.push(`Produkt „${rule.productName}“`);
  else if (rule.productId) parts.push(`Produkt (${rule.productId.slice(0, 8)}…)`);

  if (rule.variantName) parts.push(`Variante „${rule.variantName}“`);
  else if (rule.variantId) parts.push(`Variante (${rule.variantId.slice(0, 8)}…)`);

  if (rule.batchName) parts.push(`Charge „${rule.batchName}“`);
  else if (rule.batchId) parts.push(`Charge (${rule.batchId.slice(0, 8)}…)`);

  if (rule.unitSerialNumber) parts.push(`Einheit ${rule.unitSerialNumber}`);
  else if (rule.unitId) parts.push(`Einheit (${rule.unitId.slice(0, 8)}…)`);

  const serialRange = formatSerialRange(rule);
  if (serialRange) parts.push(serialRange);

  if (parts.length === 0) parts.push("Alle Einheiten");

  const scope = parts.join(", ");
  return rule.explicitExclusion ? `Ausschluss: ${scope}` : scope;
}

function formatSerialRange(rule: AppliedRuleSnapshotDto): string | null {
  if (!rule.serialFrom && !rule.serialTo) return null;
  return `Seriennummern ${rule.serialFrom ?? "…"} – ${rule.serialTo ?? "…"}`;
}

export function formatRuleValidity(rule: AppliedRuleSnapshotDto): string {
  if (!rule.validFrom && !rule.validUntil) return "unbefristet";
  const from = rule.validFrom ? new Date(rule.validFrom).toLocaleDateString("de-DE") : "Anfang";
  const until = rule.validUntil ? new Date(rule.validUntil).toLocaleDateString("de-DE") : "unbefristet";
  return `${from} – ${until}`;
}

/** Short summary of an entire publication's applicability scope for the
 * list view — joins each rule's formatRuleScope, capped for readability. */
export function summarizeRules(rules: AppliedRuleSnapshotDto[]): string {
  if (!rules || rules.length === 0) return "—";
  const shown = rules.slice(0, 2).map(formatRuleScope);
  const extra = rules.length - shown.length;
  return extra > 0 ? `${shown.join("; ")} (+${extra} weitere)` : shown.join("; ");
}
