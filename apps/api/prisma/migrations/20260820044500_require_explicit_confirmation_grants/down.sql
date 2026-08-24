-- Compatibility rollback: restore the two former bootstrap grants.
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
    ('practical_confirm'::"TrainingPermission"),
    ('safety_confirm'::"TrainingPermission")
) AS p(permission)
WHERE u."role" = 'admin'
ON CONFLICT ("userId", "permission", "scopeKey") DO NOTHING;
