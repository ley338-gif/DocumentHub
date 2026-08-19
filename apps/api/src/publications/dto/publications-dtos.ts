import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { PublicationStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../common/pagination";

export class PublishRevisionDto {
  @IsString()
  revisionId!: string;
}

export class PublicationListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PublicationStatus)
  status?: PublicationStatus;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  // Range on publishedAt, inclusive.
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ResolveQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
