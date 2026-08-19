// Shared between main.ts (real bootstrap) and any e2e spec that builds its
// own Nest application (they must apply the identical global prefix
// configuration, or public routes silently 404 behind "/api" in tests but
// not in production, or vice versa).
//
// Public routes (spec §29-32) are unauthenticated and read their org
// context purely from a stable ID in the path — they must NOT sit behind
// "/api" alongside the authenticated, tenant-scoped internal API, so every
// public path (page + its scoped download route) is listed here.
export const GLOBAL_PREFIX = "api";

export const GLOBAL_PREFIX_EXCLUDES = [
  "health",
  "health/live",
  "health/ready",
  "p/:stableId",
  "p/:productStableId/publications/:publicationStableId/download",
  "u/:stableId",
  "u/:unitStableId/publications/:publicationStableId/download",
];
