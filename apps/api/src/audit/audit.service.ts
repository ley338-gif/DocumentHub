import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, PrismaClient } from "@prisma/client";

export interface RecordAuditEventInput {
  organizationId: string;
  actorId?: string | null;
  action: string;
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// Any Prisma client-shaped object that exposes `.auditEvent` — either the
// module-level PrismaService or a `$transaction` callback's tx client, so
// audit events can be written inside the same transaction as the mutation
// they describe.
type AuditCapableClient = Pick<PrismaClient, "auditEvent">;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput, client: AuditCapableClient = this.prisma) {
    await client.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId,
        before: input.before === undefined ? Prisma.JsonNull : (input.before as Prisma.InputJsonValue),
        after: input.after === undefined ? Prisma.JsonNull : (input.after as Prisma.InputJsonValue),
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }
}
