import {
  AttendanceType,
  GrowthRecordType,
  HomeworkStatus,
  MessageKind,
  PrismaClient,
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
    },
    create: {
      studentId: student.id,
      parentId: parent.id,
      relation: "妈妈",
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

  console.log("Seed data created", {
    campus: campus.name,
    class: klass.name,
    admin: admin.name,
    teacher: teacher.name,
    parent: parent.name,
    student: student.name,
    workflowTemplate: workflowTemplate.name,
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
