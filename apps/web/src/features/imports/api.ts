import { apiRequest, apiUrl } from "../../lib/api-client";
import { ApiError, type ApiErrorCode } from "../../lib/api-error";
import { getStoredOrganizationId, getStoredToken } from "../../lib/session-storage";
import type { ImportCanonicalField, ImportCommitResponseDto, ImportPreviewResponseDto } from "../../lib/api-types";

/** Multipart preview call (spec: POST /api/imports/units/preview). Always
 * resends the raw File — the browser cannot "replay" a previous multipart
 * upload, so the wizard must keep the File object in memory across steps
 * and call this again whenever the mapping changes. `columnMapping` is an
 * optional field-by-field override; omit it (or omit individual fields) to
 * keep the backend's auto-detection for those fields. Nothing is persisted
 * by this call — it only stages a pending import server-side, keyed by the
 * returned importId, for at most 30 minutes (see PendingImportStore). */
export async function previewImport(
  file: File,
  columnMapping?: Partial<Record<ImportCanonicalField, number | null>>,
): Promise<ImportPreviewResponseDto> {
  const form = new FormData();
  form.append("file", file);
  if (columnMapping) {
    form.append("columnMapping", JSON.stringify(columnMapping));
  }

  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const orgId = getStoredOrganizationId();
  if (orgId) headers["X-Organization-Id"] = orgId;

  const res = await fetch(apiUrl("/api/imports/units/preview"), {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    let code: ApiErrorCode = "INTERNAL_ERROR";
    let message = `Vorschau fehlgeschlagen (Status ${res.status})`;
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

/** POST /api/imports/units/:importId/commit — the only call in this flow
 * that writes anything. Imports exactly the valid-row set the referenced
 * importId was staged with at preview time; nothing more, nothing less. */
export function commitImport(importId: string): Promise<ImportCommitResponseDto> {
  return apiRequest<ImportCommitResponseDto>(`/api/imports/units/${importId}/commit`, { method: "POST" });
}
