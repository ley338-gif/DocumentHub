import { Body, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { AppError } from "../common/errors/app-error";
import { ImportsService } from "./imports.service";
import { ImportPreviewBodyDto } from "./dto/import-preview.dto";

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
    @Body() body: ImportPreviewBodyDto,
  ) {
    const columnMapping = parseColumnMapping(body.columnMapping);
    return this.imports.preview(tenant.organizationId, user.userId, file, columnMapping);
  }

  @Roles("EDITOR")
  @Post(":importId/commit")
  commit(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Param("importId") importId: string) {
    return this.imports.commit(tenant.organizationId, user.userId, importId);
  }
}

function parseColumnMapping(raw: string | undefined): Partial<Record<string, number>> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION_ERROR", "columnMapping must be a JSON object of field name to column index");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError("VALIDATION_ERROR", "columnMapping must be a JSON object of field name to column index");
  }
  return parsed as Partial<Record<string, number>>;
}
