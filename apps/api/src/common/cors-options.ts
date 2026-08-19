import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

// Restrictive-by-default CORS (spec §31): no wildcard for the authenticated
// internal API. The allowed-origins set is built from:
//   1. PUBLIC_BASE_URL's own origin (always the deployed frontend, and
//      already required in production — see validate-production-config.ts),
//   2. CORS_ALLOWED_ORIGINS (comma-separated) for any additional origins a
//      deployment needs (e.g. a staging frontend hitting the same API),
//   3. a local-dev fallback (http://localhost:5173) only when neither of
//      the above yields anything, so local development keeps working
//      without extra configuration.
// Requests with no Origin header (server-to-server calls, curl, the public
// QR download links opened directly) are always allowed — CORS only
// governs browser-enforced cross-origin XHR/fetch, not direct navigation.
export function corsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const allowed = new Set<string>();

  for (const raw of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const origin = raw.trim();
    if (origin) allowed.add(origin);
  }

  if (env.PUBLIC_BASE_URL) {
    try {
      allowed.add(new URL(env.PUBLIC_BASE_URL).origin);
    } catch {
      // Invalid PUBLIC_BASE_URL is caught loudly by validate-production-config
      // in production; in dev we just skip adding it here.
    }
  }

  if (allowed.size === 0) {
    allowed.add("http://localhost:5173");
  }

  return {
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed`), false);
    },
  };
}
