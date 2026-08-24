-- Existing administrators receive global training permissions so the new
-- module is operable immediately after deployment. Fine-grained grants can
-- then be managed in the training permission screen.
INSERT INTO "TrainingPermissionGrant" (
  "id",
  "userId",
  "campusId",
  "scopeKey",
  "permission",
  "isActive",
  "createdById",
  "createdAt",
  "updatedAt"
)
SELECT
  'training-bootstrap-' || substr(md5(u."id" || ':' || p.permission::text), 1, 24),
  u."id",
  NULL,
  'GLOBAL',
  p.permission,
  true,
  u."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (
  VALUES
    ('training_manage'::"TrainingPermission"),
    ('course_manage'::"TrainingPermission"),
    ('practical_confirm'::"TrainingPermission"),
    ('safety_confirm'::"TrainingPermission")
) AS p(permission)
WHERE u."role" = 'admin'
ON CONFLICT ("userId", "permission", "scopeKey") DO NOTHING;

-- All existing campuses start disabled. This preserves the requested
-- campus-by-campus grey rollout; seed data explicitly enables the dev campus.
INSERT INTO "TrainingFeatureFlag" (
  "campusId",
  "enabled",
  "reason",
  "updatedById",
  "updatedAt"
)
SELECT
  c."id",
  false,
  '教师学院上线初始化：等待校区灰度启用',
  NULL,
  CURRENT_TIMESTAMP
FROM "Campus" c
ON CONFLICT ("campusId") DO NOTHING;
