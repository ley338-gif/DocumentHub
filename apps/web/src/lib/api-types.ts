// Shapes mirrored from the real backend responses (apps/api/src/auth,
// apps/api/src/organizations, apps/api/src/public). Field names must match
// the API exactly — see AuthService.toPublicUser/login/me and
// OrganizationsService.listForUser.

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
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
