import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { ApplicabilityRulesService } from "./applicability-rules.service";
import { CreateApplicabilityRuleDto, UpdateApplicabilityRuleDto } from "./dto/applicability-rule.dto";

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("documents/revisions/:revisionId/applicability-rules")
export class ApplicabilityController {
  constructor(private readonly rules: ApplicabilityRulesService) {}

  @Roles("VIEWER")
  @Get()
  list(@Tenant() tenant: TenantContext, @Param("revisionId") revisionId: string) {
    return this.rules.list(tenant.organizationId, revisionId);
  }

  @Roles("EDITOR")
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("revisionId") revisionId: string,
    @Body() dto: CreateApplicabilityRuleDto,
  ) {
    return this.rules.create(tenant.organizationId, revisionId, user.userId, dto);
  }

  @Roles("EDITOR")
  @Patch(":id")
  update(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("revisionId") revisionId: string,
    @Param("id") id: string,
    @Body() dto: UpdateApplicabilityRuleDto,
  ) {
    return this.rules.update(tenant.organizationId, revisionId, id, user.userId, dto);
  }

  @Roles("EDITOR")
  @Delete(":id")
  remove(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("revisionId") revisionId: string,
    @Param("id") id: string,
  ) {
    return this.rules.remove(tenant.organizationId, revisionId, id, user.userId);
  }
}
