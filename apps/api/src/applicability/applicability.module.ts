import { Module } from "@nestjs/common";
import { ApplicabilityController } from "./applicability.controller";
import { ApplicabilityRulesService } from "./applicability-rules.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [ApplicabilityController],
  providers: [ApplicabilityRulesService],
  exports: [ApplicabilityRulesService],
})
export class ApplicabilityModule {}
