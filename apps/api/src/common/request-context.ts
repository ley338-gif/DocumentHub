import { MembershipRole, OrganizationStatus, PlatformRole } from "@prisma/client";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  platformRole: PlatformRole;
}

export interface TenantContext {
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  organizationStatus: OrganizationStatus;
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
      platformRole: AuthenticatedUser["platformRole"];
    }

    interface Request {
      tenant?: TenantContext;
      requestId?: string;
    }
  }
}

export {};
