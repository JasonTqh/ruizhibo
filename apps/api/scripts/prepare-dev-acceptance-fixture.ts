import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import {
  PickupRelationship,
  PrismaClient,
  StudentStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";

if (!process.env.DATABASE_URL) {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "apps/api/.env"),
    resolve(__dirname, "../.env"),
  ];
  const envFile = candidates.find((candidate) => existsSync(candidate));
  if (envFile) loadEnvFile(envFile);
}

const prisma = new PrismaClient();

const fixture = {
  campus: {
    id: "acceptance-campus-a",
    name: "测试校区A",
  },
  classes: {
    primary: {
      id: "acceptance-class-grade-1",
      name: "一年级测试班",
    },
    historyTarget: {
      id: "acceptance-class-history-b",
      name: "历史测试B班",
    },
  },
  workflowTemplate: {
    id: "acceptance-workflow-template",
    name: "开发验收流程",
  },
} as const;

const purposes = [
  "正常完整流程",
  "缺勤",
  "接送异常",
  "生活异常",
  "跳过流程",
  "转班历史测试",
  ...Array.from({ length: 14 }, () => "批量性能"),
];

const workflowSteps = [
  {
    stepKey: "check-in",
    name: "签到",
    timeRange: "15:20-15:30",
    sortOrder: 10,
    requirePhoto: false,
  },
  {
    stepKey: "homework-check",
    name: "作业检查",
    timeRange: "16:00-16:30",
    sortOrder: 20,
    requirePhoto: false,
  },
  {
    stepKey: "reading",
    name: "阅读",
    timeRange: "16:30-17:00",
    sortOrder: 30,
    requirePhoto: true,
  },
  {
    stepKey: "english-recitation",
    name: "英语背诵",
    timeRange: "17:00-17:30",
    sortOrder: 40,
    requirePhoto: false,
  },
  {
    stepKey: "organize",
    name: "整理",
    timeRange: "18:30-19:00",
    sortOrder: 50,
    requirePhoto: false,
  },
] as const;

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const campus = await tx.campus.upsert({
      where: { id: fixture.campus.id },
      update: {
        name: fixture.campus.name,
        address: "开发验收专用校区",
      },
      create: {
        id: fixture.campus.id,
        name: fixture.campus.name,
        address: "开发验收专用校区",
      },
    });

    const teacher = await tx.user.upsert({
      where: { phone: "13800000001" },
      update: {
        role: UserRole.teacher,
        name: "教师A",
        status: UserStatus.active,
      },
      create: {
        role: UserRole.teacher,
        name: "教师A",
        phone: "13800000001",
        status: UserStatus.active,
      },
    });

    const parent = await tx.user.upsert({
      where: { phone: "13800000002" },
      update: {
        role: UserRole.parent,
        name: "家长A",
        status: UserStatus.active,
      },
      create: {
        role: UserRole.parent,
        name: "家长A",
        phone: "13800000002",
        status: UserStatus.active,
      },
    });

    const primaryClass = await tx.class.upsert({
      where: { id: fixture.classes.primary.id },
      update: {
        campusId: campus.id,
        name: fixture.classes.primary.name,
        teacherId: teacher.id,
      },
      create: {
        id: fixture.classes.primary.id,
        campusId: campus.id,
        name: fixture.classes.primary.name,
        teacherId: teacher.id,
      },
    });

    const historyTargetClass = await tx.class.upsert({
      where: { id: fixture.classes.historyTarget.id },
      update: {
        campusId: campus.id,
        name: fixture.classes.historyTarget.name,
        teacherId: null,
      },
      create: {
        id: fixture.classes.historyTarget.id,
        campusId: campus.id,
        name: fixture.classes.historyTarget.name,
      },
    });

    const students = [];
    for (let index = 1; index <= 20; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const student = await tx.student.upsert({
        where: { id: `acceptance-student-${suffix}` },
        update: {
          classId: primaryClass.id,
          name: `学生${suffix}`,
          status: StudentStatus.active,
        },
        create: {
          id: `acceptance-student-${suffix}`,
          classId: primaryClass.id,
          name: `学生${suffix}`,
          status: StudentStatus.active,
        },
      });
      students.push({
        id: student.id,
        name: student.name,
        purpose: purposes[index - 1],
      });
    }

    const student01 = students[0];
    await tx.studentGuardian.upsert({
      where: {
        studentId_parentId: {
          studentId: student01.id,
          parentId: parent.id,
        },
      },
      update: {
        relation: "妈妈",
        isPrimary: true,
        canReceiveNotice: true,
        canSubmitHomework: true,
        canViewGrowth: true,
        canPickup: true,
        status: "active",
        remark: "开发验收主绑定",
      },
      create: {
        studentId: student01.id,
        parentId: parent.id,
        relation: "妈妈",
        isPrimary: true,
        canReceiveNotice: true,
        canSubmitHomework: true,
        canViewGrowth: true,
        canPickup: true,
        status: "active",
        remark: "开发验收主绑定",
      },
    });

    await tx.authorizedPickupPerson.upsert({
      where: { id: "acceptance-student-01-mother" },
      update: {
        studentId: student01.id,
        name: "妈妈",
        relationship: PickupRelationship.mother,
        phone: "13800000002",
        isActive: true,
        remark: "学生01正常离店验收",
      },
      create: {
        id: "acceptance-student-01-mother",
        studentId: student01.id,
        name: "妈妈",
        relationship: PickupRelationship.mother,
        phone: "13800000002",
        isActive: true,
        remark: "学生01正常离店验收",
      },
    });

    await tx.conversation.upsert({
      where: {
        studentId_parentId_teacherId: {
          studentId: student01.id,
          parentId: parent.id,
          teacherId: teacher.id,
        },
      },
      update: {},
      create: {
        studentId: student01.id,
        parentId: parent.id,
        teacherId: teacher.id,
      },
    });

    const workflowTemplate = await tx.workflowTemplate.upsert({
      where: { id: fixture.workflowTemplate.id },
      update: {
        name: fixture.workflowTemplate.name,
        version: 10_000,
        isActive: true,
      },
      create: {
        id: fixture.workflowTemplate.id,
        name: fixture.workflowTemplate.name,
        version: 10_000,
        isActive: true,
      },
    });

    await tx.workflowTemplateStep.deleteMany({
      where: {
        templateId: workflowTemplate.id,
        stepKey: { notIn: workflowSteps.map((step) => step.stepKey) },
      },
    });
    for (const step of workflowSteps) {
      await tx.workflowTemplateStep.upsert({
        where: {
          templateId_stepKey: {
            templateId: workflowTemplate.id,
            stepKey: step.stepKey,
          },
        },
        update: step,
        create: {
          templateId: workflowTemplate.id,
          ...step,
        },
      });
    }

    const activeStudentCount = await tx.student.count({
      where: {
        classId: primaryClass.id,
        status: StudentStatus.active,
      },
    });

    return {
      campus: { id: campus.id, name: campus.name },
      teacher: {
        id: teacher.id,
        name: teacher.name,
        phone: teacher.phone,
      },
      parent: {
        id: parent.id,
        name: parent.name,
        phone: parent.phone,
      },
      classes: {
        primary: {
          id: primaryClass.id,
          name: primaryClass.name,
          activeStudentCount,
        },
        historyTarget: {
          id: historyTargetClass.id,
          name: historyTargetClass.name,
        },
      },
      studentIds: Object.fromEntries(
        students.map((student, index) => [
          `student${String(index + 1).padStart(2, "0")}`,
          student.id,
        ]),
      ),
      students,
      workflowTemplate: {
        id: workflowTemplate.id,
        name: workflowTemplate.name,
        steps: workflowSteps.map((step) => ({
          name: step.name,
          requirePhoto: step.requirePhoto,
        })),
      },
    };
  });

  process.stdout.write(JSON.stringify(result));
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
