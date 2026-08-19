import { apiRequest } from "../../lib/api-client";
import type {
  AcceptInvitationResponseDto,
  CreateInvitationResponseDto,
  InvitationDto,
  InvitationPreviewDto,
} from "../../lib/api-types";

export function listInvitations(organizationId: string): Promise<InvitationDto[]> {
  return apiRequest<InvitationDto[]>(`/api/organizations/${organizationId}/invitations`);
}

export function createInvitation(
  organizationId: string,
  dto: { email: string; role: string },
): Promise<CreateInvitationResponseDto> {
  return apiRequest<CreateInvitationResponseDto>(`/api/organizations/${organizationId}/invitations`, {
    method: "POST",
    body: dto,
  });
}

export function resendInvitation(organizationId: string, invitationId: string): Promise<CreateInvitationResponseDto> {
  return apiRequest<CreateInvitationResponseDto>(`/api/organizations/${organizationId}/invitations/${invitationId}/resend`, {
    method: "POST",
  });
}

export function revokeInvitation(organizationId: string, invitationId: string): Promise<InvitationDto> {
  return apiRequest<InvitationDto>(`/api/organizations/${organizationId}/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

// --- Public (token-only, no session required for the preview/new-account path) ---

export function previewInvitation(token: string): Promise<InvitationPreviewDto> {
  return apiRequest<InvitationPreviewDto>(`/api/invitations/${encodeURIComponent(token)}`, { anonymous: true });
}

export function acceptInvitation(
  token: string,
  dto: { fullName?: string; password?: string },
  authenticated: boolean,
): Promise<AcceptInvitationResponseDto> {
  return apiRequest<AcceptInvitationResponseDto>(`/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: dto,
    // When the invited email already has an account, acceptance must be
    // authenticated as that exact user — let apiRequest attach the normal
    // Authorization header. For a brand-new account there's no session yet,
    // so this call is anonymous (no header expected or required).
    anonymous: !authenticated,
  });
}
