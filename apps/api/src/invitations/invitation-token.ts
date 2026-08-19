import { createHash, randomBytes } from "node:crypto";

/** Raw invitation token generation/hashing — only the hash is ever persisted
 * (see Invitation.tokenHash in schema.prisma); the raw value is returned
 * exactly once, to the inviter, as a copyable link. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
