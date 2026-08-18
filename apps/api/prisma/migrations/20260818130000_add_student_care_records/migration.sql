CREATE TYPE "StudentCareRecordType" AS ENUM (
  'meal',
  'water',
  'rest',
  'mood',
  'exception'
);

CREATE TYPE "CareMealSlot" AS ENUM ('snack', 'dinner');

CREATE TYPE "CareExceptionCategory" AS ENUM (
  'physical',
  'emotional',
  'injury',
  'behavior',
  'other'
);

CREATE TABLE "StudentCareRecord" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "teacherId" TEXT,
  "type" "StudentCareRecordType" NOT NULL,
  "mealSlot" "CareMealSlot",
  "value" TEXT,
  "quantity" INTEGER,
  "durationMinutes" INTEGER,
  "exceptionCategory" "CareExceptionCategory",
  "happenedAt" TIMESTAMP(3) NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "needsAttention" BOOLEAN NOT NULL DEFAULT false,
  "remark" TEXT,
  "resolution" TEXT,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentCareRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentCareRecord_fields_check" CHECK (
    (
      "type" = 'meal'
      AND "mealSlot" IS NOT NULL
      AND "value" IN ('good', 'normal', 'little', 'refused')
      AND "quantity" IS NULL
      AND "durationMinutes" IS NULL
      AND "exceptionCategory" IS NULL
      AND "needsAttention" = false
    )
    OR (
      "type" = 'water'
      AND "mealSlot" IS NULL
      AND "value" IS NULL
      AND "quantity" = 1
      AND "durationMinutes" IS NULL
      AND "exceptionCategory" IS NULL
      AND "needsAttention" = false
    )
    OR (
      "type" = 'rest'
      AND "mealSlot" IS NULL
      AND "value" IN ('slept', 'rested', 'no_rest')
      AND "quantity" IS NULL
      AND ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 240)
      AND "exceptionCategory" IS NULL
      AND "needsAttention" = false
    )
    OR (
      "type" = 'mood'
      AND "mealSlot" IS NULL
      AND "value" IN ('good', 'normal', 'low', 'upset')
      AND "quantity" IS NULL
      AND "durationMinutes" IS NULL
      AND "exceptionCategory" IS NULL
      AND "needsAttention" = false
    )
    OR (
      "type" = 'exception'
      AND "mealSlot" IS NULL
      AND "value" IS NULL
      AND "quantity" IS NULL
      AND "durationMinutes" IS NULL
      AND length(btrim("remark")) > 0
    )
  )
);

CREATE INDEX "StudentCareRecord_studentId_serviceDate_idx"
ON "StudentCareRecord"("studentId", "serviceDate");

CREATE INDEX "StudentCareRecord_type_serviceDate_idx"
ON "StudentCareRecord"("type", "serviceDate");

CREATE INDEX "StudentCareRecord_teacherId_serviceDate_idx"
ON "StudentCareRecord"("teacherId", "serviceDate");

CREATE INDEX "StudentCareRecord_needsAttention_serviceDate_idx"
ON "StudentCareRecord"("needsAttention", "serviceDate");

CREATE UNIQUE INDEX "StudentCareRecord_meal_student_service_slot_key"
ON "StudentCareRecord"("studentId", "serviceDate", "mealSlot")
WHERE "type" = 'meal';

CREATE UNIQUE INDEX "StudentCareRecord_rest_student_service_key"
ON "StudentCareRecord"("studentId", "serviceDate")
WHERE "type" = 'rest';

ALTER TABLE "StudentCareRecord"
ADD CONSTRAINT "StudentCareRecord_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentCareRecord"
ADD CONSTRAINT "StudentCareRecord_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
