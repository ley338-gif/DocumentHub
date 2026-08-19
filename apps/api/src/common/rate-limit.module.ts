import { Module } from "@nestjs/common";
import { ThrottlerModule, ThrottlerGuard, minutes } from "@nestjs/throttler";

// ThrottlerModule is @Global() internally (see @nestjs/throttler source),
// so calling .forRoot() from more than one feature module registers
// multiple competing global instances of the same options/storage tokens —
// which named throttler each guard actually resolves at runtime becomes
// dependent on module compilation order, not on which module declared it.
// This bit us once already (see git history around v0.1.0-rc.1 hardening):
// the "auth" throttler's configured limit silently didn't apply to some
// routes. The fix is to register ThrottlerModule exactly once, here, with
// every named throttler bucket the app needs, and have every feature
// module import THIS module instead of calling forRoot() itself.
//
// - "auth": brute-force guard for login/register/invite-accept (spec
//   §37-38). 30 requests/min per IP by default — high enough that a shared
//   office/NAT IP or a user mistyping a password a few times is never
//   punished, low enough to blunt a naive credential-stuffing loop.
//   AUTH_THROTTLE_LIMIT lets the e2e suite (a single test-client IP driving
//   dozens of simulated users through register+login in seconds — not a
//   pattern any real single client produces) raise the ceiling without
//   weakening the production default.
// - "default": anonymous public routes (spec §50) — /p, /u, QR, downloads.
//   30 requests/min per IP; a real QR scan is one page load plus a handful
//   of asset/download requests within seconds.
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: "auth", ttl: minutes(1), limit: Number.parseInt(process.env.AUTH_THROTTLE_LIMIT ?? "30", 10) },
      { name: "default", ttl: minutes(1), limit: Number.parseInt(process.env.PUBLIC_THROTTLE_LIMIT ?? "30", 10) },
    ]),
  ],
  providers: [ThrottlerGuard],
  exports: [ThrottlerModule, ThrottlerGuard],
})
export class RateLimitModule {}
