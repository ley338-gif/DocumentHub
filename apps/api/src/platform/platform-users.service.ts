import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { normalizePagination, toPaginated } from "../common/pagination";
import { PlatformAuditService } from "./platform-audit.service";
import { ListPlatformUsersQueryDto, UpdatePlatformUserStatusDto } from "./dto/list-users.dto";

@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async list(query: ListPlatformUsersQueryDto) {
    const { page, pageSize, skip, take } = normalizePagination(query);
    const where: Prisma.UserWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: "insensitive" } },
        { fullName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { memberships: { include: { organization: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return toPaginated(users.map((u) => this.toPublicUser(u)), total, page, pageSize);
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { memberships: { include: { organization: true } } },
    });
    if (!user) throw new AppError("NOT_FOUND", "User not found");
    return this.toPublicUser(user);
  }

  async updateStatus(id: string, actorId: string, dto: UpdatePlatformUserStatusDto) {
    if (id === actorId && dto.status === "SUSPENDED") {
      throw new AppError("VALIDATION_ERROR", "You cannot suspend your own platform account");
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError("NOT_FOUND", "User not found");

    const before = { status: user.status };
    const updated = await this.prisma.user.update({ where: { id }, data: { status: dto.status } });

    await this.platformAudit.record({
      actorId,
      action: dto.status === "SUSPENDED" ? "PLATFORM_USER_SUSPENDED" : "PLATFORM_USER_REACTIVATED",
      targetType: "User",
      targetId: id,
      before,
      after: { status: updated.status },
    });

    return this.toPublicUser({ ...updated, memberships: [] });
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    fullName: string;
    status: string;
    platformRole: string;
    createdAt: Date;
    lastLoginAt: Date | null;
    memberships: { organizationId: string; role: string; status: string; organization: { name: string } }[];
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      platformRole: user.platformRole,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      memberships: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        role: m.role,
        status: m.status,
      })),
    };
  }
}
