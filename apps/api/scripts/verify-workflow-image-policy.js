const {
  assertOwnedFileAssetUrls,
} = require("../dist/modules/files/file-asset-policy.js");

const currentTeacherId = "teacher-current";
const otherTeacherId = "teacher-other";
const assets = [
  {
    url: "/uploads/workflow/current.png",
    ownerId: currentTeacherId,
    scene: "workflow",
    mimeType: "image/png",
  },
  {
    url: "/uploads/message/current.png",
    ownerId: currentTeacherId,
    scene: "message",
    mimeType: "image/png",
  },
  {
    url: "/uploads/homework/current.png",
    ownerId: currentTeacherId,
    scene: "homework",
    mimeType: "image/png",
  },
  {
    url: "/uploads/workflow/other.png",
    ownerId: otherTeacherId,
    scene: "workflow",
    mimeType: "image/png",
  },
];

const prisma = {
  fileAsset: {
    async findMany({ where }) {
      return assets
        .filter((asset) => {
          if (asset.ownerId !== where.ownerId || asset.scene !== where.scene) {
            return false;
          }
          if (!where.url.in.includes(asset.url)) return false;
          if (
            where.mimeType?.startsWith &&
            !asset.mimeType.startsWith(where.mimeType.startsWith)
          ) {
            return false;
          }
          return true;
        })
        .map(({ url }) => ({ url }));
    },
  },
};

async function verify(urls) {
  return assertOwnedFileAssetUrls(prisma, {
    ownerId: currentTeacherId,
    scene: "workflow",
    urls,
    imageOnly: true,
    invalidMessage: "Workflow image is invalid",
  });
}

async function expectBadRequest(label, url) {
  try {
    await verify([url]);
  } catch (error) {
    if (typeof error?.getStatus === "function" && error.getStatus() === 400) {
      return;
    }
    throw new Error(`${label} returned an unexpected error: ${error}`);
  }
  throw new Error(`${label} was not rejected`);
}

async function main() {
  const validUrls = await verify([assets[0].url]);
  if (validUrls.length !== 1 || validUrls[0] !== assets[0].url) {
    throw new Error("Current teacher workflow asset was not accepted");
  }

  await expectBadRequest("Message scene asset", assets[1].url);
  await expectBadRequest("Homework scene asset", assets[2].url);
  await expectBadRequest("Other teacher workflow asset", assets[3].url);
  await expectBadRequest(
    "Missing workflow asset",
    "/uploads/workflow/missing.png",
  );

  console.log("Workflow image policy verification passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
