import { MembershipRole } from "@prisma/client";

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export interface TenantContext {
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
}

// Populated on the Express Request object by JwtAuthGuard / TenantGuard.
// passport's own type augmentation declares `Express.Request.user?: Express.User`
// (see @types/passport) — we extend that global `Express.User` interface
// with our fields instead of re-declaring `user` with an incompatible type,
// which avoids a "subsequent property declarations must have the same
// type" compile error while still letting `req.user` carry our shape.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      userId: AuthenticatedUser["userId"];
      email: AuthenticatedUser["email"];
    }

    interface Request {
      tenant?: TenantContext;
      requestId?: string;
    }
  }
}

export {};
