import { apiRequest } from "../../lib/api-client";
import type { Paginated, PublicationDto, PublicationStatus, PublishPreviewDto } from "../../lib/api-types";

/**
 * The single source of truth for "what would happen if this revision were
 * published right now" — affected units, plain-language rule descriptions,
 * specificity, and conflicts against currently active publications. Every
 * screen in the Applicability Editor and Publish Wizard that shows any of
 * those numbers MUST come through this call. See README.md's "Design
 * invariant" note — do not recompute any of this client-side.
 *
 * Editor+ only server-side (the controller enforces @Roles("EDITOR")) — a
 * Viewer calling this gets a real 403. Callers must not invoke this for a
 * Viewer session; see useCurrentRole/hasRole checks at the call sites.
 */
export function getPublishPreview(revisionId: string): Promise<PublishPreviewDto> {
  return apiRequest<PublishPreviewDto>(`/api/publications/preview/${revisionId}`);
}

/** The real, authoritative publish — Publisher+ only. Can still reject with
 * APPLICABILITY_CONFLICT even after a clean preview (someone else published
 * in the meantime); the preview above is advisory, this is authoritative. */
export function publishRevision(revisionId: string): Promise<PublicationDto> {
  return apiRequest<PublicationDto>("/api/publications", { method: "POST", body: { revisionId } });
}

export function revokePublication(id: string): Promise<PublicationDto> {
  return apiRequest<PublicationDto>(`/api/publications/${id}/revoke`, { method: "PATCH" });
}

export function listPublications(query: { documentId?: string; status?: string; pageSize?: number } = {}) {
  return apiRequest<Paginated<PublicationDto>>("/api/publications", { query });
}

/** Publication History list query — server-paginated, every filter is a
 * real query param forwarded to GET /api/publications (see
 * publications.controller.ts). Never filter a locally-cached page
 * client-side; each filter change must trigger a fresh fetch. */
export interface PublicationHistoryQuery {
  status?: PublicationStatus;
  documentId?: string;
  productId?: string;
  from?: string;
  to?: string;
}

export function listPublicationHistory(
  query: PublicationHistoryQuery,
  page: number,
  pageSize: number,
): Promise<Paginated<PublicationDto>> {
  return apiRequest<Paginated<PublicationDto>>("/api/publications", {
    query: { ...query, page, pageSize },
  });
}

/** Single publication detail — 404 if not found or belongs to another org
 * (the backend never leaks existence with a 403). */
export function getPublication(id: string): Promise<PublicationDto> {
  return apiRequest<PublicationDto>(`/api/publications/${id}`);
}
