-- Practical and safety confirmation are explicit grants in PRD v1.1. Remove
-- only the automatic bootstrap grants; grants created through the management
-- screen use different identifiers and are preserved.
DELETE FROM "TrainingPermissionGrant"
WHERE "id" LIKE 'training-bootstrap-%'
  AND "permission" IN ('practical_confirm', 'safety_confirm');
