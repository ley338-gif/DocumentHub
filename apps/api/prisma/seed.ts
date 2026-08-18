// Demo data seed (spec §56). Idempotent-ish: uses upsert on natural keys
// where practical so re-running doesn't blow up on unique constraints.
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function parseSerial(raw: string) {
  const match = /(\d+)$/.exec(raw);
  if (!match) return { prefix: raw, sequence: 0n, sequenceLength: 0 };
  const digits = match[1];
  return { prefix: raw.slice(0, raw.length - digits.length), sequence: BigInt(digits), sequenceLength: digits.length };
}

async function main() {
  const passwordHash = await bcrypt.hash("Passw0rd!", 12);

  const user = await prisma.user.upsert({
    where: { email: "admin@mueller-maschinenbau.example" },
    update: {},
    create: {
      email: "admin@mueller-maschinenbau.example",
      passwordHash,
      fullName: "Anna Müller",
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "mueller-maschinenbau" },
    update: {},
    create: {
      name: "Müller Maschinenbau GmbH",
      slug: "mueller-maschinenbau",
      defaultLanguage: "de",
    },
  });

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: "ADMINISTRATOR" },
  });

  const family = await prisma.productFamily.upsert({
    where: { stableId: "seed-family-pumpmaster" },
    update: {},
    create: {
      stableId: "seed-family-pumpmaster",
      organizationId: org.id,
      name: "PumpMaster Series",
      description: "Industrial pump product family",
    },
  });

  const product = await prisma.product.upsert({
    where: { stableId: "seed-product-pumpmaster-400" },
    update: {},
    create: {
      stableId: "seed-product-pumpmaster-400",
      organizationId: org.id,
      productFamilyId: family.id,
      name: "PumpMaster 400",
      modelDesignation: "PM-400",
      status: "ACTIVE",
    },
  });

  const variant = await prisma.productVariant.upsert({
    where: { stableId: "seed-variant-h" },
    update: {},
    create: {
      stableId: "seed-variant-h",
      organizationId: org.id,
      productId: product.id,
      name: "H",
      description: "High-pressure variant",
    },
  });

  const serials = ["000001", "000002", "000003", "001500", "002500"];
  for (const serialNumber of serials) {
    const existing = await prisma.unit.findUnique({
      where: { organizationId_serialNumber: { organizationId: org.id, serialNumber } },
    });
    if (existing) continue;
    const parsed = parseSerial(serialNumber);
    await prisma.unit.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        variantId: variant.id,
        serialNumber,
        serialPrefix: parsed.prefix,
        serialSequence: parsed.sequence,
        serialSeqLength: parsed.sequenceLength,
      },
    });
  }

  const manual = await prisma.document.upsert({
    where: { stableId: "seed-document-betriebsanleitung" },
    update: {},
    create: {
      stableId: "seed-document-betriebsanleitung",
      organizationId: org.id,
      name: "Betriebsanleitung",
      documentType: "MANUAL",
    },
  });

  await prisma.document.upsert({
    where: { stableId: "seed-document-sicherheitshinweise" },
    update: {},
    create: {
      stableId: "seed-document-sicherheitshinweise",
      organizationId: org.id,
      name: "Sicherheitshinweise",
      documentType: "SAFETY_NOTICE",
    },
  });

  console.log(`Seeded organization "${org.name}" (${org.slug}).`);
  console.log(`Login: admin@mueller-maschinenbau.example / Passw0rd!`);
  console.log(`Product: ${product.name}, Variant: ${variant.name}, Document: ${manual.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
