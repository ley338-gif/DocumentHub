// Fail-fast startup validation for NODE_ENV=production (spec §18/§45/§58).
// Deliberately only runs in production — local dev keeps working with the
// same permissive defaults (change-me-in-production JWT secret,
// http://localhost PUBLIC_BASE_URL, ...) it always has. There is no silent
// fallback to an unsafe default once this check is active: a misconfigured
// production boot must crash loudly, not start "successfully" with a weak
// secret or a QR-breaking PUBLIC_BASE_URL.

const WEAK_JWT_SECRETS = new Set(["change-me-in-production", "dev-secret-change-me", "secret", "test-secret", ""]);

export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;

  const errors: string[] = [];

  const jwtSecret = env.JWT_SECRET ?? "";
  if (WEAK_JWT_SECRETS.has(jwtSecret) || jwtSecret.length < 32) {
    errors.push(
      "JWT_SECRET is missing, a known placeholder, or shorter than 32 characters. " +
        "Generate a real secret, e.g.: openssl rand -base64 48",
    );
  }

  if (!env.DATABASE_URL) {
    errors.push("DATABASE_URL is required.");
  }

  const publicBaseUrl = env.PUBLIC_BASE_URL ?? "";
  if (!publicBaseUrl) {
    errors.push("PUBLIC_BASE_URL is required — QR codes encode this URL directly.");
  } else {
    try {
      const parsed = new URL(publicBaseUrl);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        errors.push(
          `PUBLIC_BASE_URL (${publicBaseUrl}) points at localhost — QR codes printed for real customers would be unreachable. Set it to the deployed frontend's real public origin.`,
        );
      }
      if (parsed.protocol !== "https:") {
        errors.push(`PUBLIC_BASE_URL (${publicBaseUrl}) is not HTTPS — production deployments must serve over HTTPS.`);
      }
    } catch {
      errors.push(`PUBLIC_BASE_URL (${publicBaseUrl}) is not a valid URL.`);
    }
  }

  const storageDriver = env.STORAGE_DRIVER ?? "local";
  if (storageDriver === "s3") {
    for (const key of ["STORAGE_S3_ENDPOINT", "STORAGE_S3_BUCKET", "STORAGE_S3_ACCESS_KEY", "STORAGE_S3_SECRET_KEY"]) {
      if (!env[key]) errors.push(`STORAGE_DRIVER=s3 requires ${key} to be set.`);
    }
  } else if (storageDriver !== "local") {
    errors.push(`STORAGE_DRIVER=${storageDriver} is not a recognized driver (expected "local" or "s3").`);
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error("\nRefusing to start in production with invalid configuration:\n");
    for (const err of errors) {
      // eslint-disable-next-line no-console
      console.error(`  - ${err}`);
    }
    // eslint-disable-next-line no-console
    console.error("");
    process.exit(1);
  }
}
