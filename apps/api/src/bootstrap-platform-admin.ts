// Standalone, idempotent bootstrap for the very first platform operator
// account — deliberately NOT exposed as an HTTP endpoint anywhere (see
// docs/platform-administration.md "Platform Admin Bootstrap"): there must
// be no self-escalation path reachable from the running API. Run via:
//
//   npm run bootstrap:platform-admin
//
// Reads BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_NAME
// from the environment. Re-running with the same email is safe: an existing
// user with that email is promoted to PLATFORM_ADMIN in place (its password
// is left untouched — this script grants a *privilege*, it does not reset
// credentials); a brand-new email creates a fresh account.
import "reflect-metadata";
import "./common/bigint-json-patch";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";
import { PasswordService } from "./auth/password.service";
import { PlatformAuditService } from "./platform/platform-audit.service";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME ?? "Platform Administrator";

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error(
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set.\n" +
        "Example:\n" +
        '  BOOTSTRAP_ADMIN_EMAIL="admin@example.com" BOOTSTRAP_ADMIN_PASSWORD="..." npm run bootstrap:platform-admin',
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    // eslint-disable-next-line no-console
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const passwords = app.get(PasswordService);
    const platformAudit = app.get(PlatformAuditService);

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.platformRole === "PLATFORM_ADMIN") {
        // eslint-disable-next-line no-console
        console.log(`${email} is already a platform administrator — nothing to do.`);
        return;
      }

      await prisma.user.update({ where: { id: existing.id }, data: { platformRole: "PLATFORM_ADMIN" } });
      await platformAudit.record({
        actorId: existing.id,
        action: "PLATFORM_ADMIN_CREATED",
        targetType: "User",
        targetId: existing.id,
        after: { email, promotedExistingAccount: true },
      });
      // eslint-disable-next-line no-console
      console.log(`Promoted existing account ${email} to PLATFORM_ADMIN.`);
      return;
    }

    const passwordHash = await passwords.hash(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName, platformRole: "PLATFORM_ADMIN" },
    });
    await platformAudit.record({
      actorId: user.id,
      action: "PLATFORM_ADMIN_CREATED",
      targetType: "User",
      targetId: user.id,
      after: { email, promotedExistingAccount: false },
    });
    // eslint-disable-next-line no-console
    console.log(`Created platform administrator ${email}.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Bootstrap failed:", err);
  process.exitCode = 1;
});
