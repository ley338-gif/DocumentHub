import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { parseSerial } from "../applicability/serial";
import {
  extractRow,
  findDuplicateSerialsInFile,
  isBlankRow,
  mapHeaders,
  parseCsvText,
  RawImportRow,
  validateRowShape,
} from "./csv-parser";
import { PendingImportStore } from "./pending-import.store";
import { ImportCommitResponseDto, ImportPreviewResponseDto, InvalidRowDto, ValidRowPreviewDto } from "./dto/import-dtos";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB — comfortably covers a 5,000+ row CSV.
const LOOKUP_CHUNK_SIZE = 2000; // defensive chunking for IN(...) clauses on very large files.

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: PendingImportStore,
  ) {}

  async preview(
    organizationId: string,
    actorId: string,
    file: { buffer: Buffer; size: number } | undefined,
    columnMappingOverride?: Partial<Record<string, number>>,
  ): Promise<ImportPreviewResponseDto> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new AppError("FILE_VALIDATION_FAILED", "No CSV file uploaded");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AppError("FILE_VALIDATION_FAILED", "CSV file exceeds maximum allowed size (20MB)");
    }

    const text = file.buffer.toString("utf-8");
    // Not filtered here — row indices must still line up with real file
    // line numbers below, including blank lines, which are skipped later.
    const allRows = parseCsvText(text);
    if (allRows.length === 0 || isBlankRow(allRows[0])) {
      throw new AppError("FILE_VALIDATION_FAILED", "CSV file has no header row");
    }

    // Auto-detected unless the caller (the mapping-review UI step) supplies
    // an explicit override — see mapHeaders' doc comment.
    const headers = mapHeaders(allRows[0], columnMappingOverride);
    if (headers.columnByField.serialNumber === undefined) {
      throw new AppError("FILE_VALIDATION_FAILED", "CSV must include a serialNumber (or serial_number) column");
    }
    if (headers.columnByField.productReference === undefined) {
      throw new AppError("FILE_VALIDATION_FAILED", "CSV must include a productReference (or product) column");
    }

    // Real file line numbers (header = line 1) while skipping blank lines,
    // so validation errors can point a user straight at the offending row
    // in their spreadsheet.
    const rawRows: RawImportRow[] = [];
    const bodyRows = allRows.slice(1);
    for (let i = 0; i < bodyRows.length; i++) {
      if (isBlankRow(bodyRows[i])) continue;
      rawRows.push(extractRow(bodyRows[i], headers, i + 2));
    }

    const duplicatesInFile = findDuplicateSerialsInFile(rawRows);

    const shapeErrorsByLine = new Map<number, string[]>();
    const parsedDatesByLine = new Map<number, { manufacturedAt: Date | null; deliveredAt: Date | null }>();
    for (const row of rawRows) {
      const shape = validateRowShape(row);
      const errors = [...shape.errors];
      if (row.serialNumber && duplicatesInFile.has(row.serialNumber)) {
        errors.push(`serialNumber "${row.serialNumber}" appears more than once in this file`);
      }
      shapeErrorsByLine.set(row.line, errors);
      parsedDatesByLine.set(row.line, { manufacturedAt: shape.manufacturedAt, deliveredAt: shape.deliveredAt });
    }

    // ---- Batched reference resolution (never one query per row) ----------

    const productRefs = [...new Set(rawRows.map((r) => r.productReference).filter((v): v is string => !!v))];
    const products = productRefs.length
      ? await this.prisma.product.findMany({
          where: {
            organizationId,
            OR: [{ stableId: { in: productRefs } }, { internalProductNumber: { in: productRefs } }],
          },
        })
      : [];
    const productByStableId = new Map(products.map((p) => [p.stableId, p]));
    const productsByInternalNumber = new Map<string, typeof products>();
    for (const p of products) {
      if (!p.internalProductNumber) continue;
      const list = productsByInternalNumber.get(p.internalProductNumber) ?? [];
      list.push(p);
      productsByInternalNumber.set(p.internalProductNumber, list);
    }

    const resolveProduct = (ref: string): { product: (typeof products)[number] | null; error: string | null } => {
      const byStable = productByStableId.get(ref);
      if (byStable) return { product: byStable, error: null };
      const byNumber = productsByInternalNumber.get(ref);
      if (byNumber && byNumber.length === 1) return { product: byNumber[0], error: null };
      if (byNumber && byNumber.length > 1) {
        return { product: null, error: `productReference "${ref}" matches more than one product by internalProductNumber` };
      }
      return { product: null, error: `productReference "${ref}" does not match any product in this organization` };
    };

    const resolvedProductByLine = new Map<number, { product: (typeof products)[number] | null; error: string | null }>();
    for (const row of rawRows) {
      resolvedProductByLine.set(row.line, row.productReference ? resolveProduct(row.productReference) : { product: null, error: null });
    }

    const resolvedProductIds = [
      ...new Set(
        [...resolvedProductByLine.values()].map((r) => r.product?.id).filter((v): v is string => !!v),
      ),
    ];

    const variantRefs = [...new Set(rawRows.map((r) => r.variantReference).filter((v): v is string => !!v))];
    const variants =
      variantRefs.length && resolvedProductIds.length
        ? await this.prisma.productVariant.findMany({
            where: {
              organizationId,
              OR: [
                { stableId: { in: variantRefs } },
                { AND: [{ productId: { in: resolvedProductIds } }, { internalVariantNumber: { in: variantRefs } }] },
              ],
            },
          })
        : [];
    const variantByStableId = new Map(variants.map((v) => [v.stableId, v]));
    const variantsByProductAndNumber = new Map<string, typeof variants>();
    for (const v of variants) {
      if (!v.internalVariantNumber) continue;
      const key = `${v.productId}::${v.internalVariantNumber}`;
      const list = variantsByProductAndNumber.get(key) ?? [];
      list.push(v);
      variantsByProductAndNumber.set(key, list);
    }

    const batchRefs = [...new Set(rawRows.map((r) => r.batchReference).filter((v): v is string => !!v))];
    const batches =
      batchRefs.length && resolvedProductIds.length
        ? await this.prisma.batch.findMany({
            where: {
              organizationId,
              OR: [
                { stableId: { in: batchRefs } },
                { AND: [{ productId: { in: resolvedProductIds } }, { internalReference: { in: batchRefs } }] },
                { AND: [{ productId: { in: resolvedProductIds } }, { name: { in: batchRefs } }] },
              ],
            },
          })
        : [];
    const batchByStableId = new Map(batches.map((b) => [b.stableId, b]));
    const batchesByProductAndRef = new Map<string, typeof batches>();
    for (const b of batches) {
      for (const key of [b.internalReference, b.name]) {
        if (!key) continue;
        const mapKey = `${b.productId}::${key}`;
        const list = batchesByProductAndRef.get(mapKey) ?? [];
        list.push(b);
        batchesByProductAndRef.set(mapKey, list);
      }
    }

    const allSerials = [...new Set(rawRows.map((r) => r.serialNumber).filter((v) => !!v))];
    const existingSerials = new Set<string>();
    for (const batch of chunk(allSerials, LOOKUP_CHUNK_SIZE)) {
      if (batch.length === 0) continue;
      const found = await this.prisma.unit.findMany({
        where: { organizationId, serialNumber: { in: batch } },
        select: { serialNumber: true },
      });
      for (const u of found) existingSerials.add(u.serialNumber);
    }

    // ---- Assemble per-row results -----------------------------------------

    const validRows: ValidRowPreviewDto[] = [];
    const invalidRows: InvalidRowDto[] = [];
    const pendingRows: import("./pending-import.store").PendingImportRow[] = [];

    for (const row of rawRows) {
      const errors = [...(shapeErrorsByLine.get(row.line) ?? [])];
      const resolvedProduct = resolvedProductByLine.get(row.line)!;

      if (resolvedProduct.error) errors.push(resolvedProduct.error);

      let variantId: string | null = null;
      if (row.variantReference && resolvedProduct.product) {
        const byStable = variantByStableId.get(row.variantReference);
        if (byStable) {
          if (byStable.productId !== resolvedProduct.product.id) {
            errors.push(`variantReference "${row.variantReference}" does not belong to product "${row.productReference}"`);
          } else {
            variantId = byStable.id;
          }
        } else {
          const byNumber = variantsByProductAndNumber.get(`${resolvedProduct.product.id}::${row.variantReference}`);
          if (byNumber && byNumber.length === 1) {
            variantId = byNumber[0].id;
          } else if (byNumber && byNumber.length > 1) {
            errors.push(`variantReference "${row.variantReference}" is ambiguous for product "${row.productReference}"`);
          } else {
            errors.push(`variantReference "${row.variantReference}" does not match any variant of product "${row.productReference}"`);
          }
        }
      }

      let batchId: string | null = null;
      if (row.batchReference && resolvedProduct.product) {
        const byStable = batchByStableId.get(row.batchReference);
        if (byStable) {
          if (byStable.productId !== resolvedProduct.product.id) {
            errors.push(`batchReference "${row.batchReference}" does not belong to product "${row.productReference}"`);
          } else {
            batchId = byStable.id;
          }
        } else {
          const byRef = batchesByProductAndRef.get(`${resolvedProduct.product.id}::${row.batchReference}`);
          if (byRef && byRef.length === 1) {
            batchId = byRef[0].id;
          } else if (byRef && byRef.length > 1) {
            errors.push(`batchReference "${row.batchReference}" is ambiguous for product "${row.productReference}"`);
          } else {
            errors.push(`batchReference "${row.batchReference}" does not match any batch of product "${row.productReference}"`);
          }
        }
      }

      if (row.serialNumber && existingSerials.has(row.serialNumber)) {
        errors.push(`serialNumber "${row.serialNumber}" already exists in this organization`);
      }

      if (errors.length > 0) {
        invalidRows.push({ row: row.line, errors });
        continue;
      }

      const dates = parsedDatesByLine.get(row.line)!;
      const product = resolvedProduct.product!;
      const parsedSerial = parseSerial(row.serialNumber);

      validRows.push({
        line: row.line,
        serialNumber: row.serialNumber,
        productId: product.id,
        productName: product.name,
        variantId,
        batchId,
        manufacturedAt: dates.manufacturedAt ? dates.manufacturedAt.toISOString() : null,
        deliveredAt: dates.deliveredAt ? dates.deliveredAt.toISOString() : null,
        internalReference: row.internalReference,
      });

      pendingRows.push({
        line: row.line,
        serialNumber: row.serialNumber,
        productId: product.id,
        variantId,
        batchId,
        manufacturedAt: dates.manufacturedAt,
        deliveredAt: dates.deliveredAt,
        internalReference: row.internalReference,
        parsedSerial,
      });
    }

    const importId = crypto.randomUUID();
    this.store.put({ importId, organizationId, actorId, createdAt: Date.now(), validRows: pendingRows });

    return {
      importId,
      totalRows: rawRows.length,
      validRows,
      invalidRows,
      unknownColumns: headers.unknownColumns,
      headers: allRows[0],
      columnMapping: headers.columnByField,
    };
  }

  async commit(organizationId: string, actorId: string, importId: string): Promise<ImportCommitResponseDto> {
    const pending = this.store.take(importId, organizationId);
    if (!pending) {
      throw new AppError("NOT_FOUND", "No pending import found for this id (it may have expired or already been committed)");
    }
    if (pending.validRows.length === 0) {
      throw new AppError("VALIDATION_ERROR", "This import has no valid rows to commit");
    }

    const data: Prisma.UnitCreateManyInput[] = pending.validRows.map((row) => ({
      organizationId,
      productId: row.productId,
      variantId: row.variantId ?? undefined,
      batchId: row.batchId ?? undefined,
      serialNumber: row.serialNumber,
      serialPrefix: row.parsedSerial.prefix,
      serialSequence: row.parsedSerial.sequence,
      serialSeqLength: row.parsedSerial.sequenceLength,
      manufacturedAt: row.manufacturedAt ?? undefined,
      deliveredAt: row.deliveredAt ?? undefined,
      internalReference: row.internalReference ?? undefined,
    }));

    try {
      // `unit.createMany` compiles to a single multi-row INSERT, which
      // Postgres executes atomically — if any row violates the
      // (organizationId, serialNumber) unique constraint (e.g. a race with
      // another import/creation between preview and commit), the whole
      // statement fails and zero rows are inserted. That's what makes the
      // "either all N rows import, or none do, and we say exactly why" (spec
      // §34) guarantee hold without needing a manual transaction here — we
      // still wrap it together with the audit write so the audit event
      // never gets written without the corresponding units and vice versa.
      const importedCount = await this.prisma.$transaction(async (tx) => {
        const result = await tx.unit.createMany({ data });
        await this.audit.record(
          {
            organizationId,
            actorId,
            action: "UNIT_IMPORTED",
            objectType: "Unit",
            objectId: importId,
            after: { count: result.count, importId },
          },
          tx,
        );
        return result.count;
      });

      this.store.delete(importId);
      return { importId, importedCount };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const serials = data.map((d) => d.serialNumber);
        const nowExisting = await this.prisma.unit.findMany({
          where: { organizationId, serialNumber: { in: serials } },
          select: { serialNumber: true },
        });
        throw new AppError(
          "IMPORT_VALIDATION_FAILED",
          `Import aborted: ${nowExisting.length} of ${data.length} row(s) collided with serial numbers created since the preview was generated. No rows were imported — re-run preview to get an up-to-date validation.`,
          { conflictingSerials: nowExisting.map((u) => u.serialNumber) },
        );
      }
      throw err;
    }
  }
}
