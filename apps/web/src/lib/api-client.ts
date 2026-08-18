import { ApiError, type ApiErrorCode } from "./api-error";
import { getStoredOrganizationId, getStoredToken } from "./session-storage";

// No hardcoded base URL — one configurable base, defaulting to the local
// API per apps/api/.env.example's PUBLIC_BASE_URL.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skip attaching Authorization/X-Organization-Id (used by the public /p
   * and /u routes, which must work with neither header per spec). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseErrorBody(res: Response): Promise<{ code: ApiErrorCode; message: string; details?: unknown }> {
  try {
    const data = await res.json();
    if (data && typeof data === "object" && "error" in data) {
      const err = (data as { error: { code?: string; message?: string; details?: unknown } }).error;
      return {
        code: (err.code as ApiErrorCode) ?? "INTERNAL_ERROR",
        message: err.message ?? "Unbekannter Fehler",
        details: err.details,
      };
    }
  } catch {
    // fall through to generic message below
  }
  return { code: "INTERNAL_ERROR", message: `Request failed with status ${res.status}` };
}

/** Thin fetch wrapper: attaches auth/tenant headers when present, parses the
 * backend's `{ error: { code, message, details } }` shape into a typed
 * ApiError, and returns parsed JSON on success. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, anonymous = false, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (!anonymous) {
    const token = getStoredToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const orgId = getStoredOrganizationId();
    if (orgId) headers["X-Organization-Id"] = orgId;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("NETWORK_ERROR", "Network request failed", 0, err);
  }

  if (!res.ok) {
    const { code, message, details } = await parseErrorBody(res);
    throw new ApiError(code, message, res.status, details);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

/** Absolute URL for a relative API path (e.g. the `downloadUrl` a public
 * publication DTO returns), for use in <a href> or window.open. */
export function apiUrl(path: string): string {
  return buildUrl(path);
}
