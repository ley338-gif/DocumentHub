import type { AuditEventDto } from "../../lib/api-types";

/**
 * Maps a backend action code (+ the event's before/after JSON) to a
 * human-readable German label. This is presentation only — see
 * docs/audit.md's "What the UI owns vs. what it must not touch": the raw
 * `action`/`objectType`/`objectId`/`before`/`after` stay fully visible in
 * the detail drawer regardless of what's shown here, and this function
 * never changes what actually happened, only how it reads in the table.
 *
 * Single source of truth for action -> label; extend this table (together
 * with KNOWN_ACTIONS in api.ts) whenever a new audit.record() call site is
 * added on the backend. Anything not in this table falls back to a plain
 * "{action} ({objectType})" rendering — never a crash, never a blank cell.
 */
function field(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function shortId(id: string | undefined): string {
  return id ? `${id.slice(0, 8)}…` : "?";
}

type LabelFn = (event: AuditEventDto) => string;

const ACTION_LABELS: Record<string, LabelFn> = {
  PRODUCT_CREATED: (e) => `Produkt angelegt — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  PRODUCT_UPDATED: (e) => `Produkt aktualisiert — ${field(e.after, "name") ?? field(e.before, "name") ?? shortId(e.objectId)}`,
  PRODUCT_FAMILY_CREATED: (e) => `Produktfamilie angelegt — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  VARIANT_CREATED: (e) => `Variante angelegt — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  VARIANT_UPDATED: (e) => `Variante aktualisiert — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  BATCH_CREATED: (e) => `Charge angelegt — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  BATCH_UPDATED: (e) => `Charge aktualisiert — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  UNIT_CREATED: (e) => `Einheit angelegt — ${field(e.after, "serialNumber") ?? shortId(e.objectId)}`,
  UNIT_UPDATED: (e) =>
    `Einheit aktualisiert — ${field(e.after, "serialNumber") ?? field(e.before, "serialNumber") ?? shortId(e.objectId)}`,
  UNIT_IMPORTED: (e) => `Einheiten importiert — ${field(e.after, "count") ?? "?"} Stück`,
  DOCUMENT_CREATED: (e) => `Dokument angelegt — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  DOCUMENT_UPDATED: (e) => `Dokument aktualisiert — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  REVISION_CREATED: (e) =>
    `Revision hochgeladen — ${field(e.after, "revision") ?? "?"} (${field(e.after, "language") ?? "?"})`,
  REVISION_SUBMITTED: () => "Revision zur Prüfung eingereicht",
  REVISION_APPROVED: () => "Revision freigegeben",
  REVISION_RETIRED: () => "Revision zurückgezogen",
  APPLICABILITY_RULE_CREATED: () => "Anwendbarkeitsregel angelegt",
  APPLICABILITY_RULE_UPDATED: () => "Anwendbarkeitsregel geändert",
  APPLICABILITY_RULE_DELETED: () => "Anwendbarkeitsregel gelöscht",
  PUBLICATION_CREATED: (e) => `Dokument veröffentlicht — Revision ${shortId(field(e.after, "documentRevisionId"))}`,
  PUBLICATION_REVOKED: () => "Veröffentlichung widerrufen",
  ORGANIZATION_CREATED: (e) => `Organisation angelegt — ${field(e.after, "name") ?? shortId(e.objectId)}`,
  MEMBER_INVITED: (e) => `Mitglied eingeladen — Rolle ${field(e.after, "role") ?? "?"}`,
  MEMBER_ROLE_CHANGED: (e) => `Mitgliedsrolle geändert — ${field(e.after, "role") ?? "?"}`,
};

export function auditEventLabel(event: AuditEventDto): string {
  const fn = ACTION_LABELS[event.action];
  if (fn) {
    try {
      return fn(event);
    } catch {
      // fall through to generic fallback below on any unexpected shape
    }
  }
  return `${event.action} (${event.objectType})`;
}
