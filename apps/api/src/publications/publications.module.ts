import { Module } from "@nestjs/common";
import { PublicationsController } from "./publications.controller";
import { PublishService } from "./publish.service";
import { PublicationResolverService } from "./resolver.service";
import { PublishPreviewService } from "./publish-preview.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [PublicationsController],
  providers: [PublishService, PublicationResolverService, PublishPreviewService],
  exports: [PublishService, PublicationResolverService, PublishPreviewService],
})
export class PublicationsModule {}
