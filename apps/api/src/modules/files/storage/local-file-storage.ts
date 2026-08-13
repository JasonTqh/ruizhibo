import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileStorage, StoredFile, StoreFileInput } from "./file-storage";

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

  async delete(key: string) {
    try {
      await unlink(join(this.uploadRoot, ...key.split("/")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
