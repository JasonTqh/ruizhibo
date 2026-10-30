ALTER TABLE "User" ADD COLUMN "teacherPositions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "User" SET "teacherPositions" = CASE
  WHEN "teacherPosition" = 'supervisor_teacher' THEN ARRAY['supervisor', 'teacher']
  WHEN "teacherPosition" = 'supervisor' THEN ARRAY['supervisor']
  WHEN "teacherPosition" = 'teacher' THEN ARRAY['teacher']
  ELSE ARRAY[]::TEXT[] END
WHERE "role" = 'teacher';
