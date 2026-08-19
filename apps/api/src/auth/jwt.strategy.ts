import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/request-context";

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "dev-secret-change-me",
    });
  }

  // Looked up fresh on every authenticated request (not just at login) so a
  // user suspended mid-session — globally via User.status, or via a
  // platform action — loses access immediately rather than only once their
  // already-issued JWT happens to expire. See docs/platform-administration.md
  // "User Suspension".
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException();
    }
    return { userId: user.id, email: user.email, platformRole: user.platformRole };
  }
}
