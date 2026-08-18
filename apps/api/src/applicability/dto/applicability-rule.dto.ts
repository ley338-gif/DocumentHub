import { IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";

export class CreateApplicabilityRuleDto {
  @IsOptional()
  @IsString()
  productFamilyId?: string;

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
  serialFrom?: string;

  @IsOptional()
  @IsString()
  serialTo?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  explicitExclusion?: boolean;
}

export class UpdateApplicabilityRuleDto extends CreateApplicabilityRuleDto {}
