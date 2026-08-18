import { SetMetadata } from "@nestjs/common";
import { MembershipRole } from "@prisma/client";

export const ROLES_KEY = "roles";

/**
 * Marks a handler as requiring at least one of the given roles (checked
 * against the tenant-hierarchy in RolesGuard: a higher role satisfies a
 * lower requirement). Apply to every mutating endpoint — never trust the
 * frontend for role checks.
 */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
