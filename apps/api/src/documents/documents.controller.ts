import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { PaginationQueryDto } from "../common/pagination";
import { DocumentsService } from "./documents.service";
import { CreateDocumentDto, UpdateDocumentDto } from "./dto/document-dtos";

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Roles("VIEWER")
  @Get()
  list(@Tenant() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.documents.list(tenant.organizationId, query);
  }

  @Roles("VIEWER")
  @Get(":id")
  get(@Tenant() tenant: TenantContext, @Param("id") id: string) {
    return this.documents.get(tenant.organizationId, id);
  }

  @Roles("EDITOR")
  @Post()
  create(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDocumentDto) {
    return this.documents.create(tenant.organizationId, user.userId, dto);
  }

  @Roles("EDITOR")
  @Patch(":id")
  update(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(tenant.organizationId, id, user.userId, dto);
  }
}
