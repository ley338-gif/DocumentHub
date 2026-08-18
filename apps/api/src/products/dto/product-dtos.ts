import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { ProductStatus } from "@prisma/client";

export class CreateProductFamilyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  internalReference?: string;
}

export class UpdateProductFamilyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  internalReference?: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  productFamilyId?: string;

  @IsOptional()
  @IsString()
  internalProductNumber?: string;

  @IsOptional()
  @IsString()
  modelDesignation?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  productFamilyId?: string;

  @IsOptional()
  @IsString()
  internalProductNumber?: string;

  @IsOptional()
  @IsString()
  modelDesignation?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  internalVariantNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  internalVariantNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export class CreateBatchDto {
  @IsString()
  productId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsDateString()
  manufacturedFrom?: string;

  @IsOptional()
  @IsDateString()
  manufacturedTo?: string;

  @IsOptional()
  @IsString()
  internalReference?: string;
}

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsDateString()
  manufacturedFrom?: string;

  @IsOptional()
  @IsDateString()
  manufacturedTo?: string;

  @IsOptional()
  @IsString()
  internalReference?: string;
}

export class CreateUnitDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsString()
  @MinLength(1)
  serialNumber!: string;

  @IsOptional()
  @IsDateString()
  manufacturedAt?: string;

  @IsOptional()
  @IsDateString()
  deliveredAt?: string;

  @IsOptional()
  @IsString()
  internalReference?: string;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsDateString()
  manufacturedAt?: string;

  @IsOptional()
  @IsDateString()
  deliveredAt?: string;

  @IsOptional()
  @IsString()
  internalReference?: string;
}
