import { Injectable } from "@nestjs/common";
import * as QRCode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../common/errors/app-error";

// spec §32: the QR payload is exactly the public page URL — nothing else.
// No revision, no internal/database id, no serial number. A stable, opaque
// stableId is the only thing embedded, so a printed/engraved QR code never
// needs reprinting as documents change.
function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
}

export function buildProductPublicUrl(stableId: string): string {
  return `${publicBaseUrl()}/p/${stableId}`;
}

export function buildUnitPublicUrl(stableId: string): string {
  return `${publicBaseUrl()}/u/${stableId}`;
}

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  async productQrSvg(organizationId: string, productId: string): Promise<string> {
    const url = await this.resolveProductUrl(organizationId, productId);
    return QRCode.toString(url, { type: "svg" });
  }

  async productQrPng(organizationId: string, productId: string): Promise<Buffer> {
    const url = await this.resolveProductUrl(organizationId, productId);
    return QRCode.toBuffer(url, { type: "png" });
  }

  async unitQrSvg(organizationId: string, unitId: string): Promise<string> {
    const url = await this.resolveUnitUrl(organizationId, unitId);
    return QRCode.toString(url, { type: "svg" });
  }

  async unitQrPng(organizationId: string, unitId: string): Promise<Buffer> {
    const url = await this.resolveUnitUrl(organizationId, unitId);
    return QRCode.toBuffer(url, { type: "png" });
  }

  private async resolveProductUrl(organizationId: string, productId: string): Promise<string> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, organizationId } });
    if (!product) throw new AppError("NOT_FOUND", "Product not found");
    return buildProductPublicUrl(product.stableId);
  }

  private async resolveUnitUrl(organizationId: string, unitId: string): Promise<string> {
    const unit = await this.prisma.unit.findFirst({ where: { id: unitId, organizationId } });
    if (!unit) throw new AppError("NOT_FOUND", "Unit not found");
    return buildUnitPublicUrl(unit.stableId);
  }
}
