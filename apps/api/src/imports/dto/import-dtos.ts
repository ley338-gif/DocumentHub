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
  // The raw header row as uploaded, and the mapping actually used to
  // interpret every row above (auto-detected unless the caller supplied
  // `columnMapping`) — lets a UI render a real, editable "assign columns"
  // step pre-filled with what was detected, rather than a hardcoded guess
  // the user can't change. Re-calling preview with an explicit
  // `columnMapping` re-validates every row against the corrected mapping;
  // nothing is persisted by this call either way.
  headers: string[];
  columnMapping: Partial<Record<string, number>>;
}

export interface ImportCommitResponseDto {
  importId: string;
  importedCount: number;
}
