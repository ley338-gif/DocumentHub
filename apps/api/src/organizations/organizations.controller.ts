import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { OrganizationsService } from "./organizations.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";

@UseGuards(JwtAuthGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
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
  @Post()
  invite(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.organizations.inviteMember(tenant.organizationId, user.userId, dto);
  }

  @Roles("ADMINISTRATOR")
  @Patch(":membershipId")
  updateRole(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizations.updateMemberRole(tenant.organizationId, membershipId, user.userId, dto);
  }
}
