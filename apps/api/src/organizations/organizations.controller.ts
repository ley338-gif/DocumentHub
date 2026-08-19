import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { AppError } from "../common/errors/app-error";
import { registrationMode } from "../platform/registration-mode";
import { OrganizationsService } from "./organizations.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { UpdateMemberStatusDto } from "./dto/update-member-status.dto";

@UseGuards(JwtAuthGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    // Self-service organization creation is a development convenience only
    // (spec §25) — in INVITE_ONLY (the production-like default) a tenant
    // is created exclusively via the platform tenant-create wizard
    // (POST /api/platform/tenants), which also creates the first admin
    // Invitation atomically. This endpoint stays available to platform
    // admins as a lower-level primitive.
    if (registrationMode() === "INVITE_ONLY" && user.platformRole !== "PLATFORM_ADMIN") {
      throw new AppError("FORBIDDEN", "Organization self-service creation is disabled");
    }
    return this.organizations.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.listForUser(user.userId);
  }
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("organizations/:organizationId/members")
export class OrganizationMembersController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Roles("ADMINISTRATOR")
  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.organizations.listMembers(tenant.organizationId);
  }

  @Roles("ADMINISTRATOR")
  @Patch(":membershipId/role")
  updateRole(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizations.updateMemberRole(tenant.organizationId, membershipId, user.userId, dto);
  }

  @Roles("ADMINISTRATOR")
  @Patch(":membershipId/status")
  updateStatus(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMemberStatusDto,
  ) {
    return this.organizations.updateMemberStatus(tenant.organizationId, membershipId, user.userId, dto);
  }
}
