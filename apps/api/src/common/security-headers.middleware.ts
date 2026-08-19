import { Request, Response, NextFunction } from "express";

// Minimal secure-headers middleware (no extra dependency needed for the MVP,
// spec §30). The API never serves HTML or executes third-party scripts —
// every response here is JSON or a file download — so a strict
// default-src 'none' CSP is both correct and can never break a download
// (CSP governs how a *page* loads sub-resources, not raw file responses).
export default function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");

  // HSTS only makes sense once the request actually arrived over HTTPS —
  // asserting it over plain HTTP (e.g. local dev) would be actively wrong.
  // `req.secure` reflects the real transport unless `trust proxy` is
  // configured (see main.ts), in which case it also honors a trusted
  // reverse proxy's X-Forwarded-Proto.
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
}
