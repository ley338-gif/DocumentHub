import { apiRequest } from "../../lib/api-client";
import type { PublicProductDto, PublicUnitDto } from "../../lib/api-types";

// Public routes live outside /api (see apps/api/src/common/global-prefix.ts)
// and need neither Authorization nor X-Organization-Id — anonymous: true
// skips attaching those headers even if an admin session happens to be
// active in another tab.

export function fetchPublicProduct(stableId: string): Promise<PublicProductDto> {
  return apiRequest<PublicProductDto>(`/p/${encodeURIComponent(stableId)}`, { anonymous: true });
}

export function fetchPublicUnit(stableId: string): Promise<PublicUnitDto> {
  return apiRequest<PublicUnitDto>(`/u/${encodeURIComponent(stableId)}`, { anonymous: true });
}
