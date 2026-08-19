// One JSON line per call, to stdout (or stderr for "error") — easy for any
// log aggregator to parse, and trivially greppable by requestId during
// manual debugging. Deliberately narrow: callers pass a flat field object,
// never raw request/response bodies, headers, or anything from
// process.env — so there is no code path here that could ever emit a
// password, JWT, invitation token, S3 secret, or file content. Keep it
// that way when adding fields; log identifiers (userId, organizationId,
// requestId), not payloads.
type LogLevel = "info" | "warn" | "error";

export function logJson(level: LogLevel, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...fields });
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}
