import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./password.service";
import { AppError } from "../common/errors/app-error";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new AppError("VALIDATION_ERROR", "Email already registered");
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, fullName: dto.fullName },
    });

    return this.toPublicUser(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.status !== "ACTIVE") {
      throw new AppError("VALIDATION_ERROR", "Invalid credentials");
    }

    const valid = await this.passwords.verify(dto.password, user.passwordHash);
    if (!valid) {
      throw new AppError("VALIDATION_ERROR", "Invalid credentials");
    }

    // NOTE: no AuditEvent is emitted here. AuditEvent.organizationId is
    // required (not nullable) and login is a pre-tenant action (a user may
    // belong to zero, one, or many organizations) — there is no single
    // organization to attribute this event to. Per-membership login events
    // would multiply one login into N audit rows for no real benefit, so we
    // deliberately skip audit logging for AUTH_LOGIN in this MVP.
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email });

    return { accessToken, user: this.toPublicUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { organization: true },
        },
      },
    });
    if (!user) {
      throw new AppError("NOT_FOUND", "User not found");
    }

    return {
      ...this.toPublicUser(user),
      memberships: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  private toPublicUser(user: { id: string; email: string; fullName: string; status: string }) {
    return { id: user.id, email: user.email, fullName: user.fullName, status: user.status };
  }
}
