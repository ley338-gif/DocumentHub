import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { AppError } from "../errors/app-error";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Resolves the tenant (Organization) context for the authenticated user and
 * attaches it to the request as `req.tenant`. This is the single
 * server-side enforcement point for tenant membership — every
 * organization-scoped controller depends on it running before any query is
 * made. See docs/architecture.md ("Tenant Isolation").
 *
 * Also the single enforcement point for tenant lifecycle status (see
 * docs/platform-administration.md "Tenant Lifecycle"):
 *   - CLOSED blocks the tenant context outright (no read, no write) — a
 *     closed tenant's own users cannot use /app/* at all.
 *   - SUSPENDED still resolves a tenant context (reads stay available — a
 *     suspended admin can still see their own data) but blocks every
 *     mutating request (POST/PUT/PATCH/DELETE).
 * Platform Admin routes never go through this guard, so lifecycle status
 * has no bearing on platform-level operations.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    if (!req.user) {
      throw new AppError("FORBIDDEN", "Authentication required");
    }

    const organizationId =
      (req.headers["x-organization-id"] as string | undefined) ??
      (req.params?.organizationId as string | undefined);

    if (!organizationId) {
      throw new AppError("VALIDATION_ERROR", "X-Organization-Id header is required");
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: req.user.userId, organizationId } },
      include: { organization: true },
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new AppError("TENANT_VIOLATION", "Not a member of this organization");
    }

    if (membership.organization.status === "CLOSED") {
      throw new AppError("TENANT_CLOSED", "This organization has been closed");
    }

    if (membership.organization.status === "SUSPENDED" && WRITE_METHODS.has(req.method)) {
      throw new AppError("TENANT_SUSPENDED", "This organization is suspended — changes are not permitted");
    }

    req.tenant = {
      organizationId,
      membershipId: membership.id,
      role: membership.role,
      organizationStatus: membership.organization.status,
    };

    return true;
  }
}
