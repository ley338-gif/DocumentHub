import { apiRequest } from "../../lib/api-client";
import type { AuditEventDto, Paginated } from "../../lib/api-types";

/** Every known action code emitted by AuditService.record() across the
 * backend, found via `grep -rn "action:" apps/api/src` (see
 * apps/web/README.md's Audit section for the exact command). Kept here as
 * the single source of truth for the Action filter dropdown — extend this
 * list (and ACTION_LABELS in action-labels.ts) together whenever a new
 * audit.record() call site is added on the backend. */
export const KNOWN_ACTIONS = [
  "APPLICABILITY_RULE_CREATED",
  "APPLICABILITY_RULE_DELETED",
  "APPLICABILITY_RULE_UPDATED",
  "BATCH_CREATED",
  "BATCH_UPDATED",
  "DOCUMENT_CREATED",
  "DOCUMENT_UPDATED",
  "MEMBER_INVITED",
  "MEMBER_ROLE_CHANGED",
  "ORGANIZATION_CREATED",
  "PRODUCT_CREATED",
  "PRODUCT_FAMILY_CREATED",
  "PRODUCT_UPDATED",
  "PUBLICATION_CREATED",
  "PUBLICATION_REVOKED",
  "REVISION_APPROVED",
  "REVISION_CREATED",
  "REVISION_RETIRED",
  "REVISION_SUBMITTED",
  "UNIT_CREATED",
  "UNIT_IMPORTED",
  "UNIT_UPDATED",
  "VARIANT_CREATED",
  "VARIANT_UPDATED",
] as const;

/** Every known objectType, found via `grep -rn "objectType:" apps/api/src`.
 * Single source of truth for the Resource Type filter dropdown — extend
 * together with OBJECT_ROUTES in object-routes.ts. */
export const KNOWN_OBJECT_TYPES = [
  "ApplicabilityRule",
  "Batch",
  "Document",
  "DocumentRevision",
  "Organization",
  "OrganizationMembership",
  "Product",
  "ProductFamily",
  "ProductVariant",
  "Publication",
  "Unit",
] as const;

export interface AuditListQuery {
  objectType?: string;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export function listAuditEvents(
  query: AuditListQuery,
  page: number,
  pageSize: number,
): Promise<Paginated<AuditEventDto>> {
  return apiRequest<Paginated<AuditEventDto>>("/api/audit", {
    query: { ...query, page, pageSize },
  });
}
