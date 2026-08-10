-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('notice', 'task');

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "unboundStudentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeReceipt" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoticeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notice_teacherId_createdAt_idx" ON "Notice"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "Notice_classId_createdAt_idx" ON "Notice"("classId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeReceipt_noticeId_studentId_parentId_key" ON "NoticeReceipt"("noticeId", "studentId", "parentId");

-- CreateIndex
CREATE INDEX "NoticeReceipt_parentId_createdAt_idx" ON "NoticeReceipt"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "NoticeReceipt_noticeId_confirmedAt_idx" ON "NoticeReceipt"("noticeId", "confirmedAt");

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeReceipt" ADD CONSTRAINT "NoticeReceipt_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeReceipt" ADD CONSTRAINT "NoticeReceipt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeReceipt" ADD CONSTRAINT "NoticeReceipt_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
