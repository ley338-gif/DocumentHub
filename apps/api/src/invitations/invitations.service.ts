import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "../auth/password.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { generateInvitationToken, hashInvitationToken } from "./invitation-token";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async create(organizationId: string, invitedById: string, dto: CreateInvitationDto) {
    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);

    const invitation = await this.prisma.invitation.create({
      data: {
        tokenHash,
        email: dto.email,
        organizationId,
        role: dto.role,
        invitedById,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    await this.audit.record({
      organizationId,
      actorId: invitedById,
      action: "MEMBER_INVITED",
      objectType: "Invitation",
      objectId: invitation.id,
      after: { email: dto.email, role: dto.role },
    });

    return { invitation: this.toPublicInvitation(invitation), token: rawToken };
  }

  /** Revokes any still-pending invitation for this email/org and issues a
   * fresh one — the only way to re-show a link, since only the token's hash
   * is ever persisted (see invitation-token.ts). */
  async resend(organizationId: string, invitationId: string, actorId: string) {
    const existing = await this.prisma.invitation.findFirst({ where: { id: invitationId, organizationId } });
    if (!existing) throw new AppError("NOT_FOUND", "Invitation not found");
    if (existing.status !== "PENDING") {
      throw new AppError("INVALID_STATE_TRANSITION", "Only a pending invitation can be resent");
    }

    await this.prisma.invitation.update({ where: { id: existing.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    return this.create(organizationId, actorId, { email: existing.email, role: existing.role });
  }

  async revoke(organizationId: string, invitationId: string, actorId: string) {
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, organizationId } });
    if (!invitation) throw new AppError("NOT_FOUND", "Invitation not found");
    if (invitation.status !== "PENDING") {
      throw new AppError("INVALID_STATE_TRANSITION", "Only a pending invitation can be revoked");
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "INVITATION_REVOKED",
      objectType: "Invitation",
      objectId: invitation.id,
      before: { status: invitation.status },
      after: { status: "REVOKED" },
    });

    return this.toPublicInvitation(updated);
  }

  async listForOrganization(organizationId: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map((i) => this.toPublicInvitation(i));
  }

  /** Public preview — deliberately minimal, and only for a still-pending,
   * unexpired invitation. Never confirms/denies anything about an
   * unknown/expired/used/revoked token beyond "not available". */
  async preview(rawToken: string) {
    const invitation = await this.findActiveByToken(rawToken);
    const organization = await this.prisma.organization.findUnique({ where: { id: invitation.organizationId } });
    return {
      email: invitation.email,
      role: invitation.role,
      organizationName: organization?.name ?? "",
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(
    rawToken: string,
    dto: AcceptInvitationDto,
    authenticatedUser: { userId: string; email: string } | null,
  ) {
    const invitation = await this.findActiveByToken(rawToken);

    const result = await this.prisma.$transaction(async (tx) => {
      // Atomically claim the invitation before doing anything else, so two
      // concurrent accept requests for the same token can't both succeed.
      const claim = await tx.invitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new AppError("NOT_FOUND", "This invitation is no longer available");
      }

      const existingUser = await tx.user.findUnique({ where: { email: invitation.email } });

      if (existingUser) {
        if (!authenticatedUser) {
          throw new AppError("INVITATION_LOGIN_REQUIRED", "Please log in to accept this invitation");
        }
        if (authenticatedUser.email !== invitation.email) {
          throw new AppError("FORBIDDEN", "This invitation was issued to a different email address");
        }

        await tx.organizationMembership.upsert({
          where: { userId_organizationId: { userId: existingUser.id, organizationId: invitation.organizationId } },
          create: { userId: existingUser.id, organizationId: invitation.organizationId, role: invitation.role, status: "ACTIVE" },
          update: { role: invitation.role, status: "ACTIVE" },
        });

        await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedByUserId: existingUser.id } });

        return { createdNewAccount: false as const, userId: existingUser.id };
      }

      if (!dto.fullName || !dto.password) {
        throw new AppError("VALIDATION_ERROR", "fullName and password are required to accept this invitation");
      }

      const passwordHash = await this.passwords.hash(dto.password);
      const user = await tx.user.create({
        data: { email: invitation.email, passwordHash, fullName: dto.fullName },
      });

      await tx.organizationMembership.create({
        data: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role, status: "ACTIVE" },
      });

      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedByUserId: user.id } });

      return { createdNewAccount: true as const, userId: user.id, email: user.email };
    });

    if (result.createdNewAccount) {
      const accessToken = this.jwt.sign({ sub: result.userId, email: result.email });
      return { createdNewAccount: true, accessToken, organizationId: invitation.organizationId };
    }
    return { createdNewAccount: false, organizationId: invitation.organizationId };
  }

  // -------------------------------------------------------------------

  private async findActiveByToken(rawToken: string) {
    const tokenHash = hashInvitationToken(rawToken);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });
    if (!invitation) {
      throw new AppError("NOT_FOUND", "Invalid invitation");
    }
    if (invitation.status === "REVOKED") {
      throw new AppError("NOT_FOUND", "This invitation has been revoked");
    }
    if (invitation.status === "ACCEPTED") {
      throw new AppError("NOT_FOUND", "This invitation has already been used");
    }
    if (invitation.status === "EXPIRED" || invitation.expiresAt.getTime() < Date.now()) {
      if (invitation.status !== "EXPIRED") {
        await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      }
      throw new AppError("NOT_FOUND", "This invitation has expired");
    }
    return invitation;
  }

  private toPublicInvitation(invitation: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  }) {
    return invitation;
  }
}
