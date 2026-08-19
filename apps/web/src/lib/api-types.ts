// Shapes mirrored from the real backend responses (apps/api/src/auth,
// apps/api/src/organizations, apps/api/src/public). Field names must match
// the API exactly — see AuthService.toPublicUser/login/me and
// OrganizationsService.listForUser.

export type PlatformRole = "USER" | "PLATFORM_ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  platformRole: PlatformRole;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  defaultLanguage?: string;
  role: string;
}

// --- Public QR-scan API (apps/api/src/public/dto/public-dtos.ts) ---

export interface PublicPublicationDto {
  publicationStableId: string;
  documentName: string;
  documentType: string;
  revision: string;
  language: string;
  fileSize: number;
  mimeType: string;
  filename: string;
  downloadUrl: string;
}

export interface PublicProductDto {
  productStableId: string;
  name: string;
  modelDesignation: string | null;
  description: string | null;
  publications: PublicPublicationDto[];
}

export interface PublicUnitDto {
  unitStableId: string;
  productStableId: string;
  productName: string;
  variantName: string | null;
  serialNumber: string;
  publications: PublicPublicationDto[];
}

// --- Pagination envelope (apps/api/src/common/pagination.ts) ---

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// --- Products domain (apps/api/src/products) ---

export type ProductStatus = "DRAFT" | "ACTIVE" | "DISCONTINUED";
export type UnitStatus = "ACTIVE" | "DECOMMISSIONED";

export interface ProductFamily {
  id: string;
  stableId: string;
  organizationId: string;
  name: string;
  description: string | null;
  internalReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  stableId: string;
  organizationId: string;
  productFamilyId: string | null;
  name: string;
  internalProductNumber: string | null;
  modelDesignation: string | null;
  description: string | null;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  stableId: string;
  organizationId: string;
  productId: string;
  name: string;
  internalVariantNumber: string | null;
  description: string | null;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  stableId: string;
  organizationId: string;
  productId: string;
  name: string;
  manufacturedFrom: string | null;
  manufacturedTo: string | null;
  internalReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  stableId: string;
  organizationId: string;
  productId: string;
  variantId: string | null;
  batchId: string | null;
  serialNumber: string;
  manufacturedAt: string | null;
  deliveredAt: string | null;
  internalReference: string | null;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
}

// --- Documents domain (apps/api/src/documents) ---

export type DocumentStatus = "ACTIVE" | "ARCHIVED";
export type RevisionStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "RETIRED";

