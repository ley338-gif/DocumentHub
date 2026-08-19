import { IsOptional, IsString } from "class-validator";

export class ImportPreviewBodyDto {
  // JSON-stringified Partial<Record<CanonicalField, number>> (column
  // indices), e.g. '{"serialNumber":2,"productReference":0}' — a multipart
  // form field can only carry strings, so the mapping-review UI step
  // serializes its edited mapping into this one field rather than several
  // separate ones. Omit entirely to use pure auto-detection.
  @IsOptional()
  @IsString()
  columnMapping?: string;
}
