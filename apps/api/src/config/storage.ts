import { resolve } from "node:path";

export type FileStorageDriver = "local" | "s3";

export function getFileStorageDriver(): FileStorageDriver {
  const driver = (
    process.env.FILE_STORAGE_DRIVER?.trim() || "local"
  ).toLowerCase();
  if (driver !== "local" && driver !== "s3") {
    throw new Error(`Unsupported FILE_STORAGE_DRIVER: ${driver}`);
  }
  return driver;
}

export function getLocalUploadDir() {
  const configuredDir = process.env.LOCAL_UPLOAD_DIR?.trim() || "uploads";
  return resolve(process.cwd(), configuredDir);
}
