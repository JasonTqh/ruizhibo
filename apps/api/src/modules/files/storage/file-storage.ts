import type { FileStorageDriver } from "../../../config/storage";
import type { Readable } from "node:stream";

export const FILE_STORAGE = Symbol("FILE_STORAGE");

export interface StoreFileInput {
  key: string;
  body: Buffer;
  mimeType: string;
}

export interface StoreFileFromPathInput {
  key: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface OpenFileInput {
  key: string;
  start?: number;
  end?: number;
}

export interface OpenedFile {
  body: Readable;
  contentLength?: number;
}

export interface StoredFile {
  driver: FileStorageDriver;
  key: string;
  url: string;
}

export interface FileStorage {
  put(input: StoreFileInput): Promise<StoredFile>;
  putFile(input: StoreFileFromPathInput): Promise<StoredFile>;
  open(input: OpenFileInput): Promise<OpenedFile>;
  delete(key: string): Promise<void>;
}
