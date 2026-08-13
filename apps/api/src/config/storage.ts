import { resolve } from "node:path";

export function getLocalUploadDir() {
  const configuredDir = process.env.LOCAL_UPLOAD_DIR?.trim() || "uploads";
  return resolve(process.cwd(), configuredDir);
}
