import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { OrganizationInvitationsController, PublicInvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { RateLimitModule } from "../common/rate-limit.module";

@Module({
  imports: [
    AuditModule,
    AuthModule, // PasswordService
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "8h" },
    }),
    // Same brute-force guard as AuthModule's login/register (spec §37) —
    // an invitation-accept attempt tries a password too. See RateLimitModule
    // for the "auth" bucket's limit.
    RateLimitModule,
  ],
  controllers: [OrganizationInvitationsController, PublicInvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
