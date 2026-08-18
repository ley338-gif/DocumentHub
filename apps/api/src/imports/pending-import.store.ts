import { Injectable } from "@nestjs/common";
import { ParsedSerial } from "../applicability/serial";

export interface PendingImportRow {
  line: number;
  serialNumber: string;
  productId: string;
  variantId: string | null;
  batchId: string | null;
  manufacturedAt: Date | null;
  deliveredAt: Date | null;
  internalReference: string | null;
  parsedSerial: ParsedSerial;
}

export interface PendingImportEntry {
  importId: string;
  organizationId: string;
  actorId: string;
  createdAt: number;
  validRows: PendingImportRow[];
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough to review a preview and commit, short enough not to accumulate memory indefinitely.

/**
 * Holds validated-but-not-yet-committed CSV import rows between the
 * preview and commit steps (spec §34's explicit two-step "see everything,
 * then confirm" flow), keyed by an opaque importId.
 *
 * Deliberately an in-memory Map, not a persisted `PendingImport` Prisma
 * model: the data is disposable (re-uploading the CSV recreates it), lives
 * for at most 30 minutes, and this avoids a migration + cleanup job for
 * what is fundamentally a short-lived staging buffer. The real cost of this
 * choice is that it does not survive a process restart and does not work
 * across multiple API instances behind a load balancer without sticky
 * sessions — acceptable for the current single-instance deployment target,
 * but worth revisiting (e.g. a Redis-backed store, or a PendingImport table
 * with a cron sweep) if the API is horizontally scaled. Documented in
 * docs/csv-import.md.
 */
@Injectable()
export class PendingImportStore {
  private readonly entries = new Map<string, PendingImportEntry>();

  put(entry: PendingImportEntry): void {
    this.evictExpired();
    this.entries.set(entry.importId, entry);
  }

  /** Returns the entry only if it exists, hasn't expired, and belongs to the given organization. */
  take(importId: string, organizationId: string): PendingImportEntry | undefined {
    this.evictExpired();
    const entry = this.entries.get(importId);
    if (!entry || entry.organizationId !== organizationId) return undefined;
    return entry;
  }

  delete(importId: string): void {
    this.entries.delete(importId);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > TTL_MS) {
        this.entries.delete(id);
      }
    }
  }
}
