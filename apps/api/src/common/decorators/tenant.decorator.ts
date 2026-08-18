import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { TenantContext } from "../request-context";

export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.tenant as TenantContext;
  },
);
