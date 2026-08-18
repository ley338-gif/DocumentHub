import { Module } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerModule, minutes } from "@nestjs/throttler";
import { StorageModule } from "../storage/storage.module";
import { PublicationsModule } from "../publications/publications.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

// Rate limit for anonymous public routes (spec §50): 30 requests/minute per
// IP. Rationale — a real QR scan is one page load plus a handful of asset/
// download requests within a few seconds; 30/min comfortably covers a
// person repeatedly refreshing or opening several publications from one
// device, while still bounding scraping/enumeration of stableIds from a
// single source. This is registered only inside PublicModule (not via
// APP_GUARD in AppModule), so it does not apply to the authenticated
// internal API, which is already protected by JWT + tenant membership.
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: minutes(1), limit: 30 }]),
    StorageModule,
    PublicationsModule,
  ],
  controllers: [PublicController],
  providers: [PublicService, ThrottlerGuard],
})
export class PublicModule {}
