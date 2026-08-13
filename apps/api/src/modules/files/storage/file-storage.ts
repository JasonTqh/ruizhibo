import type { FileStorageDriver } from "../../../config/storage";

export const FILE_STORAGE = Symbol("FILE_STORAGE");

export interface StoreFileInput {
  key: string;
  body: Buffer;
  mimeType: string;
}

export interface StoredFile {
  driver: FileStorageDriver;
  key: string;
  url: string;
}

export interface FileStorage {
  put(input: StoreFileInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}
