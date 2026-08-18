import { Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { ImportsService } from "./imports.service";

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("imports/units")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Roles("EDITOR")
  @Post("preview")
  @UseInterceptors(FileInterceptor("file"))
  preview(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.preview(tenant.organizationId, user.userId, file);
  }

  @Roles("EDITOR")
  @Post(":importId/commit")
  commit(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Param("importId") importId: string) {
    return this.imports.commit(tenant.organizationId, user.userId, importId);
  }
}
