-- Isolated role_identity_test database only. Apply before the role-scoped migration.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() <> 'role_identity_test' THEN
    RAISE EXCEPTION 'This fixture only supports role_identity_test';
  END IF;
END $$;
INSERT INTO "User" ("id","role","name","phone","passwordHash","status","updatedAt")
VALUES ('role-test-legacy-admin','admin','原管理员','13900000801','preserved-hash','active',NOW());
INSERT INTO "User" ("id","role","name","phone","wechatOpenid","status","updatedAt")
VALUES ('role-test-legacy-teacher','teacher','原教师','13900000802','legacy-teacher-openid','active',NOW());
INSERT INTO "Campus" ("id","name","updatedAt") VALUES ('role-test-legacy-campus','原校区',NOW());
INSERT INTO "Class" ("id","name","campusId","teacherId","updatedAt")
VALUES ('role-test-legacy-class','原班级','role-test-legacy-campus','role-test-legacy-teacher',NOW());
