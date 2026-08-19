import { apiRequest } from "../../lib/api-client";
import type {
  CreateTenantResponseDto,
  Paginated,
  PlatformAuditEventDto,
  PlatformDashboardSummaryDto,
  PlatformSystemSnapshotDto,
  PlatformTenantDetailDto,
  PlatformTenantListItemDto,
  PlatformUserDto,
  TenantLifecycleStatus,
} from "../../lib/api-types";
import type { ListQuery } from "../products/api";

export function fetchDashboardSummary(): Promise<PlatformDashboardSummaryDto> {
  return apiRequest<PlatformDashboardSummaryDto>("/api/platform/dashboard");
}

export function listTenants(query: ListQuery): Promise<Paginated<PlatformTenantListItemDto>> {
  return apiRequest<Paginated<PlatformTenantListItemDto>>("/api/platform/tenants", { query });
}

export function getTenant(id: string): Promise<PlatformTenantDetailDto> {
  return apiRequest<PlatformTenantDetailDto>(`/api/platform/tenants/${id}`);
}

export interface CreateTenantInput {
  name: string;
  slug?: string;
  defaultLanguage?: string;
  timezone?: string;
  adminEmail: string;
}

export function createTenant(dto: CreateTenantInput): Promise<CreateTenantResponseDto> {
  return apiRequest<CreateTenantResponseDto>("/api/platform/tenants", { method: "POST", body: dto });
}

export function updateTenantStatus(id: string, status: TenantLifecycleStatus): Promise<PlatformTenantDetailDto> {
  return apiRequest<PlatformTenantDetailDto>(`/api/platform/tenants/${id}/status`, { method: "PATCH", body: { status } });
}

export function listPlatformUsers(query: ListQuery): Promise<Paginated<PlatformUserDto>> {
  return apiRequest<Paginated<PlatformUserDto>>("/api/platform/users", { query });
}

export function getPlatformUser(id: string): Promise<PlatformUserDto> {
  return apiRequest<PlatformUserDto>(`/api/platform/users/${id}`);
}

export function updatePlatformUserStatus(id: string, status: "ACTIVE" | "SUSPENDED"): Promise<PlatformUserDto> {
  return apiRequest<PlatformUserDto>(`/api/platform/users/${id}/status`, { method: "PATCH", body: { status } });
}

export function listPlatformAudit(query: ListQuery): Promise<Paginated<PlatformAuditEventDto>> {
  return apiRequest<Paginated<PlatformAuditEventDto>>("/api/platform/audit", { query });
}

export function fetchSystemSnapshot(): Promise<PlatformSystemSnapshotDto> {
  return apiRequest<PlatformSystemSnapshotDto>("/api/platform/system");
}
