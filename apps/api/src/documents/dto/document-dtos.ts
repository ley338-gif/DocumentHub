import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  documentType!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateRevisionMetaDto {
  @IsString()
  @MinLength(1)
  revision!: string;

  @IsString()
  @MinLength(2)
  language!: string;

  @IsOptional()
  @IsString()
  internalNote?: string;

  @IsOptional()
  @IsString()
  changeDescription?: string;
}
