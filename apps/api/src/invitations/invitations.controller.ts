import { Body, Controller, Get, Param, Post, Delete, UseGuards, Req } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { OptionalJwtAuthGuard } from "../common/guards/optional-jwt-auth.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { InvitationsService } from "./invitations.service";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";

/** Tenant-scoped: an organization administrator managing their own team's
 * invitations. Same model/service the platform tenant-create wizard uses
 * for the first administrator (see PlatformService.createTenant). */
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("organizations/:organizationId/invitations")
export class OrganizationInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Roles("ADMINISTRATOR")
  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.invitations.listForOrganization(tenant.organizationId);
  }

  @Roles("ADMINISTRATOR")
  @Post()
  create(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(tenant.organizationId, user.userId, dto);
  }

  @Roles("ADMINISTRATOR")
  @Post(":invitationId/resend")
  resend(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.resend(tenant.organizationId, invitationId, user.userId);
  }

  @Roles("ADMINISTRATOR")
  @Delete(":invitationId")
  revoke(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.revoke(tenant.organizationId, invitationId, user.userId);
  }
}

/** Public: reachable with only the raw token, no tenant/session context.
 * Stays under /api (unlike /p, /u) — see docs/platform-administration.md
 * "Invitation Flow" for why this one isn't part of the anonymous QR surface. */
@Controller("invitations")
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(":token")
  preview(@Param("token") token: string) {
    return this.invitations.preview(token);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post(":token/accept")
  accept(@Param("token") token: string, @Body() dto: AcceptInvitationDto, @Req() req: Request) {
    const authenticatedUser = req.user ? { userId: req.user.userId, email: req.user.email } : null;
    return this.invitations.accept(token, dto, authenticatedUser);
  }
}
