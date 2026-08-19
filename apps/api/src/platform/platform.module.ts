import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller";
import { PlatformTenantsService } from "./platform-tenants.service";
import { PlatformUsersService } from "./platform-users.service";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformSystemService } from "./platform-system.service";
import { InvitationsModule } from "../invitations/invitations.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [InvitationsModule, StorageModule],
  controllers: [PlatformController],
  providers: [PlatformTenantsService, PlatformUsersService, PlatformAuditService, PlatformSystemService],
  exports: [PlatformAuditService],
})
export class PlatformModule {}
