import { S3Client } from "@aws-sdk/client-s3";
import {
  getFileStorageDriver,
  getLocalUploadDir,
} from "../../../config/storage";
import type { FileStorage } from "./file-storage";
import { LocalFileStorage } from "./local-file-storage";
import { S3FileStorage } from "./s3-file-storage";

export function createFileStorage(): FileStorage {
  if (getFileStorageDriver() === "local") {
    return new LocalFileStorage(getLocalUploadDir());
  }

  const endpoint = process.env.S3_ENDPOINT?.trim();
  const client = new S3Client({
    region: requiredEnv("S3_REGION"),
    endpoint: endpoint || undefined,
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE),
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    },
  });

  return new S3FileStorage({
    client,
    bucket: requiredEnv("S3_BUCKET"),
    publicBaseUrl: requiredEnv("S3_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  });
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for S3 file storage`);
  return value;
}

function parseBoolean(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}
