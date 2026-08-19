import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/request-context";
import { registrationMode } from "../platform/registration-mode";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Public and unauthenticated on purpose — /login and /register both need
  // to know this before a session exists (spec §41: INVITE_ONLY hides the
  // self-service register form and points to /invite/:token instead).
  @Get("registration-mode")
  registrationMode() {
    return { mode: registrationMode() };
  }

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.userId);
  }
}
