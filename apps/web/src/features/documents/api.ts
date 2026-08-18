import { apiRequest, apiUrl } from "../../lib/api-client";
import { ApiError, type ApiErrorCode } from "../../lib/api-error";
import { getStoredOrganizationId, getStoredToken } from "../../lib/session-storage";
import type {
  ApplicabilityRuleDto,
  DocumentDto,
  DocumentRevisionDto,
  Paginated,
  PublicationDto,
} from "../../lib/api-types";

export interface ListQuery {
  page?: number;
  pageSize?: number;
  [key: string]: string | number | boolean | undefined;
}

export function listDocuments(query: ListQuery): Promise<Paginated<DocumentDto>> {
  return apiRequest<Paginated<DocumentDto>>("/api/documents", { query });
}

export function getDocument(id: string): Promise<DocumentDto> {
  return apiRequest<DocumentDto>(`/api/documents/${id}`);
}

export interface CreateDocumentInput {
  name: string;
  documentType: string;
  description?: string;
}

export function createDocument(dto: CreateDocumentInput): Promise<DocumentDto> {
  return apiRequest<DocumentDto>("/api/documents", { method: "POST", body: dto });
}

export function updateDocument(id: string, dto: Partial<CreateDocumentInput>): Promise<DocumentDto> {
  return apiRequest<DocumentDto>(`/api/documents/${id}`, { method: "PATCH", body: dto });
}

export function listRevisions(documentId: string): Promise<DocumentRevisionDto[]> {
  return apiRequest<DocumentRevisionDto[]>(`/api/documents/${documentId}/revisions`);
}

export function getRevision(documentId: string, id: string): Promise<DocumentRevisionDto> {
  return apiRequest<DocumentRevisionDto>(`/api/documents/${documentId}/revisions/${id}`);
}

export interface UploadRevisionInput {
  revision: string;
  language: string;
  changeDescription?: string;
  internalNote?: string;
  file: File;
}

/** Multipart upload — bypasses apiRequest's JSON-only body handling since
 * this needs FormData, but still attaches the same auth/tenant headers. */
export async function uploadRevision(documentId: string, input: UploadRevisionInput): Promise<DocumentRevisionDto> {
  const form = new FormData();
  form.append("revision", input.revision);
  form.append("language", input.language);
  if (input.changeDescription) form.append("changeDescription", input.changeDescription);
  if (input.internalNote) form.append("internalNote", input.internalNote);
  form.append("file", input.file);

  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const orgId = getStoredOrganizationId();
  if (orgId) headers["X-Organization-Id"] = orgId;

  const res = await fetch(apiUrl(`/api/documents/${documentId}/revisions`), {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    let code: ApiErrorCode = "INTERNAL_ERROR";
    let message = `Upload fehlgeschlagen (Status ${res.status})`;
    let details: unknown;
    try {
      const data = await res.json();
      if (data?.error) {
        code = (data.error.code as ApiErrorCode) ?? code;
        message = data.error.message ?? message;
        details = data.error.details;
      }
    } catch {
      // ignore, fall back to generic message
    }
    throw new ApiError(code, message, res.status, details);
  }

  return res.json();
}

export function submitRevision(documentId: string, id: string): Promise<DocumentRevisionDto> {
  return apiRequest<DocumentRevisionDto>(`/api/documents/${documentId}/revisions/${id}/submit`, { method: "PATCH" });
}

export function approveRevision(documentId: string, id: string): Promise<DocumentRevisionDto> {
  return apiRequest<DocumentRevisionDto>(`/api/documents/${documentId}/revisions/${id}/approve`, { method: "PATCH" });
}

export function retireRevision(documentId: string, id: string): Promise<DocumentRevisionDto> {
  return apiRequest<DocumentRevisionDto>(`/api/documents/${documentId}/revisions/${id}/retire`, { method: "PATCH" });
}

/** Downloads the authenticated file for a revision as a blob and triggers a
 * browser save — the public download route can't be used here since this
 * one requires Authorization/X-Organization-Id headers a bare <a href>
 * can't send. */
export async function downloadRevisionFile(documentId: string, id: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const orgId = getStoredOrganizationId();
  if (orgId) headers["X-Organization-Id"] = orgId;

  const res = await fetch(apiUrl(`/api/documents/${documentId}/revisions/${id}/file`), { headers });
  if (!res.ok) {
    throw new Error(`Download fehlgeschlagen (Status ${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function listApplicabilityRules(revisionId: string): Promise<ApplicabilityRuleDto[]> {
  return apiRequest<ApplicabilityRuleDto[]>(`/api/documents/revisions/${revisionId}/applicability-rules`);
}

export function listPublicationsForDocument(documentId: string): Promise<Paginated<PublicationDto>> {
  return apiRequest<Paginated<PublicationDto>>("/api/publications", {
    query: { documentId, pageSize: 100 },
  });
}
