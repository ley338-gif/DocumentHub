import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { AuditModule } from "./audit/audit.module";
import { ProductsModule } from "./products/products.module";
import { StorageModule } from "./storage/storage.module";
import { DocumentsModule } from "./documents/documents.module";
import { ApplicabilityModule } from "./applicability/applicability.module";
import { PublicationsModule } from "./publications/publications.module";
import { ImportsModule } from "./imports/imports.module";
import { PublicModule } from "./public/public.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    AuditModule,
    ProductsModule,
    StorageModule,
    DocumentsModule,
    ApplicabilityModule,
    PublicationsModule,
    ImportsModule,
    PublicModule,
  ],
})
export class AppModule {}
