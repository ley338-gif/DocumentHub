import { apiRequest, apiUrl } from "../../lib/api-client";
import { getStoredOrganizationId, getStoredToken } from "../../lib/session-storage";
import type {
  Batch,
  Paginated,
  Product,
  ProductFamily,
  ProductVariant,
  PublicationSnapshotDto,
  Unit,
} from "../../lib/api-types";

export interface ListQuery {
  page?: number;
  pageSize?: number;
  [key: string]: string | number | boolean | undefined;
}

export function listProducts(query: ListQuery): Promise<Paginated<Product>> {
  return apiRequest<Paginated<Product>>("/api/products", { query });
}

export function getProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}`);
}

export interface CreateProductInput {
  name: string;
  productFamilyId?: string;
  internalProductNumber?: string;
  modelDesignation?: string;
  description?: string;
  status?: Product["status"];
}

export function createProduct(dto: CreateProductInput): Promise<Product> {
  return apiRequest<Product>("/api/products", { method: "POST", body: dto });
}

export function updateProduct(id: string, dto: Partial<CreateProductInput>): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}`, { method: "PATCH", body: dto });
}

export function listFamilies(query: ListQuery = {}): Promise<Paginated<ProductFamily>> {
  return apiRequest<Paginated<ProductFamily>>("/api/product-families", { query });
}

export interface CreateFamilyInput {
  name: string;
  description?: string;
  internalReference?: string;
}

export function createFamily(dto: CreateFamilyInput): Promise<ProductFamily> {
  return apiRequest<ProductFamily>("/api/product-families", { method: "POST", body: dto });
}

export function updateFamily(id: string, dto: Partial<CreateFamilyInput>): Promise<ProductFamily> {
  return apiRequest<ProductFamily>(`/api/product-families/${id}`, { method: "PATCH", body: dto });
}

export function listVariants(productId: string, query: ListQuery = {}): Promise<Paginated<ProductVariant>> {
  return apiRequest<Paginated<ProductVariant>>(`/api/products/${productId}/variants`, { query });
}

export interface CreateVariantInput {
  name: string;
  internalVariantNumber?: string;
  description?: string;
  status?: ProductStatusInput;
}
type ProductStatusInput = Product["status"];

export function createVariant(productId: string, dto: CreateVariantInput): Promise<ProductVariant> {
  return apiRequest<ProductVariant>(`/api/products/${productId}/variants`, { method: "POST", body: dto });
}

export function updateVariant(
  productId: string,
  id: string,
  dto: Partial<CreateVariantInput>,
): Promise<ProductVariant> {
  return apiRequest<ProductVariant>(`/api/products/${productId}/variants/${id}`, { method: "PATCH", body: dto });
}

export interface ListBatchesQuery extends ListQuery {
  productId?: string;
}

export function listBatches(query: ListBatchesQuery): Promise<Paginated<Batch>> {
  return apiRequest<Paginated<Batch>>("/api/batches", { query });
}

export interface CreateBatchInput {
  productId: string;
  name: string;
  manufacturedFrom?: string;
  manufacturedTo?: string;
  internalReference?: string;
}

export function createBatch(dto: CreateBatchInput): Promise<Batch> {
  return apiRequest<Batch>("/api/batches", { method: "POST", body: dto });
}

export function updateBatch(id: string, dto: Partial<Omit<CreateBatchInput, "productId">>): Promise<Batch> {
  return apiRequest<Batch>(`/api/batches/${id}`, { method: "PATCH", body: dto });
}

export interface ListUnitsQuery extends ListQuery {
  productId?: string;
  serialNumber?: string;
}

export function listUnits(query: ListUnitsQuery): Promise<Paginated<Unit>> {
  return apiRequest<Paginated<Unit>>("/api/units", { query });
}

export interface CreateUnitInput {
  productId: string;
  variantId?: string;
  batchId?: string;
  serialNumber: string;
  manufacturedAt?: string;
  deliveredAt?: string;
  internalReference?: string;
}

export function createUnit(dto: CreateUnitInput): Promise<Unit> {
  return apiRequest<Unit>("/api/units", { method: "POST", body: dto });
}

export function updateUnit(id: string, dto: Partial<Omit<CreateUnitInput, "productId" | "serialNumber">>): Promise<Unit> {
  return apiRequest<Unit>(`/api/units/${id}`, { method: "PATCH", body: dto });
}

// Publications resolved against a given product — used for the "currently
// applicable documents" read on Product Detail's Documentation tab, since
// the domain model has no direct product -> document ownership, only
// applicability-driven resolution (see PublicationResolverService). Note
// this is deliberately labeled "currently applicable documents" in the UI,
// not a raw ownership list.
export interface ResolutionResult {
  resolved: PublicationSnapshotDto[];
  conflicts: { resolutionKey: string; candidates: PublicationSnapshotDto[] }[];
}

export function resolvePublicationsForProduct(productId: string): Promise<ResolutionResult> {
  return apiRequest<ResolutionResult>("/api/publications/resolve", { query: { productId } });
}

/** QR endpoints require auth headers a bare <img src> can't send, so this
 * fetches the PNG as a blob and hands back an object URL the caller can
 * assign to an <img> — and must revoke when done (see PublicAccessTab). */
export async function fetchQrImageUrl(kind: "products" | "units", id: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const orgId = getStoredOrganizationId();
  if (orgId) headers["X-Organization-Id"] = orgId;

  const res = await fetch(apiUrl(`/api/${kind}/${id}/qr.png`), { headers });
  if (!res.ok) throw new Error(`QR-Code konnte nicht geladen werden (Status ${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
