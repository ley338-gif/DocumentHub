import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppError } from "../errors/app-error";

/**
 * The single, centralized authorization point for every /api/platform/*
 * route. Deliberately separate from RolesGuard/TenantGuard — platform
 * privilege is never derived from any OrganizationMembership (see
 * docs/platform-administration.md). Must run after JwtAuthGuard so
 * `req.user` (populated by JwtStrategy, itself re-checked against the live
 * User row on every request) is already present.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user || req.user.platformRole !== "PLATFORM_ADMIN") {
      throw new AppError("FORBIDDEN", "Platform administrator privileges required");
    }
    return true;
  }
}
