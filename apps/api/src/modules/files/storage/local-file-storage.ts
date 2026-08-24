import { createReadStream } from "node:fs";
import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  FileStorage,
  OpenFileInput,
  OpenedFile,
  StoredFile,
  StoreFileFromPathInput,
  StoreFileInput,
} from "./file-storage";

export class LocalFileStorage implements FileStorage {
  constructor(private readonly uploadRoot: string) {}

  async put(input: StoreFileInput): Promise<StoredFile> {
    const target = join(this.uploadRoot, ...input.key.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.body);

    return {
      driver: "local",
      key: input.key,
      url: `/uploads/${input.key}`,
    };
  }

  async putFile(input: StoreFileFromPathInput): Promise<StoredFile> {
    const target = this.target(input.key);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(input.path, target);
    return {
      driver: "local",
      key: input.key,
      url: `/uploads/${input.key}`,
    };
  }

  async open(input: OpenFileInput): Promise<OpenedFile> {
    const range =
      input.start === undefined
        ? undefined
        : { start: input.start, end: input.end };
    return {
      body: createReadStream(this.target(input.key), range),
      contentLength:
        input.start !== undefined && input.end !== undefined
          ? input.end - input.start + 1
          : undefined,
    };
  }

  async delete(key: string) {
    try {
      await unlink(this.target(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }


  private target(key: string) {
    return join(this.uploadRoot, ...key.split("/"));
  }
}
