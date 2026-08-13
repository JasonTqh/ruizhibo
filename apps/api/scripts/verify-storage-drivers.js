const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DeleteObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const {
  LocalFileStorage,
} = require("../dist/modules/files/storage/local-file-storage");
const {
  S3FileStorage,
} = require("../dist/modules/files/storage/s3-file-storage");

async function verifyLocalStorage() {
  const directory = await mkdtemp(join(tmpdir(), "ruizhibo-storage-"));
  const storage = new LocalFileStorage(directory);
  const body = Buffer.from("local-storage-check");

  try {
    const stored = await storage.put({
      key: "verify/local.txt",
      body,
      mimeType: "text/plain",
    });
    assert.equal(stored.driver, "local");
    assert.equal(stored.url, "/uploads/verify/local.txt");
    assert.deepEqual(
      await readFile(join(directory, "verify", "local.txt")),
      body,
    );

    await storage.delete(stored.key);
    await assert.rejects(readFile(join(directory, "verify", "local.txt")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function verifyS3Storage() {
  const commands = [];
  const client = {
    async send(command) {
      commands.push(command);
    },
  };
  const storage = new S3FileStorage({
    client,
    bucket: "verify-bucket",
    publicBaseUrl: "https://static.example.com",
  });
  const body = Buffer.from("s3-storage-check");

  const stored = await storage.put({
    key: "verify/object.png",
    body,
    mimeType: "image/png",
  });
  assert.equal(stored.driver, "s3");
  assert.equal(stored.url, "https://static.example.com/verify/object.png");
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.equal(commands[0].input.Bucket, "verify-bucket");
  assert.equal(commands[0].input.Key, "verify/object.png");

  await storage.delete(stored.key);
  assert.ok(commands[1] instanceof DeleteObjectCommand);
  assert.equal(commands[1].input.Key, "verify/object.png");

  const unavailableStorage = new S3FileStorage({
    client: {
      async send() {
        throw new Error("provider unavailable");
      },
    },
    bucket: "verify-bucket",
    publicBaseUrl: "https://static.example.com",
  });
  await assert.rejects(
    unavailableStorage.put({
      key: "verify/failure.png",
      body,
      mimeType: "image/png",
    }),
    (error) => error.getStatus?.() === 503,
  );
}

async function main() {
  await verifyLocalStorage();
  await verifyS3Storage();
  console.log("File storage driver verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
