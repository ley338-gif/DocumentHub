import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { RequestLoggingMiddleware } from "./common/request-logging.middleware";
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
import { InvitationsModule } from "./invitations/invitations.module";
import { PlatformModule } from "./platform/platform.module";

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
    InvitationsModule,
    PlatformModule,
  ],
})
export class AppModule implements NestModule {
  // Module-level (not main.ts-only) so every e2e spec that builds its own
  // Nest application from AppModule gets identical middleware — same
  // reasoning as GLOBAL_PREFIX_EXCLUDES's doc comment. Context middleware
  // must run before the logging one (it sets req.requestId), and both must
  // run before the guards that populate req.user/req.tenant, which is
  // exactly Express's top-to-bottom middleware order here.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, RequestLoggingMiddleware).forRoutes("*");
  }
}
