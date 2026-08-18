import { Controller, Get, Header, Param, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { TenantContext } from "../common/request-context";
import { QrService } from "./qr.service";

const READ_ROLE = "VIEWER" as const;

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("products/:id")
export class ProductQrController {
  constructor(private readonly qr: QrService) {}

  @Roles(READ_ROLE)
  @Get("qr.svg")
  @Header("Content-Type", "image/svg+xml")
  async svg(@Tenant() tenant: TenantContext, @Param("id") id: string) {
    return this.qr.productQrSvg(tenant.organizationId, id);
  }

  @Roles(READ_ROLE)
  @Get("qr.png")
  async png(@Tenant() tenant: TenantContext, @Param("id") id: string, @Res() res: Response) {
    const buffer = await this.qr.productQrPng(tenant.organizationId, id);
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
  }
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("units/:id")
export class UnitQrController {
  constructor(private readonly qr: QrService) {}

  @Roles(READ_ROLE)
  @Get("qr.svg")
  @Header("Content-Type", "image/svg+xml")
  async svg(@Tenant() tenant: TenantContext, @Param("id") id: string) {
    return this.qr.unitQrSvg(tenant.organizationId, id);
  }

  @Roles(READ_ROLE)
  @Get("qr.png")
  async png(@Tenant() tenant: TenantContext, @Param("id") id: string, @Res() res: Response) {
    const buffer = await this.qr.unitQrPng(tenant.organizationId, id);
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
  }
}
