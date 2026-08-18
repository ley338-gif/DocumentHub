export interface ValidRowPreviewDto {
  line: number;
  serialNumber: string;
  productId: string;
  productName: string;
  variantId: string | null;
  batchId: string | null;
  manufacturedAt: string | null;
  deliveredAt: string | null;
  internalReference: string | null;
}

export interface InvalidRowDto {
  row: number;
  errors: string[];
}

export interface ImportPreviewResponseDto {
  importId: string;
  totalRows: number;
  validRows: ValidRowPreviewDto[];
  invalidRows: InvalidRowDto[];
  unknownColumns: string[];
}

export interface ImportCommitResponseDto {
  importId: string;
  importedCount: number;
}
