import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { RevisionsService } from "./revisions.service";
import { CreateRevisionMetaDto } from "./dto/document-dtos";

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("documents/:documentId/revisions")
export class RevisionsController {
  constructor(private readonly revisions: RevisionsService) {}

  @Roles("VIEWER")
  @Get()
  list(@Tenant() tenant: TenantContext, @Param("documentId") documentId: string) {
    return this.revisions.list(tenant.organizationId, documentId);
  }

  @Roles("EDITOR")
  @Post()
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId") documentId: string,
    @Body() dto: CreateRevisionMetaDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.revisions.upload(tenant.organizationId, documentId, user.userId, dto, file);
  }

  @Roles("VIEWER")
  @Get(":id")
  get(@Tenant() tenant: TenantContext, @Param("id") id: string) {
    return this.revisions.get(tenant.organizationId, id);
  }

  @Roles("VIEWER")
  @Get(":id/file")
  async download(@Tenant() tenant: TenantContext, @Param("id") id: string, @Res() res: Response) {
    const { buffer, revision } = await this.revisions.downloadFile(tenant.organizationId, id);
    res.setHeader("Content-Type", revision.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${revision.originalFilename}"`);
    res.send(buffer);
  }

  @Roles("EDITOR")
  @Patch(":id/submit")
  submit(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.revisions.submit(tenant.organizationId, id, user.userId);
  }

  @Roles("PUBLISHER")
  @Patch(":id/approve")
  approve(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.revisions.approve(tenant.organizationId, id, user.userId);
  }

  @Roles("PUBLISHER")
  @Patch(":id/retire")
  retire(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.revisions.retire(tenant.organizationId, id, user.userId);
  }
}
