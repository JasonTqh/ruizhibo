ALTER TABLE "FileAsset"
ADD COLUMN "storageDriver" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "storageKey" TEXT;

UPDATE "FileAsset"
SET "storageKey" = SUBSTRING("url" FROM 10)
WHERE "url" LIKE '/uploads/%';
