import type { AuditEventDto } from "../../lib/api-types";

/**
 * Maps an audit event's objectType (+ objectId, and occasionally a field
 * out of before/after) to a real in-app route, where one exists. Single
 * source of truth for objectType -> route; extend together with
 * KNOWN_OBJECT_TYPES in api.ts whenever a new objectType appears on the
 * backend. Returns null when there is no dedicated detail route for that
 * type — callers must render plain text (objectType + id) in that case,
 * never a broken link.
 */
export function resourceRoute(event: AuditEventDto): string | null {
  switch (event.objectType) {
    case "Product":
      return `/app/products/${event.objectId}`;
    case "Document":
      return `/app/documents/${event.objectId}`;
    case "DocumentRevision": {
      // The revision itself has no standalone route — link to its parent
      // Document (Revisionen tab) using documentId out of before/after,
      // when present.
      const documentId = fieldOf(event.after, "documentId") ?? fieldOf(event.before, "documentId");
      return documentId ? `/app/documents/${documentId}` : null;
    }
    case "Publication":
      // Publication History page reads ?open=<id> to deep-link straight
      // into the detail drawer for this event's object.
      return `/app/publications?open=${event.objectId}`;
    default:
      // ProductFamily, ProductVariant, Batch, Unit, Organization,
      // OrganizationMembership, ApplicabilityRule: no standalone detail
      // route exists yet in this app — render as plain text.
      return null;
  }
}

function fieldOf(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