export interface DocumentDto {
  id: string;
  stableId: string;
  organizationId: string;
  name: string;
  documentType: string;
  description: string | null;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRevisionDto {
  id: string;
  stableId: string;
  organizationId: string;
  documentId: string;
  revision: string;
  language: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  status: RevisionStatus;
  uploadedById: string;
  uploadedAt: string;
  internalNote: string | null;
  changeDescription: string | null;
  createdAt: string;
}

// --- Applicability rules (apps/api/src/applicability) ---

export interface ApplicabilityRuleDto {
  id: string;
  stableId: string;
  organizationId: string;
  documentRevisionId: string;
  productFamilyId: string | null;
  productId: string | null;
  variantId: string | null;
  batchId: string | null;
  unitId: string | null;
  serialFrom: string | null;
  serialTo: string | null;
  validFrom: string | null;
  validUntil: string | null;
  explicitExclusion: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Publications (apps/api/src/publications) ---

export type PublicationStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

// Mirrors apps/api/src/applicability/applicability.types.ts's
// AppliedRuleSnapshot exactly. This is the FROZEN, historical shape stored
// in PublicationSnapshot.applicabilityRules at publish time — the
// productFamilyName/productName/variantName/batchName/unitSerialNumber
// fields are resolved names as they were the moment this snapshot was
// created, NOT live lookups. They are optional/nullable because snapshots
// written before this feature shipped never populated them — render
// missing gracefully (e.g. "—"), never crash, and NEVER call
// GET /api/products/:id (or any other live endpoint) to backfill a name
// for anything rendered in a Publication History context.
export interface AppliedRuleSnapshotDto {
  id: string;
  productFamilyId: string | null;
  productId: string | null;
  variantId: string | null;
  batchId: string | null;
  unitId: string | null;
  serialFrom: string | null;
  serialFromPrefix: string | null;
  serialFromSequence: string | null;
  serialTo: string | null;
  serialToPrefix: string | null;
  serialToSequence: string | null;
  validFrom: string | null;
  validUntil: string | null;
  explicitExclusion: boolean;
  productFamilyName?: string | null;
  productName?: string | null;
  variantName?: string | null;
  batchName?: string | null;
  unitSerialNumber?: string | null;
}

export interface PublicationSnapshotDto {
  id: string;
  publicationId: string;
  organizationId: string;
  documentId: string;
  documentStableId: string;
  documentRevisionId: string;
  documentName: string;
  documentType: string;
  revision: string;
  language: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  storageKey: string;
  applicabilityRules: AppliedRuleSnapshotDto[];
  scopedProductIds: string[];
  publishedAt: string;
  publishedById: string;
  previousPublicationId: string | null;
  createdAt: string;
}

export interface PublicationDto {
  id: string;
  stableId: string;
  organizationId: string;
  documentRevisionId: string;
  status: PublicationStatus;
  publishedById: string;
  publishedByName?: string | null;
  publishedAt: string;
  supersededAt: string | null;
  supersededById: string | null;
  revokedAt: string | null;
  revokedById: string | null;
  revokedByName?: string | null;
  createdAt: string;
  snapshot?: PublicationSnapshotDto;
}

// --- Publish preview (apps/api/src/publications/publish-preview.service.ts)
// GET /api/publications/preview/:revisionId — Editor+. This is the ONLY
// source of specificity/affectedUnitsCount/conflicts numbers in the UI; the
// frontend must never recompute these client-side (see README.md). ---

export interface RulePreviewDto {
  ruleId: string;
  specificity: number;
  description: string;
  affectedUnitsCount: number;
}

export type ConflictReason = "CONFLICT" | "ALREADY_PUBLISHED";

export interface PublishConflictDto {
  existingPublicationId: string;
  existingPublicationStableId: string;
  newRuleId: string;
  conflictingRuleId: string;
  reason: ConflictReason;
}

export interface PublishPreviewDto {
  revisionId: string;
  documentId: string;
  language: string;
  revisionStatus: string;
  canPublish: boolean;
  rules: RulePreviewDto[];
  totalAffectedUnitsCount: number;
  sampleSerials: string[];
  conflicts: PublishConflictDto[];
}

// --- Audit (apps/api/src/audit) ---

export interface AuditEventDto {
  id: string;
  organizationId: string;
  actorId: string | null;
  actorName?: string | null;
  action: string;
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
  timestamp: string;
  // Accepted by AuditService.record() but currently never populated by any
  // caller — every real row has these as null today. See docs/audit.md's
  // "Known gaps" section. The UI must render an explicit "nicht erfasst"
  // for a null value here, not omit the field or treat it as an error.
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// --- CSV unit import (apps/api/src/imports) ---

export const IMPORT_CANONICAL_FIELDS = [
  "serialNumber",
  "productReference",
  "variantReference",
  "batchReference",
  "manufacturedAt",
  "deliveredAt",
  "internalReference",
] as const;

export type ImportCanonicalField = (typeof IMPORT_CANONICAL_FIELDS)[number];

export interface ValidRowPreviewDto {
  line: number;
  serialNumber: string;
  productId: string;
  productName: string;
  variantId: string | null;
  batchId: string | null;
  manufacturedAt: string | null;
  deliveredAt: string | null;
  internalReference: string | null;
}

export interface InvalidRowDto {
  row: number;
  errors: string[];
}

export interface ImportPreviewResponseDto {
  importId: string;
  totalRows: number;
  validRows: ValidRowPreviewDto[];
  invalidRows: InvalidRowDto[];
  unknownColumns: string[];
  headers: string[];
  columnMapping: Partial<Record<ImportCanonicalField, number>>;
}

export interface ImportCommitResponseDto {
  importId: string;
  importedCount: number;
}

// --- Invitations (apps/api/src/invitations) ---

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export interface InvitationDto {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  status: InvitationStatus;
  invitedById: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  acceptedByUserId: string | null;
}

export interface CreateInvitationResponseDto {
  invitation: InvitationDto;
  token: string;
}

export interface InvitationPreviewDto {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
}

export interface AcceptInvitationResponseDto {
  createdNewAccount: boolean;
  accessToken?: string;
  organizationId: string;
}

// --- Platform administration (apps/api/src/platform) ---

export type TenantLifecycleStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "CLOSED";

export interface PlatformTenantListItemDto {
  id: string;
  stableId: string;
  name: string;
  slug: string;
  status: TenantLifecycleStatus;
  createdAt: string;
  users: number;
  products: number;
  units: number;
  documents: number;
  activePublications: number;
  storageBytes: number;
}

export interface PlatformTenantUsage {
  users: number;
  products: number;
  variants: number;
  units: number;
  documents: number;
  revisions: number;
  activePublications: number;
  storageBytes: number;
}

export interface PlatformTenantDetailDto {
  id: string;
  stableId: string;
  name: string;
  slug: string;
  status: TenantLifecycleStatus;
  defaultLanguage: string;
  timezone: string;
  createdAt: string;
  usage: PlatformTenantUsage;
}

export interface CreateTenantResponseDto {
  tenant: { id: string; name: string; slug: string; status: TenantLifecycleStatus };
  invitation: InvitationDto;
  invitationToken: string;
}

export interface PlatformDashboardSummaryDto {
  tenants: { total: number; active: number; trial: number; suspended: number; closed: number };
  users: number;
  products: number;
  units: number;
  documents: number;
  activePublications: number;
  storageBytes: number;
}

export interface PlatformUserMembershipDto {
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
}

export interface PlatformUserDto {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "SUSPENDED";
  platformRole: PlatformRole;
  createdAt: string;
  lastLoginAt: string | null;
  memberships: PlatformUserMembershipDto[];
}

export interface PlatformAuditEventDto {
  id: string;
  timestamp: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PlatformSystemSnapshotDto {
  version: string;
  environment: string;
  registrationMode: "INVITE_ONLY" | "SELF_SERVICE";
  publicBaseUrl: string | null;
  storageDriver: string;
  database: { healthy: boolean };
  storage: { healthy: boolean };
  lastMigration: { name: string; appliedAt: string | null } | null;
}
