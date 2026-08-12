-- CreateEnum
CREATE TYPE "ResearchActivityType" AS ENUM ('discussion', 'observation', 'training');

-- CreateEnum
CREATE TYPE "ResearchActivityStatus" AS ENUM ('draft', 'open', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ResearchParticipationStatus" AS ENUM ('registered', 'attended', 'cancelled');

-- CreateTable
CREATE TABLE "ResearchActivity" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "type" "ResearchActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "status" "ResearchActivityStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchParticipant" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "ResearchParticipationStatus" NOT NULL DEFAULT 'registered',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchParticipant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchActivity_campusId_startAt_idx" ON "ResearchActivity"("campusId", "startAt");
CREATE INDEX "ResearchActivity_organizerId_startAt_idx" ON "ResearchActivity"("organizerId", "startAt");
CREATE INDEX "ResearchActivity_type_status_idx" ON "ResearchActivity"("type", "status");
CREATE UNIQUE INDEX "ResearchParticipant_activityId_teacherId_key" ON "ResearchParticipant"("activityId", "teacherId");
CREATE INDEX "ResearchParticipant_teacherId_status_idx" ON "ResearchParticipant"("teacherId", "status");

ALTER TABLE "ResearchActivity" ADD CONSTRAINT "ResearchActivity_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchActivity" ADD CONSTRAINT "ResearchActivity_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchParticipant" ADD CONSTRAINT "ResearchParticipant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ResearchActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchParticipant" ADD CONSTRAINT "ResearchParticipant_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
