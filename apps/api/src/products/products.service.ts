import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { normalizePagination, PaginationQueryDto, toPaginated } from "../common/pagination";
import { parseSerial } from "../applicability/serial";
import {
  CreateBatchDto,
  CreateProductDto,
  CreateProductFamilyDto,
  CreateUnitDto,
  CreateVariantDto,
  UpdateBatchDto,
  UpdateProductDto,
  UpdateProductFamilyDto,
  UpdateUnitDto,
  UpdateVariantDto,
} from "./dto/product-dtos";

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Product Families -----------------------------------------------

  async listFamilies(organizationId: string, query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.productFamily.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      this.prisma.productFamily.count({ where }),
    ]);
    return toPaginated(items, total, page, pageSize);
  }

  async createFamily(organizationId: string, actorId: string, dto: CreateProductFamilyDto) {
    const family = await this.prisma.productFamily.create({
      data: { organizationId, name: dto.name, description: dto.description, internalReference: dto.internalReference },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: "PRODUCT_FAMILY_CREATED",
      objectType: "ProductFamily",
      objectId: family.id,
      after: family,
    });
    return family;
  }

  async updateFamily(organizationId: string, id: string, actorId: string, dto: UpdateProductFamilyDto) {
    const before = await this.requireFamily(organizationId, id);
    const updated = await this.prisma.productFamily.update({ where: { id }, data: dto });
    await this.audit.record({
      organizationId,
      actorId,
      action: "PRODUCT_UPDATED",
      objectType: "ProductFamily",
      objectId: id,
      before,
      after: updated,
    });
    return updated;
  }

  private async requireFamily(organizationId: string, id: string) {
    const family = await this.prisma.productFamily.findFirst({ where: { id, organizationId } });
    if (!family) throw new AppError("NOT_FOUND", "Product family not found");
    return family;
  }

  // ---- Products ----------------------------------------------------------

  async listProducts(organizationId: string, query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      this.prisma.product.count({ where }),
    ]);
    return toPaginated(items, total, page, pageSize);
  }

  async getProduct(organizationId: string, id: string) {
    return this.requireProduct(organizationId, id);
  }

  async createProduct(organizationId: string, actorId: string, dto: CreateProductDto) {
    if (dto.productFamilyId) {
      await this.requireFamily(organizationId, dto.productFamilyId);
    }
    const product = await this.prisma.product.create({
      data: {
        organizationId,
        name: dto.name,
        productFamilyId: dto.productFamilyId,
        internalProductNumber: dto.internalProductNumber,
        modelDesignation: dto.modelDesignation,
        description: dto.description,
        status: dto.status,
      },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: "PRODUCT_CREATED",
      objectType: "Product",
      objectId: product.id,
      after: product,
    });
    return product;
  }

  async updateProduct(organizationId: string, id: string, actorId: string, dto: UpdateProductDto) {
    const before = await this.requireProduct(organizationId, id);
    if (dto.productFamilyId) {
      await this.requireFamily(organizationId, dto.productFamilyId);
    }
    const updated = await this.prisma.product.update({ where: { id }, data: dto });
    await this.audit.record({
      organizationId,
      actorId,
      action: "PRODUCT_UPDATED",
      objectType: "Product",
      objectId: id,
      before,
      after: updated,
    });
    return updated;
  }

  private async requireProduct(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, organizationId } });
    if (!product) throw new AppError("NOT_FOUND", "Product not found");
    return product;
  }

  // ---- Variants ------------------------------------------------------------

  async listVariants(organizationId: string, productId: string, query: PaginationQueryDto) {
    await this.requireProduct(organizationId, productId);
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = { organizationId, productId };
    const [items, total] = await Promise.all([
      this.prisma.productVariant.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      this.prisma.productVariant.count({ where }),
    ]);
    return toPaginated(items, total, page, pageSize);
  }

  async createVariant(organizationId: string, productId: string, actorId: string, dto: CreateVariantDto) {
    await this.requireProduct(organizationId, productId);
    const variant = await this.prisma.productVariant.create({
      data: {
        organizationId,
        productId,
        name: dto.name,
        internalVariantNumber: dto.internalVariantNumber,
        description: dto.description,
        status: dto.status,
      },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: "VARIANT_CREATED",
      objectType: "ProductVariant",
      objectId: variant.id,
      after: variant,
    });
    return variant;
  }

  async updateVariant(
    organizationId: string,
    productId: string,
    id: string,
    actorId: string,
    dto: UpdateVariantDto,
  ) {
    const before = await this.requireVariant(organizationId, productId, id);
    const updated = await this.prisma.productVariant.update({ where: { id }, data: dto });
    await this.audit.record({
      organizationId,
      actorId,
      action: "VARIANT_UPDATED",
      objectType: "ProductVariant",
      objectId: id,
      before,
      after: updated,
    });
    return updated;
  }

  private async requireVariant(organizationId: string, productId: string, id: string) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id, organizationId, productId } });
    if (!variant) throw new AppError("NOT_FOUND", "Product variant not found");
    return variant;
  }

  // ---- Batches -------------------------------------------------------------

  async listBatches(organizationId: string, query: PaginationQueryDto & { productId?: string }) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = { organizationId, ...(query.productId ? { productId: query.productId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.batch.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      this.prisma.batch.count({ where }),
    ]);
    return toPaginated(items, total, page, pageSize);
  }

  async createBatch(organizationId: string, actorId: string, dto: CreateBatchDto) {
    await this.requireProduct(organizationId, dto.productId);
    const batch = await this.prisma.batch.create({
      data: {
        organizationId,
        productId: dto.productId,
        name: dto.name,
        manufacturedFrom: dto.manufacturedFrom ? new Date(dto.manufacturedFrom) : undefined,
        manufacturedTo: dto.manufacturedTo ? new Date(dto.manufacturedTo) : undefined,
        internalReference: dto.internalReference,
      },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: "BATCH_CREATED",
      objectType: "Batch",
      objectId: batch.id,
      after: batch,
    });
    return batch;
  }

  async updateBatch(organizationId: string, id: string, actorId: string, dto: UpdateBatchDto) {
    const before = await this.requireBatch(organizationId, id);
    const updated = await this.prisma.batch.update({
      where: { id },
      data: {
        ...dto,
        manufacturedFrom: dto.manufacturedFrom ? new Date(dto.manufacturedFrom) : undefined,
        manufacturedTo: dto.manufacturedTo ? new Date(dto.manufacturedTo) : undefined,
      },
    });
    await this.audit.record({
      organizationId,
      actorId,
      action: "BATCH_UPDATED",
      objectType: "Batch",
      objectId: id,
      before,
      after: updated,
    });
    return updated;
  }

  private async requireBatch(organizationId: string, id: string) {
    const batch = await this.prisma.batch.findFirst({ where: { id, organizationId } });
    if (!batch) throw new AppError("NOT_FOUND", "Batch not found");
    return batch;
  }

  // ---- Units ---------------------------------------------------------------

  async listUnits(organizationId: string, query: PaginationQueryDto & { productId?: string; serialNumber?: string }) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where = {
      organizationId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.serialNumber ? { serialNumber: query.serialNumber } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.unit.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      this.prisma.unit.count({ where }),
    ]);
    return toPaginated(items, total, page, pageSize);
  }

  async createUnit(organizationId: string, actorId: string, dto: CreateUnitDto) {
    await this.requireProduct(organizationId, dto.productId);

    // spec §40: relations referenced by a unit must be tenant- AND
    // product-consistent. Prisma FK constraints alone don't cross-check
    // productId, so we enforce it explicitly here.
    if (dto.variantId) {
      const variant = await this.requireVariant(organizationId, dto.productId, dto.variantId);
      if (variant.productId !== dto.productId) {
        throw new AppError("VALIDATION_ERROR", "Variant does not belong to the given product");
      }
    }
    if (dto.batchId) {
      const batch = await this.requireBatch(organizationId, dto.batchId);
      if (batch.productId !== dto.productId) {
        throw new AppError("VALIDATION_ERROR", "Batch does not belong to the given product");
      }
    }

    const existing = await this.prisma.unit.findUnique({
      where: { organizationId_serialNumber: { organizationId, serialNumber: dto.serialNumber } },
    });
    if (existing) {
      throw new AppError("VALIDATION_ERROR", "A unit with this serial number already exists in this organization");
    }

    const parsed = parseSerial(dto.serialNumber);

    const unit = await this.prisma.unit.create({
      data: {
        organizationId,
        productId: dto.productId,
        variantId: dto.variantId,
        batchId: dto.batchId,
        serialNumber: dto.serialNumber,
        serialPrefix: parsed.prefix,
        serialSequence: parsed.sequence,
        serialSeqLength: parsed.sequenceLength,
        manufacturedAt: dto.manufacturedAt ? new Date(dto.manufacturedAt) : undefined,
        deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : undefined,
        internalReference: dto.internalReference,
      },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "UNIT_CREATED",
      objectType: "Unit",
      objectId: unit.id,
      after: { ...unit, serialSequence: unit.serialSequence.toString() },
    });

    return unit;
  }

  async updateUnit(organizationId: string, id: string, actorId: string, dto: UpdateUnitDto) {
    const before = await this.requireUnit(organizationId, id);

    if (dto.variantId) {
      const variant = await this.requireVariant(organizationId, before.productId, dto.variantId);
      if (variant.productId !== before.productId) {
        throw new AppError("VALIDATION_ERROR", "Variant does not belong to this unit's product");
      }
    }
    if (dto.batchId) {
      const batch = await this.requireBatch(organizationId, dto.batchId);
      if (batch.productId !== before.productId) {
        throw new AppError("VALIDATION_ERROR", "Batch does not belong to this unit's product");
      }
    }

    const updated = await this.prisma.unit.update({
      where: { id },
      data: {
        variantId: dto.variantId,
        batchId: dto.batchId,
        manufacturedAt: dto.manufacturedAt ? new Date(dto.manufacturedAt) : undefined,
        deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : undefined,
        internalReference: dto.internalReference,
      },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "UNIT_UPDATED",
      objectType: "Unit",
      objectId: id,
      before: { ...before, serialSequence: before.serialSequence.toString() },
      after: { ...updated, serialSequence: updated.serialSequence.toString() },
    });

    return updated;
  }

  private async requireUnit(organizationId: string, id: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id, organizationId } });
    if (!unit) throw new AppError("NOT_FOUND", "Unit not found");
    return unit;
  }
}
