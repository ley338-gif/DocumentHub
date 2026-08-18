import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MembershipRole } from "@prisma/client";
import { Request } from "express";
import { AppError } from "../errors/app-error";
import { ROLES_KEY } from "../decorators/roles.decorator";

const HIERARCHY: Record<MembershipRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  PUBLISHER: 2,
  ADMINISTRATOR: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() present => no role requirement beyond authentication/tenancy.
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.tenant) {
      throw new AppError("FORBIDDEN", "Tenant context required");
    }

    const actual = HIERARCHY[req.tenant.role];
    const minRequired = Math.min(...required.map((r) => HIERARCHY[r]));

    if (actual < minRequired) {
      throw new AppError("FORBIDDEN", "Insufficient role for this action");
    }

    return true;
  }
}
