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

  const isProduction = process.env.NODE_ENV === "production";
  assertTrainingMediaSigningSecret(isProduction);
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const trainingBucket = resolveTrainingPrivateBucket(isProduction);
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
    trainingBucket,
    publicBaseUrl: requiredEnv("S3_PUBLIC_BASE_URL").replace(/\/+$/, ""),
    strictTrainingBucket: isProduction,
  });
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for S3 file storage`);
  return value;
}

function resolveTrainingPrivateBucket(isProduction: boolean) {
  const trainingBucket = process.env.S3_TRAINING_PRIVATE_BUCKET?.trim();
  if (!trainingBucket) {
    if (!isProduction) return undefined;
    throw new Error(
      "S3_TRAINING_PRIVATE_BUCKET is required in production for training assets",
    );
  }
  return trainingBucket;
}

function assertTrainingMediaSigningSecret(isProduction: boolean) {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const trainingSecret = process.env.TRAINING_MEDIA_SIGNING_SECRET?.trim();
  if (!isProduction) return;
  if (!trainingSecret || trainingSecret.length < 32) {
    throw new Error(
      "TRAINING_MEDIA_SIGNING_SECRET must be configured and at least 32 characters in production",
    );
  }
  if (trainingSecret === jwtSecret) {
    throw new Error(
      "TRAINING_MEDIA_SIGNING_SECRET must be independent from JWT_SECRET in production",
    );
  }
}

function parseBoolean(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}
