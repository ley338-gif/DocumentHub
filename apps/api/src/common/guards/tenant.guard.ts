import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { AppError } from "../errors/app-error";

/**
 * Resolves the tenant (Organization) context for the authenticated user and
 * attaches it to the request as `req.tenant`. This is the single
 * server-side enforcement point for tenant membership — every
 * organization-scoped controller depends on it running before any query is
 * made. See docs/architecture.md ("Tenant Isolation").
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
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new AppError("TENANT_VIOLATION", "Not a member of this organization");
    }

    req.tenant = {
      organizationId,
      membershipId: membership.id,
      role: membership.role,
    };

    return true;
  }
}
