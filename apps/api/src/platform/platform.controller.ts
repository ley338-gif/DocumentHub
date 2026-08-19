import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/request-context";
import { PlatformTenantsService } from "./platform-tenants.service";
import { PlatformUsersService } from "./platform-users.service";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformSystemService } from "./platform-system.service";
import { CreateTenantDto, UpdateTenantStatusDto } from "./dto/create-tenant.dto";
import { ListTenantsQueryDto } from "./dto/list-tenants.dto";
import { ListPlatformUsersQueryDto, UpdatePlatformUserStatusDto } from "./dto/list-users.dto";
import { ListPlatformAuditQueryDto } from "./dto/list-platform-audit.dto";

// Every route here is guarded by PlatformAdminGuard — the single
// authorization point for the whole /api/platform/* surface (spec §26).
// Never gated by TenantGuard/RolesGuard: platform privilege has nothing to
// do with any OrganizationMembership. See docs/platform-administration.md.
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform")
export class PlatformController {
  constructor(
    private readonly tenants: PlatformTenantsService,
    private readonly users: PlatformUsersService,
    private readonly platformAudit: PlatformAuditService,
    private readonly system: PlatformSystemService,
  ) {}

  @Get("dashboard")
  dashboard() {
    return this.tenants.dashboardSummary();
  }

  @Get("tenants")
  listTenants(@Query() query: ListTenantsQueryDto) {
    return this.tenants.list(query);
  }

  @Post("tenants")
  createTenant(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTenantDto) {
    return this.tenants.create(user.userId, dto);
  }

  @Get("tenants/:id")
  tenantDetail(@Param("id") id: string) {
    return this.tenants.detail(id);
  }

  @Get("tenants/:id/usage")
  tenantUsage(@Param("id") id: string) {
    return this.tenants.usage(id);
  }

  @Patch("tenants/:id/status")
  updateTenantStatus(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenants.updateStatus(id, user.userId, dto);
  }

  @Get("users")
  listUsers(@Query() query: ListPlatformUsersQueryDto) {
    return this.users.list(query);
  }

  @Get("users/:id")
  userDetail(@Param("id") id: string) {
    return this.users.detail(id);
  }

  @Patch("users/:id/status")
  updateUserStatus(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlatformUserStatusDto,
  ) {
    return this.users.updateStatus(id, user.userId, dto);
  }

  @Get("audit")
  listAudit(@Query() query: ListPlatformAuditQueryDto) {
    return this.platformAudit.list(query);
  }

  @Get("system")
  systemSnapshot() {
    return this.system.snapshot();
  }
}
