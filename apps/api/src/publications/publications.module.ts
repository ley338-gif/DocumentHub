import { Module } from "@nestjs/common";
import { PublicationsController } from "./publications.controller";
import { PublishService } from "./publish.service";
import { PublicationResolverService } from "./resolver.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [PublicationsController],
  providers: [PublishService, PublicationResolverService],
  exports: [PublishService, PublicationResolverService],
})
export class PublicationsModule {}
