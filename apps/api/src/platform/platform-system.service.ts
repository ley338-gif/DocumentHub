import { Injectable, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_SERVICE, StorageService } from "../storage/storage.service";
import { registrationMode } from "./registration-mode";

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
}

/**
 * Read-only operational snapshot for /platform/system. Never returns
 * secrets (JWT_SECRET, DB password, S3 keys, invitation tokens) — only
 * booleans/labels useful for a support/ops glance. See
 * docs/platform-administration.md "System Page".
 */
@Injectable()
export class PlatformSystemService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async snapshot() {
    const [databaseHealthy, storageHealthy, lastMigration] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
      this.lastMigration(),
    ]);

    return {
      version: process.env.npm_package_version ?? "0.1.0",
      environment: process.env.NODE_ENV ?? "development",
      registrationMode: registrationMode(),
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? null,
      storageDriver: process.env.STORAGE_DRIVER ?? "local",
      database: { healthy: databaseHealthy },
      storage: { healthy: storageHealthy },
      lastMigration,
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkStorage(): Promise<boolean> {
    try {
      await this.storage.exists("__platform_health_check__");
      return true;
    } catch {
      return false;
    }
  }

  private async lastMigration(): Promise<{ name: string; appliedAt: string | null } | null> {
    try {
      const rows = await this.prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at FROM "_prisma_migrations"
        ORDER BY finished_at DESC NULLS LAST LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      return { name: row.migration_name, appliedAt: row.finished_at ? row.finished_at.toISOString() : null };
    } catch {
      return null;
    }
  }
}
