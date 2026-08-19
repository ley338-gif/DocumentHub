import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import { Response } from "express";
import { PublicService } from "./public.service";

// Unauthenticated by design (no JwtAuthGuard/TenantGuard/RolesGuard — a QR
// scan carries no session). Org context comes purely from the stable ID in
// the path; ThrottlerGuard is the only guard, rate-limiting by IP under the
// "default" bucket (see RateLimitModule for the limit and
// docs/public-access.md for the rationale). Every named throttler applies
// to a route by default, so the unrelated "auth" bucket is explicitly
// skipped here.
@UseGuards(ThrottlerGuard)
@SkipThrottle({ auth: true })
@Controller()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get("p/:stableId")
  getProduct(@Param("stableId") stableId: string, @Query("language") language?: string) {
    return this.publicService.getProductPage(stableId, language);
  }

  @Get("p/:productStableId/publications/:publicationStableId/download")
  async downloadForProduct(
    @Param("productStableId") productStableId: string,
    @Param("publicationStableId") publicationStableId: string,
    @Res() res: Response,
  ) {
    await this.publicService.downloadForProduct(productStableId, publicationStableId, res);
  }

  @Get("u/:stableId")
  getUnit(@Param("stableId") stableId: string, @Query("language") language?: string) {
    return this.publicService.getUnitPage(stableId, language);
  }

  @Get("u/:unitStableId/publications/:publicationStableId/download")
  async downloadForUnit(
    @Param("unitStableId") unitStableId: string,
    @Param("publicationStableId") publicationStableId: string,
    @Res() res: Response,
  ) {
    await this.publicService.downloadForUnit(unitStableId, publicationStableId, res);
  }
}
