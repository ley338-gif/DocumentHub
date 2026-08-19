import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { logJson } from "./structured-logger";

// One structured log line per completed request: timestamp, level,
// requestId, method, route, statusCode, durationMs, and userId/
// organizationId when the request was authenticated — spec §48. Reads
// req.user/req.tenant, populated by JwtAuthGuard/TenantGuard, which is why
// this only knows them at response time (`res.on("finish")`), not when the
// request comes in. Never logs the request body, headers, query string, or
// response body — see structured-logger.ts for why that's a hard rule.
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Same double-dispatch as RequestContextMiddleware for prefix-excluded
    // routes (e.g. /health/live) — guard against attaching a second
    // "finish" listener to the same response, which would otherwise log
    // the one real request twice.
    if ((res as { _dhLoggingAttached?: boolean })._dhLoggingAttached) {
      next();
      return;
    }
    (res as { _dhLoggingAttached?: boolean })._dhLoggingAttached = true;

    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logJson(res.statusCode >= 500 ? "error" : "info", {
        requestId: req.requestId,
        method: req.method,
        // req.route is only populated once Express has matched a route —
        // for 404s (no match) or requests rejected before routing, fall
        // back to the raw path so the log line is never empty there.
        route: req.route?.path ?? req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.user?.userId,
        organizationId: req.tenant?.organizationId,
      });
    });

    next();
  }
}
