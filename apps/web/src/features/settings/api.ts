import { apiRequest } from "../../lib/api-client";

export interface MembershipDto {
  id: string;
  role: string;
  status: string;
  user: { id: string; email: string; fullName: string };
}

export function listMembers(organizationId: string): Promise<MembershipDto[]> {
  return apiRequest<MembershipDto[]>(`/api/organizations/${organizationId}/members`);
}

export function updateMemberRole(organizationId: string, membershipId: string, role: string): Promise<MembershipDto> {
  return apiRequest<MembershipDto>(`/api/organizations/${organizationId}/members/${membershipId}/role`, {
    method: "PATCH",
    body: { role },
  });
}

export function updateMemberStatus(
  organizationId: string,
  membershipId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<MembershipDto> {
  return apiRequest<MembershipDto>(`/api/organizations/${organizationId}/members/${membershipId}/status`, {
    method: "PATCH",
    body: { status },
  });
}
