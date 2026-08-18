import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TenantContext, AuthenticatedUser } from "../common/request-context";
import { PaginationQueryDto } from "../common/pagination";
import { IsOptional, IsString } from "class-validator";
import { ProductsService } from "./products.service";
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

class ProductListQueryDto extends PaginationQueryDto {}

class BatchListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;
}

class UnitListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;
}

const READ_ROLE = "VIEWER" as const;
const WRITE_ROLE = "EDITOR" as const;

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("product-families")
export class ProductFamiliesController {
  constructor(private readonly products: ProductsService) {}

  @Roles(READ_ROLE)
  @Get()
  list(@Tenant() tenant: TenantContext, @Query() query: ProductListQueryDto) {
    return this.products.listFamilies(tenant.organizationId, query);
  }

  @Roles(WRITE_ROLE)
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductFamilyDto,
  ) {
    return this.products.createFamily(tenant.organizationId, user.userId, dto);
  }

  @Roles(WRITE_ROLE)
  @Patch(":id")
  update(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateProductFamilyDto,
  ) {
    return this.products.updateFamily(tenant.organizationId, id, user.userId, dto);
  }
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(READ_ROLE)
  @Get()
  list(@Tenant() tenant: TenantContext, @Query() query: ProductListQueryDto) {
    return this.products.listProducts(tenant.organizationId, query);
  }

  @Roles(READ_ROLE)
  @Get(":id")
  get(@Tenant() tenant: TenantContext, @Param("id") id: string) {
    return this.products.getProduct(tenant.organizationId, id);
  }

  @Roles(WRITE_ROLE)
  @Post()
  create(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.products.createProduct(tenant.organizationId, user.userId, dto);
  }

  @Roles(WRITE_ROLE)
  @Patch(":id")
  update(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.updateProduct(tenant.organizationId, id, user.userId, dto);
  }

  @Roles(READ_ROLE)
  @Get(":productId/variants")
  listVariants(
    @Tenant() tenant: TenantContext,
    @Param("productId") productId: string,
    @Query() query: ProductListQueryDto,
  ) {
    return this.products.listVariants(tenant.organizationId, productId, query);
  }

  @Roles(WRITE_ROLE)
  @Post(":productId/variants")
  createVariant(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("productId") productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.products.createVariant(tenant.organizationId, productId, user.userId, dto);
  }

  @Roles(WRITE_ROLE)
  @Patch(":productId/variants/:id")
  updateVariant(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("productId") productId: string,
    @Param("id") id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(tenant.organizationId, productId, id, user.userId, dto);
  }
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("batches")
export class BatchesController {
  constructor(private readonly products: ProductsService) {}

  @Roles(READ_ROLE)
  @Get()
  list(@Tenant() tenant: TenantContext, @Query() query: BatchListQueryDto) {
    return this.products.listBatches(tenant.organizationId, query);
  }

  @Roles(WRITE_ROLE)
  @Post()
  create(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBatchDto) {
    return this.products.createBatch(tenant.organizationId, user.userId, dto);
  }

  @Roles(WRITE_ROLE)
  @Patch(":id")
  update(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.products.updateBatch(tenant.organizationId, id, user.userId, dto);
  }
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller("units")
export class UnitsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(READ_ROLE)
  @Get()
  list(@Tenant() tenant: TenantContext, @Query() query: UnitListQueryDto) {
    return this.products.listUnits(tenant.organizationId, query);
  }

  @Roles(WRITE_ROLE)
  @Post()
  create(@Tenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUnitDto) {
    return this.products.createUnit(tenant.organizationId, user.userId, dto);
  }

  @Roles(WRITE_ROLE)
  @Patch(":id")
  update(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.products.updateUnit(tenant.organizationId, id, user.userId, dto);
  }
}
