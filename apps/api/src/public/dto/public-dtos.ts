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
