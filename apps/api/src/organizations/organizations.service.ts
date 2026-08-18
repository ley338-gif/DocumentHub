import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const baseSlug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    let slug = baseSlug || "org";
    let attempt = 0;
    // Ensure slug uniqueness with a small suffix loop rather than failing outright.
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.name, slug },
      });
      await tx.organizationMembership.create({
        data: { userId, organizationId: organization.id, role: "ADMINISTRATOR" },
      });
      await this.audit.record(
        {
          organizationId: organization.id,
          actorId: userId,
          action: "ORGANIZATION_CREATED",
          objectType: "Organization",
          objectId: organization.id,
          after: { name: organization.name, slug: organization.slug },
        },
        tx,
      );
      return organization;
    });

    return org;
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { organization: true },
    });
    return memberships.map((m) => ({ ...m.organization, role: m.role }));
  }

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      user: { id: m.user.id, email: m.user.email, fullName: m.user.fullName },
    }));
  }

  async inviteMember(organizationId: string, actorId: string, dto: InviteMemberDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new AppError("NOT_FOUND", "No user with that email exists yet");
    }

    const existing = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    if (existing) {
      throw new AppError("VALIDATION_ERROR", "User is already a member of this organization");
    }

    const membership = await this.prisma.organizationMembership.create({
      data: { userId: user.id, organizationId, role: dto.role, status: "ACTIVE" },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "MEMBER_INVITED",
      objectType: "OrganizationMembership",
      objectId: membership.id,
      after: { userId: user.id, role: dto.role },
    });

    return membership;
  }

  async updateMemberRole(
    organizationId: string,
    membershipId: string,
    actorId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      throw new AppError("NOT_FOUND", "Membership not found");
    }

    const before = { role: membership.role };
    const updated = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: { role: dto.role },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "MEMBER_ROLE_CHANGED",
      objectType: "OrganizationMembership",
      objectId: membershipId,
      before,
      after: { role: updated.role },
    });

    return updated;
  }
}
