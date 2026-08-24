-- Create the one fixed MVP plan and its seven configurable course shells.
-- They remain drafts in production until business owners finish and preview
-- the actual content, quizzes and practical checklists.
INSERT INTO "TrainingPlanTemplate" (
  "id", "code", "name", "isActive", "createdAt", "updatedAt"
) VALUES (
  'seed-training-plan-onboarding-v1',
  'new_teacher_onboarding',
  '新教师首轮培训（MVP）',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "TrainingCourse" (
  "id", "code", "name", "category", "summary", "audience",
  "expectedMinutes", "minimumMinutes", "sortOrder", "isRequired",
  "requiresPractical", "isSafety", "status", "createdAt", "updatedAt"
) VALUES
  ('seed-training-course-01','ONBOARDING-CULTURE','校区文化','foundation','待业务方配置正式内容','新入职教师',0,0,10,true,false,false,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('seed-training-course-02','ONBOARDING-COMPENSATION','薪资待遇','foundation','待业务方配置正式内容','新入职教师',0,0,20,true,false,false,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('seed-training-course-03','ONBOARDING-GROWTH','晋升机制','foundation','待业务方配置正式内容','新入职教师',0,0,30,true,false,false,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('seed-training-course-04','ONBOARDING-CLASS-FLOW','带班流程','business','待业务方配置正式内容','新入职教师',0,0,40,true,true,false,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('seed-training-course-05','ONBOARDING-CLASSROOM','课堂管理','business','待业务方配置正式内容','新入职教师',0,0,50,true,true,false,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('seed-training-course-06','ONBOARDING-FAMILY','家校沟通','business','待业务方配置正式内容','新入职教师',0,0,60,true,true,false,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('seed-training-course-07','ONBOARDING-SAFETY','安全管理','safety','待业务方配置正式内容','新入职教师',0,0,70,true,true,true,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "TrainingPlanCourse" (
  "id", "planId", "courseId", "sortOrder"
)
SELECT
  'seed-training-plan-course-' || definition.position,
  plan."id",
  course."id",
  definition.position::integer * 10
FROM (
  VALUES
    ('1','ONBOARDING-CULTURE'),
    ('2','ONBOARDING-COMPENSATION'),
    ('3','ONBOARDING-GROWTH'),
    ('4','ONBOARDING-CLASS-FLOW'),
    ('5','ONBOARDING-CLASSROOM'),
    ('6','ONBOARDING-FAMILY'),
    ('7','ONBOARDING-SAFETY')
) AS definition(position, code)
JOIN "TrainingPlanTemplate" plan ON plan."code" = 'new_teacher_onboarding'
JOIN "TrainingCourse" course ON course."code" = definition.code
ON CONFLICT ("planId", "courseId") DO NOTHING;
