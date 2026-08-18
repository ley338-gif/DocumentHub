import { PublicationSnapshot } from "@prisma/client";

export interface ResolveInput {
  organizationId: string;
  productId?: string;
  variantId?: string;
  batchId?: string;
  unitId?: string;
  serialNumber?: string;
  language?: string;
  effectiveAt: Date;
}

export interface ConflictGroup {
  resolutionKey: string;
  candidates: PublicationSnapshot[];
}

export interface ResolutionResult {
  resolved: PublicationSnapshot[];
  conflicts: ConflictGroup[];
}
