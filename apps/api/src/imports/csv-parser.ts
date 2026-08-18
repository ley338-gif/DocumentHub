// Dependency-free CSV parsing + header/row normalization for the unit import
// pipeline (spec §33-35). Kept dependency-free deliberately: the format we
// need to support (RFC4180-ish: comma-separated, optional double-quoting,
// "" as an escaped quote, CRLF or LF line endings) is small and stable
// enough that a ~30 line hand-rolled parser carries less risk than adding
// and pinning a new dependency across the workspace lockfile for it. If the
// contract grows (e.g. semicolon-delimited exports, alternate encodings)
// switching to `csv-parse` is a contained change — everything downstream
// consumes `string[][]`, not this file's internals.
//
// Every function here is pure (no I/O, no Prisma) so it can be unit tested
// directly — see csv-parser.spec.ts. Prisma-backed reference resolution
// (product/variant/batch lookups, existing-serial checks) lives in
// imports.service.ts, one layer up.

/** Parses raw CSV text into rows of raw string cells (header row included). */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyContentInRow = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    sawAnyContentInRow = false;
  };

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      sawAnyContentInRow = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      sawAnyContentInRow = true;
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    sawAnyContentInRow = true;
    i++;
  }

  if (sawAnyContentInRow || field.length > 0) {
    pushRow();
  }

  return rows;
}

/** Whether a parsed row is blank (all cells empty/whitespace) — these are skipped, not errors. */
export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

// ---------------------------------------------------------------------------
// Header contract — see docs/csv-import.md for the human-readable version.
// ---------------------------------------------------------------------------

export const CANONICAL_FIELDS = [
  "serialNumber",
  "productReference",
  "variantReference",
  "batchReference",
  "manufacturedAt",
  "deliveredAt",
  "internalReference",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

// Normalizing both the header cell and the alias keys down to [a-z0-9] makes
// "Serial Number", "serial_number", "SerialNumber" and "serial-number" all
// collapse onto the same key, so we don't need to enumerate every
// punctuation variant by hand.
function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIAS_TO_FIELD: Record<string, CanonicalField> = {
  serialnumber: "serialNumber",
  serial: "serialNumber",
  productreference: "productReference",
  product: "productReference",
  productid: "productReference",
  variantreference: "variantReference",
  variant: "variantReference",
  batchreference: "batchReference",
  batch: "batchReference",
  manufacturedat: "manufacturedAt",
  manufactured: "manufacturedAt",
  deliveredat: "deliveredAt",
  delivered: "deliveredAt",
  internalreference: "internalReference",
  internalref: "internalReference",
};

export interface HeaderMap {
  columnByField: Partial<Record<CanonicalField, number>>;
  unknownColumns: string[];
}

export function mapHeaders(headerRow: string[]): HeaderMap {
  const columnByField: Partial<Record<CanonicalField, number>> = {};
  const unknownColumns: string[] = [];

  headerRow.forEach((rawCell, index) => {
    const normalized = normalizeHeaderCell(rawCell);
    const field = ALIAS_TO_FIELD[normalized];
    if (field && columnByField[field] === undefined) {
      columnByField[field] = index;
    } else if (!field && rawCell.trim().length > 0) {
      // Unknown columns are ignored (not an error) — spec §34.
      unknownColumns.push(rawCell.trim());
    }
  });

  return { columnByField, unknownColumns };
}

export interface RawImportRow {
  /** 1-based line number in the uploaded file, header counted as line 1 — lets a user jump straight to the offending row in a spreadsheet. */
  line: number;
  serialNumber: string;
  productReference: string;
  variantReference: string | null;
  batchReference: string | null;
  manufacturedAtRaw: string | null;
  deliveredAtRaw: string | null;
  internalReference: string | null;
}

function cell(row: string[], index: number | undefined): string | null {
  if (index === undefined) return null;
  const value = row[index];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractRow(row: string[], headers: HeaderMap, line: number): RawImportRow {
  return {
    line,
    serialNumber: cell(row, headers.columnByField.serialNumber) ?? "",
    productReference: cell(row, headers.columnByField.productReference) ?? "",
    variantReference: cell(row, headers.columnByField.variantReference),
    batchReference: cell(row, headers.columnByField.batchReference),
    manufacturedAtRaw: cell(row, headers.columnByField.manufacturedAt),
    deliveredAtRaw: cell(row, headers.columnByField.deliveredAt),
    internalReference: cell(row, headers.columnByField.internalReference),
  };
}

/** Parses an ISO-ish date string; returns null if blank, undefined if unparseable. */
export function parseOptionalDate(raw: string | null): Date | null | undefined {
  if (raw === null) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export interface RowShapeValidation {
  errors: string[];
  manufacturedAt: Date | null;
  deliveredAt: Date | null;
}

/** Structural / self-contained validation — no DB access. */
export function validateRowShape(row: RawImportRow): RowShapeValidation {
  const errors: string[] = [];

  if (!row.serialNumber) {
    errors.push("serialNumber is required");
  }
  if (!row.productReference) {
    errors.push("productReference is required");
  }

  const manufacturedAt = parseOptionalDate(row.manufacturedAtRaw);
  if (manufacturedAt === undefined) {
    errors.push(`manufacturedAt "${row.manufacturedAtRaw}" is not a valid date`);
  }
  const deliveredAt = parseOptionalDate(row.deliveredAtRaw);
  if (deliveredAt === undefined) {
    errors.push(`deliveredAt "${row.deliveredAtRaw}" is not a valid date`);
  }

  return {
    errors,
    manufacturedAt: manufacturedAt === undefined ? null : manufacturedAt,
    deliveredAt: deliveredAt === undefined ? null : deliveredAt,
  };
}

/** Serial numbers (case-sensitive, exact match) that appear more than once in the file. */
export function findDuplicateSerialsInFile(rows: RawImportRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.serialNumber) continue;
    counts.set(row.serialNumber, (counts.get(row.serialNumber) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [serial, count] of counts) {
    if (count > 1) duplicates.add(serial);
  }
  return duplicates;
}
