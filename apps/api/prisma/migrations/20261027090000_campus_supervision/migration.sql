ALTER TABLE "LessonPlan" ADD COLUMN "publishedAt" TIMESTAMP(3);
-- A currently published plan is proven public; do not infer publication from archival.
UPDATE "LessonPlan" SET "publishedAt" = "updatedAt" WHERE "status" = 'published';
-- Recover archived publication only when an explicit publish audit exists.
UPDATE "LessonPlan" AS p SET "publishedAt" = evidence.first_published
FROM (
 SELECT "targetId", MIN("createdAt") AS first_published FROM "AuditLog"
 WHERE "targetType" = 'LessonPlan' AND (
  ("action" IN ('teacher.lessonPlan.create','teacher.lessonPlan.update','teacher.lessonPlan.status') AND "detail"->>'status' = 'published')
  OR ("action" = 'admin.lessonPlan.status.update' AND "detail"->>'to' = 'published')
 ) GROUP BY "targetId"
) AS evidence
WHERE p."id" = evidence."targetId" AND p."publishedAt" IS NULL;
CREATE TABLE "_CampusSupervisors" (
 "A" TEXT NOT NULL,
 "B" TEXT NOT NULL,
 CONSTRAINT "_CampusSupervisors_A_fkey" FOREIGN KEY ("A") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "_CampusSupervisors_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "_CampusSupervisors_AB_unique" ON "_CampusSupervisors"("A", "B");
CREATE INDEX "_CampusSupervisors_B_index" ON "_CampusSupervisors"("B");
