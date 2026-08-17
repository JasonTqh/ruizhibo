-- CreateEnum
CREATE TYPE "PickupRelationship" AS ENUM (
  'father',
  'mother',
  'grandfather',
  'grandmother',
  'maternal_grandfather',
  'maternal_grandmother',
  'sibling',
  'relative',
  'other'
);

-- CreateEnum
CREATE TYPE "PickupEventType" AS ENUM (
  'picked_up_from_school',
  'arrived_at_center',
  'left_center'
);

-- CreateEnum
CREATE TYPE "PickupArrivalMethod" AS ENUM (
  'teacher_pickup',
  'parent_delivered',
  'self_arrived',
  'other'
);

-- CreateEnum
CREATE TYPE "PickupHandoffStatus" AS ENUM (
  'normal',
  'temporary_authorization',
  'exception'
);

-- AlterTable
ALTER TABLE "StudentGuardian"
ADD COLUMN "canPickup" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AuthorizedPickupPerson" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" "PickupRelationship" NOT NULL,
  "phone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuthorizedPickupPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupRecord" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "type" "PickupEventType" NOT NULL,
  "happenedAt" TIMESTAMP(3) NOT NULL,
  "teacherId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "arrivalMethod" "PickupArrivalMethod",
  "studentGuardianId" TEXT,
  "pickupPersonId" TEXT,
  "pickupPersonNameSnapshot" TEXT,
  "relationshipSnapshot" TEXT,
  "phoneSnapshot" TEXT,
  "status" "PickupHandoffStatus" NOT NULL DEFAULT 'normal',
  "isException" BOOLEAN NOT NULL DEFAULT false,
  "exceptionReason" TEXT,
  "resolution" TEXT,
  "remark" TEXT,
  "attendanceEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PickupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthorizedPickupPerson_studentId_isActive_idx"
ON "AuthorizedPickupPerson"("studentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PickupRecord_attendanceEventId_key"
ON "PickupRecord"("attendanceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PickupRecord_studentId_serviceDate_type_key"
ON "PickupRecord"("studentId", "serviceDate", "type");

-- CreateIndex
CREATE INDEX "PickupRecord_studentId_serviceDate_idx"
ON "PickupRecord"("studentId", "serviceDate");

-- CreateIndex
CREATE INDEX "PickupRecord_classId_serviceDate_idx"
ON "PickupRecord"("classId", "serviceDate");

-- CreateIndex
CREATE INDEX "PickupRecord_teacherId_serviceDate_idx"
ON "PickupRecord"("teacherId", "serviceDate");

-- CreateIndex
CREATE INDEX "PickupRecord_campusId_serviceDate_idx"
ON "PickupRecord"("campusId", "serviceDate");

-- CreateIndex
CREATE INDEX "PickupRecord_status_serviceDate_idx"
ON "PickupRecord"("status", "serviceDate");

-- CreateIndex
CREATE INDEX "PickupRecord_isException_serviceDate_idx"
ON "PickupRecord"("isException", "serviceDate");

-- AddForeignKey
ALTER TABLE "AuthorizedPickupPerson"
ADD CONSTRAINT "AuthorizedPickupPerson_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_campusId_fkey"
FOREIGN KEY ("campusId") REFERENCES "Campus"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_studentGuardianId_fkey"
FOREIGN KEY ("studentGuardianId") REFERENCES "StudentGuardian"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_pickupPersonId_fkey"
FOREIGN KEY ("pickupPersonId") REFERENCES "AuthorizedPickupPerson"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRecord"
ADD CONSTRAINT "PickupRecord_attendanceEventId_fkey"
FOREIGN KEY ("attendanceEventId") REFERENCES "AttendanceEvent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
