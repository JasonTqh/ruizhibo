import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ServiceUnavailableException } from "@nestjs/common";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import type {
  FileStorage,
  OpenFileInput,
  OpenedFile,
  StoredFile,
  StoreFileFromPathInput,
  StoreFileInput,
} from "./file-storage";

export interface S3FileStorageOptions {
  client: S3Client;
  bucket: string;
  trainingBucket?: string;
  strictTrainingBucket?: boolean;
  publicBaseUrl: string;
}

export class S3FileStorage implements FileStorage {
  constructor(private readonly options: S3FileStorageOptions) {}

  async put(input: StoreFileInput): Promise<StoredFile> {
    try {
      await this.options.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: input.key,
          Body: input.body,
          ContentLength: input.body.length,
          ContentType: input.mimeType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    } catch {
      throw new ServiceUnavailableException("文件存储暂时不可用，请稍后重试");
    }

    return {
      driver: "s3",
      key: input.key,
      url: `${this.options.publicBaseUrl}/${input.key}`,
    };
  }

  async putFile(input: StoreFileFromPathInput): Promise<StoredFile> {
    const bucket = this.bucketForKey(input.key);
    try {
      await this.options.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: createReadStream(input.path),
          ContentLength: input.size,
          ContentType: input.mimeType,
          CacheControl: "private, no-store",
        }),
      );
    } catch {
      throw new ServiceUnavailableException("文件存储暂时不可用，请稍后重试");
    }
    return {
      driver: "s3",
      key: input.key,
      url: `s3://${bucket}/${input.key}`,
    };
  }

  async open(input: OpenFileInput): Promise<OpenedFile> {
    try {
      const response = await this.options.client.send(
        new GetObjectCommand({
          Bucket: this.bucketForKey(input.key),
          Key: input.key,
          Range:
            input.start === undefined
              ? undefined
              : `bytes=${input.start}-${input.end ?? ""}`,
        }),
      );
      if (!response.Body) {
        throw new ServiceUnavailableException("文件内容暂时不可用");
      }
      return {
        body: response.Body as Readable,
        contentLength: response.ContentLength,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("文件存储暂时不可用，请稍后重试");
    }
  }

  async delete(key: string) {
    await this.options.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketForKey(key), Key: key }),
    );
  }

  private bucketForKey(key: string) {
    if (!key.startsWith("training-course/")) return this.options.bucket;
    if (!this.options.trainingBucket) {
      if (this.options.strictTrainingBucket) {
        throw new ServiceUnavailableException(
          "Training media private bucket is not configured",
        );
      }
      return this.options.bucket;
    }
    return this.options.trainingBucket;
  }
}
