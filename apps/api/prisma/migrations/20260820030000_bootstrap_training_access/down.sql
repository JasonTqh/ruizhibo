DELETE FROM "TrainingPermissionGrant"
WHERE "id" LIKE 'training-bootstrap-%';

DELETE FROM "TrainingFeatureFlag"
WHERE "reason" = '教师学院上线初始化：等待校区灰度启用'
  AND "updatedById" IS NULL;
