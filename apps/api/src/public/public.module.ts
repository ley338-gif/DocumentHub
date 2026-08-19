import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PublicationsModule } from "../publications/publications.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { RateLimitModule } from "../common/rate-limit.module";

// Rate limit for anonymous public routes (spec §50) — see RateLimitModule
// for the "default" bucket's limit and why the throttler registration
// lives in one shared module instead of here. Not applied via APP_GUARD in
// AppModule, so it never touches the authenticated internal API, which is
// already protected by JWT + tenant membership.
@Module({
  imports: [RateLimitModule, StorageModule, PublicationsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
