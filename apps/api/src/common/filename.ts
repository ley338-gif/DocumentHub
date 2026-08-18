import * as path from "path";

/** Strips directory components and any character outside a safe allowlist — used whenever a filename derived from stored/DB data is echoed back in a Content-Disposition header, so it can never carry the raw storage key or path traversal characters. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base : "file";
}
