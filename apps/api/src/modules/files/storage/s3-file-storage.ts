import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ServiceUnavailableException } from "@nestjs/common";
import type { FileStorage, StoredFile, StoreFileInput } from "./file-storage";

export interface S3FileStorageOptions {
  client: S3Client;
  bucket: string;
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

  async delete(key: string) {
    await this.options.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
  }
}
