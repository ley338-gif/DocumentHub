import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Same JWT verification as JwtAuthGuard, but never throws — a missing or
 * invalid token just leaves `req.user` unset instead of 401ing. Used only
 * by the public invitation-accept endpoint, which must serve both an
 * anonymous brand-new-account acceptance and an already-authenticated
 * existing-user acceptance through one route (see InvitationsService.accept).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  handleRequest(_err: unknown, user: unknown) {
    return (user ?? null) as never;
  }
}
