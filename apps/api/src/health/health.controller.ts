import { Controller, Get, Inject, Res } from "@nestjs/common";
import { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_SERVICE, StorageService } from "../storage/storage.service";

const APP_VERSION = process.env.npm_package_version ?? "0.1.0-rc.1";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // Kept for backward compatibility with anything already polling the bare
  // /health path (e.g. earlier docs/scripts) — behaves like /health/live.
  @Get()
  check() {
    return { status: "ok", version: APP_VERSION };
  }

  // Liveness: the process is up and able to handle a request at all. Must
  // never depend on the database or storage — a live-but-not-ready
  // container should stay running (so Docker doesn't restart-loop it)
  // while readiness alone reflects dependency health.
  @Get("live")
  live() {
    return { status: "ok", version: APP_VERSION };
  }

  // Readiness: safe to receive real traffic — database and storage are
  // both reachable. Responds 503 (not a thrown 500) when not ready, so
  // load balancers/orchestrators treat it as a normal "not ready yet"
  // signal rather than an application error.
  @Get("ready")
  async ready(@Res() res: Response) {
    const [database, storage] = await Promise.all([this.checkDatabase(), this.checkStorage()]);
    const ready = database && storage;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "unavailable",
      version: APP_VERSION,
      checks: { database, storage },
    });
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
      await this.storage.exists("__health_check__");
      return true;
    } catch {
      return false;
    }
  }
}
