import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { JwtStrategy } from "./jwt.strategy";
import { RateLimitModule } from "../common/rate-limit.module";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "8h" },
    }),
    // Brute-force guard for login/register (spec §37-38) — see
    // RateLimitModule for the "auth" bucket's limit and why the throttler
    // registration lives in one shared module instead of here.
    RateLimitModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, JwtStrategy],
  exports: [PasswordService],
})
export class AuthModule {}
