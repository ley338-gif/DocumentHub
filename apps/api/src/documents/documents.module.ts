import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { RevisionsController } from "./revisions.controller";
import { RevisionsService } from "./revisions.service";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [DocumentsController, RevisionsController],
  providers: [DocumentsService, RevisionsService],
  exports: [DocumentsService, RevisionsService],
})
export class DocumentsModule {}
