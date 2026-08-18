import { Module } from "@nestjs/common";
import { OrganizationsController, OrganizationMembersController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [OrganizationsController, OrganizationMembersController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
