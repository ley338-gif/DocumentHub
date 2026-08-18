export const STORAGE_SERVICE = "STORAGE_SERVICE";

export interface StorageService {
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}
