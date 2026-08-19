import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { requestContextStore } from "./request-context-store";

// Loose but bounded: accepted verbatim if present (useful when a reverse
// proxy/load balancer already assigns a correlation ID upstream), never
// trusted for anything security-sensitive — it only ever ends up in log
// lines and audit rows as a correlation string. Length-capped and
// charset-restricted purely to keep a hostile value out of log output,
// not because a malformed one could do anything worse than that.
const INBOUND_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Nest's setGlobalPrefix({exclude: [...]}) re-enters the Express
    // middleware stack for excluded paths (e.g. /health/live) to match
    // them both with and without the prefix — this middleware is bound via
    // forRoutes("*"), so an excluded route's single client request runs
    // through here twice. Keep the request's identity stable across that
    // re-entry instead of minting a second, different requestId for what
    // is still, from the client's perspective, one request.
    if (req.requestId) {
      requestContextStore.run(
        { requestId: req.requestId, ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null },
        next,
      );
      return;
    }

    const inbound = req.headers["x-request-id"];
    const inboundId = typeof inbound === "string" ? inbound : undefined;
    const requestId = inboundId && INBOUND_REQUEST_ID_PATTERN.test(inboundId) ? inboundId : randomUUID();

    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    // req.ip honors Express's `trust proxy` setting (configured from
    // TRUST_PROXY in main.ts) — falls back to the raw socket address when
    // no proxy is trusted, never blindly reading X-Forwarded-For itself.
    const context = { requestId, ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
    requestContextStore.run(context, next);
  }
}
