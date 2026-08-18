import { Inject, Injectable, Logger } from "@nestjs/common";
import { Response } from "express";
import { PublicationSnapshot } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { sanitizeFilename } from "../common/filename";
import { STORAGE_SERVICE, StorageService } from "../storage/storage.service";
import { PublicationResolverService } from "../publications/resolver.service";
import { ResolveInput } from "../publications/resolver.types";
import { PublicProductDto, PublicPublicationDto, PublicUnitDto } from "./dto/public-dtos";

// Generic — never reveals whether a stableId belongs to another organization,
// is merely unpublished, or doesn't exist at all. Any of those situations
// looks identical to an anonymous caller (spec §29-32, §48).
const PUBLIC_NOT_FOUND = () => new AppError("NOT_FOUND", "Not found");

@Injectable()
export class PublicService {
  private readonly logger = new Logger("PublicAccess");

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PublicationResolverService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async getProductPage(productStableId: string, language?: string): Promise<PublicProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { stableId: productStableId },
      include: { organization: true },
    });
    if (!product || product.organization.status === "SUSPENDED") {
      throw PUBLIC_NOT_FOUND();
    }

    const { resolved, conflicts } = await this.resolver.resolvePublications({
      organizationId: product.organizationId,
      productId: product.id,
      effectiveAt: new Date(),
      language,
    });
    this.logConflicts("product", product.stableId, conflicts.length);

    return {
      productStableId: product.stableId,
      name: product.name,
      modelDesignation: product.modelDesignation,
      description: product.description,
      publications: await this.toPublicPublications(resolved, { productStableId: product.stableId }),
    };
  }

  async getUnitPage(unitStableId: string, language?: string): Promise<PublicUnitDto> {
    const unit = await this.prisma.unit.findUnique({
      where: { stableId: unitStableId },
      include: { organization: true, product: true, variant: true },
    });
    if (!unit || unit.organization.status === "SUSPENDED") {
      throw PUBLIC_NOT_FOUND();
    }

    const { resolved, conflicts } = await this.resolver.resolvePublications({
      organizationId: unit.organizationId,
      unitId: unit.id,
      effectiveAt: new Date(),
      language,
    });
    this.logConflicts("unit", unit.stableId, conflicts.length);

    return {
      unitStableId: unit.stableId,
      productStableId: unit.product.stableId,
      productName: unit.product.name,
      variantName: unit.variant?.name ?? null,
      serialNumber: unit.serialNumber,
      publications: await this.toPublicPublications(resolved, { unitStableId: unit.stableId }),
    };
  }

  async downloadForProduct(productStableId: string, publicationStableId: string, res: Response): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { stableId: productStableId },
      include: { organization: true },
    });
    if (!product || product.organization.status === "SUSPENDED") {
      throw PUBLIC_NOT_FOUND();
    }
    await this.streamIfCurrentlyResolved(
      { organizationId: product.organizationId, productId: product.id, effectiveAt: new Date() },
      publicationStableId,
      res,
    );
  }

  async downloadForUnit(unitStableId: string, publicationStableId: string, res: Response): Promise<void> {
    const unit = await this.prisma.unit.findUnique({
      where: { stableId: unitStableId },
      include: { organization: true },
    });
    if (!unit || unit.organization.status === "SUSPENDED") {
      throw PUBLIC_NOT_FOUND();
    }
    await this.streamIfCurrentlyResolved(
      { organizationId: unit.organizationId, unitId: unit.id, effectiveAt: new Date() },
      publicationStableId,
      res,
    );
  }

  // ---------------------------------------------------------------------

  // Re-runs the *same* resolver check the page itself used, right before
  // streaming bytes — a link handed out on page load must never be trusted
  // as still valid by the time it's clicked (spec: a publication revoked in
  // between must 404, not serve a stale file).
  private async streamIfCurrentlyResolved(
    resolveInput: ResolveInput,
    publicationStableId: string,
    res: Response,
  ): Promise<void> {
    const publication = await this.prisma.publication.findFirst({
      where: { stableId: publicationStableId, organizationId: resolveInput.organizationId },
    });
    if (!publication) throw PUBLIC_NOT_FOUND();

    const { resolved } = await this.resolver.resolvePublications(resolveInput);
    const snapshot = resolved.find((s) => s.publicationId === publication.id);
    if (!snapshot) throw PUBLIC_NOT_FOUND();

    const buffer = await this.storage.get(snapshot.storageKey);
    const filename = sanitizeFilename(snapshot.filename);
    res.setHeader("Content-Type", snapshot.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // Builds the public-safe publication list, exposing only the
  // Publication's own stableId (never documentRevisionId, never a storage
  // key/URL) as the handle the client can use to request a download.
  private async toPublicPublications(
    snapshots: PublicationSnapshot[],
    scope: { productStableId: string } | { unitStableId: string },
  ): Promise<PublicPublicationDto[]> {
    if (snapshots.length === 0) return [];

    const publications = await this.prisma.publication.findMany({
      where: { id: { in: snapshots.map((s) => s.publicationId) } },
      select: { id: true, stableId: true },
    });
    const stableIdByPublicationId = new Map(publications.map((p) => [p.id, p.stableId]));

    const base = "productStableId" in scope ? `/p/${scope.productStableId}` : `/u/${scope.unitStableId}`;

    return snapshots.map((snapshot) => {
      const publicationStableId = stableIdByPublicationId.get(snapshot.publicationId);
      if (!publicationStableId) {
        // Should not happen (every snapshot has a parent Publication row),
        // but fail closed rather than emit a broken/undefined download URL.
        throw new Error(`No Publication found for snapshot ${snapshot.id}`);
      }
      return {
        publicationStableId,
        documentName: snapshot.documentName,
        documentType: snapshot.documentType,
        revision: snapshot.revision,
        language: snapshot.language,
        fileSize: snapshot.fileSize,
        mimeType: snapshot.mimeType,
        filename: sanitizeFilename(snapshot.filename),
        downloadUrl: `${base}/publications/${publicationStableId}/download`,
      };
    });
  }

  // spec §79: conflict-resolution UX is intentionally not surfaced to
  // anonymous end users — a public visitor just sees "no document for that
  // slot" rather than a list of ambiguous candidates. We still log
  // server-side so a manufacturer's applicability-rule conflict doesn't go
  // completely unnoticed.
  private logConflicts(kind: "product" | "unit", stableId: string, count: number): void {
    if (count > 0) {
      this.logger.warn(`Dropped ${count} conflicting resolution group(s) from public ${kind} page ${stableId}`);
    }
  }
}
