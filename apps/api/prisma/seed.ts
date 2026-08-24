import {
  AttendanceType,
  GrowthRecordType,
  HomeworkStatus,
  LessonPlanStatus,
  MessageKind,
  PickupRelationship,
  PrismaClient,
  ResearchActivityStatus,
  ResearchActivityType,
  ResearchParticipationStatus,
  TrainingContentStatus,
  TrainingCourseCategory,
  TrainingPermission,
  TrainingQuestionType,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const campus = await prisma.campus.upsert({
    where: { id: "seed-campus-main" },
    update: {},
    create: {
      id: "seed-campus-main",
      name: "锐之博托管中心",
      address: "请替换为真实地址",
      phone: "13800000000",
    },
  });

  const teacher = await prisma.user.upsert({
    where: { phone: "13800000001" },
    update: {
      role: UserRole.teacher,
      name: "李老师",
    },
    create: {
      role: UserRole.teacher,
      name: "李老师",
      phone: "13800000001",
    },
  });

  const parent = await prisma.user.upsert({
    where: { phone: "13800000002" },
    update: {
      role: UserRole.parent,
      name: "张小明家长",
    },
    create: {
      role: UserRole.parent,
      name: "张小明家长",
      phone: "13800000002",
    },
  });

  const admin = await prisma.user.upsert({
    where: { phone: "13800000000" },
    update: {
      role: UserRole.admin,
      name: "系统管理员",
    },
    create: {
      role: UserRole.admin,
      name: "系统管理员",
      phone: "13800000000",
    },
  });

  const klass = await prisma.class.upsert({
    where: { id: "seed-class-evening-a" },
    update: {
      campusId: campus.id,
      teacherId: teacher.id,
      name: "晚托 A 班",
    },
    create: {
      id: "seed-class-evening-a",
      campusId: campus.id,
      teacherId: teacher.id,
      name: "晚托 A 班",
    },
  });

  const student = await prisma.student.upsert({
    where: { id: "seed-student-zhang-xiaoming" },
    update: {
      classId: klass.id,
      name: "张小明",
      gender: "男",
    },
    create: {
      id: "seed-student-zhang-xiaoming",
      classId: klass.id,
      name: "张小明",
      gender: "男",
    },
  });

  await prisma.studentGuardian.upsert({
    where: {
      studentId_parentId: {
        studentId: student.id,
        parentId: parent.id,
      },
    },
    update: {
      relation: "妈妈",
      canPickup: true,
    },
    create: {
      studentId: student.id,
      parentId: parent.id,
      relation: "妈妈",
      canPickup: true,
    },
  });

  await prisma.authorizedPickupPerson.upsert({
    where: { id: "seed-pickup-person-grandfather" },
    update: {
      studentId: student.id,
      name: "张爷爷",
      relationship: PickupRelationship.grandfather,
      phone: "13800000003",
      isActive: true,
      remark: "Seed authorized pickup person",
    },
    create: {
      id: "seed-pickup-person-grandfather",
      studentId: student.id,
      name: "张爷爷",
      relationship: PickupRelationship.grandfather,
      phone: "13800000003",
      isActive: true,
      remark: "Seed authorized pickup person",
    },
  });

  const workflowTemplate = await prisma.workflowTemplate.upsert({
    where: { id: "seed-workflow-template-daily" },
    update: {
      name: "托管一日流程",
      version: 1,
      isActive: true,
    },
    create: {
      id: "seed-workflow-template-daily",
      name: "托管一日流程",
      version: 1,
      isActive: true,
    },
  });

  const workflowSteps = [
    ["arrive", "到校签到", "16:30-17:00", 10, false],
    ["homework", "作业辅导", "17:00-18:20", 20, false],
    ["dinner", "晚餐休息", "18:20-19:00", 30, false],
    ["review", "复习整理", "19:00-20:00", 40, false],
    ["leave", "离校交接", "20:00-20:30", 50, true],
  ] as const;

  for (const [
    stepKey,
    name,
    timeRange,
    sortOrder,
    requirePhoto,
  ] of workflowSteps) {
    await prisma.workflowTemplateStep.upsert({
      where: {
        templateId_stepKey: {
          templateId: workflowTemplate.id,
          stepKey,
        },
      },
      update: {
        name,
        timeRange,
        sortOrder,
        requirePhoto,
      },
      create: {
        templateId: workflowTemplate.id,
        stepKey,
        name,
        timeRange,
        sortOrder,
        requirePhoto,
      },
    });

    await prisma.workflowStep.updateMany({
      where: {
        stepKey,
        session: { templateId: workflowTemplate.id },
      },
      data: { requirePhoto },
    });
  }

  await prisma.attendanceEvent.upsert({
    where: { id: "seed-attendance-arrive" },
    update: {
      studentId: student.id,
      teacherId: teacher.id,
      type: AttendanceType.arrive,
      happenedAt: new Date("2026-07-06T08:30:00.000Z"),
      remark: "Seed arrive event",
    },
    create: {
      id: "seed-attendance-arrive",
      studentId: student.id,
      teacherId: teacher.id,
      type: AttendanceType.arrive,
      happenedAt: new Date("2026-07-06T08:30:00.000Z"),
      remark: "Seed arrive event",
    },
  });

  await prisma.growthRecord.upsert({
    where: { id: "seed-growth-record-feedback" },
    update: {
      studentId: student.id,
      teacherId: teacher.id,
      type: GrowthRecordType.teacher_feedback,
      title: "今日表现",
      content: "作业完成认真，课堂专注度较好。",
      visibleToParent: true,
    },
    create: {
      id: "seed-growth-record-feedback",
      studentId: student.id,
      teacherId: teacher.id,
      type: GrowthRecordType.teacher_feedback,
      title: "今日表现",
      content: "作业完成认真，课堂专注度较好。",
      visibleToParent: true,
    },
  });

  const homework = await prisma.homeworkAssignment.upsert({
    where: { id: "seed-homework-math" },
    update: {
      classId: klass.id,
      teacherId: teacher.id,
      title: "数学每日练习",
      subject: "数学",
      content: "完成口算练习一页，并订正错题。",
    },
    create: {
      id: "seed-homework-math",
      classId: klass.id,
      teacherId: teacher.id,
      title: "数学每日练习",
      subject: "数学",
      content: "完成口算练习一页，并订正错题。",
    },
  });

  await prisma.homeworkSubmission.upsert({
    where: {
      homeworkId_studentId: {
        homeworkId: homework.id,
        studentId: student.id,
      },
    },
    update: {
      status: HomeworkStatus.pending,
    },
    create: {
      homeworkId: homework.id,
      studentId: student.id,
      status: HomeworkStatus.pending,
    },
  });

  const lessonPlan = await prisma.lessonPlan.upsert({
    where: { id: "seed-lesson-plan-clock" },
    update: {
      teacherId: teacher.id,
      classId: klass.id,
      theme: "认识时间与钟表",
      lessonDate: new Date("2026-08-12T12:00:00.000Z"),
      durationMinutes: 45,
      objectives: "认识整点和半点，能够结合生活场景读取钟面时间。",
      content:
        "1. 用作息图片导入时间概念。\n2. 观察钟面，认识时针和分针。\n3. 小组拨钟练习。\n4. 完成课堂练习并总结。",
      status: LessonPlanStatus.published,
    },
    create: {
      id: "seed-lesson-plan-clock",
      teacherId: teacher.id,
      classId: klass.id,
      theme: "认识时间与钟表",
      lessonDate: new Date("2026-08-12T12:00:00.000Z"),
      durationMinutes: 45,
      objectives: "认识整点和半点，能够结合生活场景读取钟面时间。",
      content:
        "1. 用作息图片导入时间概念。\n2. 观察钟面，认识时针和分针。\n3. 小组拨钟练习。\n4. 完成课堂练习并总结。",
      status: LessonPlanStatus.published,
    },
  });

  const researchActivity = await prisma.researchActivity.upsert({
    where: { id: "seed-research-observation-math" },
    update: {
      organizerId: teacher.id,
      campusId: campus.id,
      type: ResearchActivityType.observation,
      title: "数学作业讲评示范课",
      description:
        "围绕错题分类、学生表达和课堂反馈开展听课评课，活动后共同沉淀可复用的讲评策略。",
      startAt: new Date("2026-08-13T06:00:00.000Z"),
      endAt: new Date("2026-08-13T07:30:00.000Z"),
      location: "锐之博托管中心 · 晚托 A 班教室",
      status: ResearchActivityStatus.open,
    },
    create: {
      id: "seed-research-observation-math",
      organizerId: teacher.id,
      campusId: campus.id,
      type: ResearchActivityType.observation,
      title: "数学作业讲评示范课",
      description:
        "围绕错题分类、学生表达和课堂反馈开展听课评课，活动后共同沉淀可复用的讲评策略。",
      startAt: new Date("2026-08-13T06:00:00.000Z"),
      endAt: new Date("2026-08-13T07:30:00.000Z"),
      location: "锐之博托管中心 · 晚托 A 班教室",
      status: ResearchActivityStatus.open,
    },
  });

  await prisma.researchParticipant.upsert({
    where: {
      activityId_teacherId: {
        activityId: researchActivity.id,
        teacherId: teacher.id,
      },
    },
    update: { status: ResearchParticipationStatus.registered },
    create: {
      activityId: researchActivity.id,
      teacherId: teacher.id,
      status: ResearchParticipationStatus.registered,
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: {
      studentId_parentId_teacherId: {
        studentId: student.id,
        parentId: parent.id,
        teacherId: teacher.id,
      },
    },
    update: {},
    create: {
      studentId: student.id,
      parentId: parent.id,
      teacherId: teacher.id,
    },
  });

  await prisma.message.upsert({
    where: { id: "seed-message-parent-hello" },
    update: {
      conversationId: conversation.id,
      senderId: parent.id,
      kind: MessageKind.text,
      content: "老师您好，今天孩子作业完成情况如何？",
    },
    create: {
      id: "seed-message-parent-hello",
      conversationId: conversation.id,
      senderId: parent.id,
      kind: MessageKind.text,
      content: "老师您好，今天孩子作业完成情况如何？",
    },
  });

  await seedTrainingFoundation({
    campusId: campus.id,
    adminId: admin.id,
  });

  console.log("Seed data created", {
    campus: campus.name,
    class: klass.name,
    admin: admin.name,
    teacher: teacher.name,
    parent: parent.name,
    student: student.name,
    workflowTemplate: workflowTemplate.name,
    lessonPlan: lessonPlan.theme,
    researchActivity: researchActivity.title,
  });
}

async function seedTrainingFoundation(input: {
  campusId: string;
  adminId: string;
}) {
  const definitions = [
    {
      code: "ONBOARDING-CULTURE",
      name: "校区文化",
      category: TrainingCourseCategory.foundation,
      summary: "了解锐之博的教育理念、服务承诺与校区协作方式。",
      practical: [] as string[],
    },
    {
      code: "ONBOARDING-COMPENSATION",
      name: "薪资待遇",
      category: TrainingCourseCategory.foundation,
      summary: "了解薪酬结构、考勤口径、福利及常见问题的咨询路径。",
      practical: [] as string[],
    },
    {
      code: "ONBOARDING-GROWTH",
      name: "晋升机制",
      category: TrainingCourseCategory.foundation,
      summary: "了解教师能力发展路径、评价周期和晋升基本规则。",
      practical: [] as string[],
    },
    {
      code: "ONBOARDING-CLASS-FLOW",
      name: "带班流程",
      category: TrainingCourseCategory.business,
      summary: "掌握从学生到校、托管服务到离校交接的标准带班流程。",
      practical: ["按校区一日流程完成一次模拟带班", "准确记录关键交接信息"],
    },
    {
      code: "ONBOARDING-CLASSROOM",
      name: "课堂管理",
      category: TrainingCourseCategory.business,
      summary: "掌握课堂秩序、作业辅导、行为反馈和异常处置方法。",
      practical: ["完成一次模拟课堂组织", "演示课堂异常的标准处置"],
    },
    {
      code: "ONBOARDING-FAMILY",
      name: "家校沟通",
      category: TrainingCourseCategory.business,
      summary: "掌握日常反馈、敏感问题沟通和信息留痕的基本规范。",
      practical: ["完成一次典型家长沟通演练", "按规范形成沟通记录"],
    },
    {
      code: "ONBOARDING-SAFETY",
      name: "安全管理",
      category: TrainingCourseCategory.safety,
      summary: "掌握接送、消防、食品与突发事件等安全管理要求。",
      practical: [
        "核验学生接送授权并完成模拟交接",
        "演示突发事件上报和现场保护流程",
        "确认校区消防与急救物资位置",
      ],
    },
  ];

  const courseIds: string[] = [];
  for (const [index, definition] of definitions.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const course = await prisma.trainingCourse.upsert({
      where: { code: definition.code },
      update: {},
      create: {
        id: `seed-training-course-${number}`,
        code: definition.code,
        name: definition.name,
        category: definition.category,
        summary: `${definition.summary} 当前为结构化测试内容，上线前请由业务责任人复核并替换。`,
        audience: "新入职教师",
        expectedMinutes: 20,
        minimumMinutes: 10,
        sortOrder: (index + 1) * 10,
        isRequired: true,
        requiresPractical: definition.practical.length > 0,
        isSafety: definition.code === "ONBOARDING-SAFETY",
        status: TrainingContentStatus.enabled,
        createdById: input.adminId,
        updatedById: input.adminId,
      },
    });
    courseIds.push(course.id);

    const chapterId = `seed-training-chapter-${number}-01`;
    await prisma.trainingChapter.upsert({
      where: { id: chapterId },
      update: {},
      create: {
        id: chapterId,
        courseId: course.id,
        title: `${definition.name}基础要求`,
        contentHtml: `<h2>${definition.name}</h2><p>${definition.summary}</p><p><strong>测试内容：</strong>请阅读本章、达到最低学习时长并完成测验。正式内容可在培训后台配置。</p>`,
        sortOrder: 10,
        isEnabled: true,
      },
    });

    const quizId = `seed-training-quiz-${number}`;
    await prisma.trainingQuiz.upsert({
      where: { courseId: course.id },
      update: {},
      create: {
        id: quizId,
        courseId: course.id,
        passScore: 80,
      },
    });
    await prisma.trainingQuizQuestion.upsert({
      where: { id: `seed-training-question-${number}-01` },
      update: {},
      create: {
        id: `seed-training-question-${number}-01`,
        quizId,
        type: TrainingQuestionType.single_choice,
        prompt: `完成“${definition.name}”学习后，遇到不确定的业务规则应如何处理？`,
        options: [
          { id: "A", label: "按个人经验直接处理" },
          { id: "B", label: "查阅正式规范并向责任人确认" },
          { id: "C", label: "忽略该问题" },
          { id: "D", label: "让家长自行决定" },
        ],
        correctAnswers: ["B"],
        score: 100,
        explanation: "不确定时应以正式规范和责任人确认结果为准，并保留必要记录。",
        sortOrder: 10,
      },
    });

    for (const [itemIndex, title] of definition.practical.entries()) {
      await prisma.trainingPracticalTemplateItem.upsert({
        where: { id: `seed-training-practical-${number}-${itemIndex + 1}` },
        update: {},
        create: {
          id: `seed-training-practical-${number}-${itemIndex + 1}`,
          courseId: course.id,
          title,
          instructions: "由带教老师现场观察，并填写通过或需复训及具体评语。",
          isRequired: true,
          sortOrder: (itemIndex + 1) * 10,
        },
      });
    }
  }

  const plan = await prisma.trainingPlanTemplate.upsert({
    where: { id: "seed-training-plan-onboarding-v1" },
    update: { code: "new_teacher_onboarding", isActive: true },
    create: {
      id: "seed-training-plan-onboarding-v1",
      code: "new_teacher_onboarding",
      name: "新教师首轮培训（MVP）",
      isActive: true,
    },
  });
  for (const [index, courseId] of courseIds.entries()) {
    await prisma.trainingPlanCourse.upsert({
      where: {
        planId_courseId: { planId: plan.id, courseId },
      },
      update: {},
      create: {
        id: `seed-training-plan-course-${index + 1}`,
        planId: plan.id,
        courseId,
        sortOrder: (index + 1) * 10,
      },
    });
  }

  for (const permission of Object.values(TrainingPermission)) {
    await prisma.trainingPermissionGrant.upsert({
      where: {
        userId_permission_scopeKey: {
          userId: input.adminId,
          permission,
          scopeKey: "GLOBAL",
        },
      },
      update: { isActive: true },
      create: {
        userId: input.adminId,
        scopeKey: "GLOBAL",
        permission,
        isActive: true,
        createdById: input.adminId,
      },
    });
  }

  await prisma.trainingFeatureFlag.upsert({
    where: { campusId: input.campusId },
    update: {},
    create: {
      campusId: input.campusId,
      enabled: true,
      updatedById: input.adminId,
      reason: "开发环境初始化",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
