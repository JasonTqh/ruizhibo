import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import {
  AttendanceType,
  GrowthRecordType,
  HomeworkStatus,
  PickupArrivalMethod,
  PickupEventType,
  PickupHandoffStatus,
  PrismaClient,
  StudentCareRecordType,
  StudentWorkflowStepStatus,
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

const [, , command, targetId, actorId, extra] = process.argv;
const prisma = new PrismaClient();

async function main() {
  if (!command || !targetId) {
    throw new Error(
      "Usage: tsx daily-report-verification-fixture.ts <command> <targetId> [actorId] [extra]",
    );
  }

  if (command === "set-class-photo") {
    const step = await prisma.workflowStep.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        session: { select: { class: { select: { name: true } } } },
      },
    });
    assertVerificationName(step?.session.class.name);
    await prisma.workflowStep.update({
      where: { id: targetId },
      data: {
        photoUrls: [extra || "/uploads/cp36-class-photo-must-not-leak.png"],
      },
    });
    process.stdout.write(targetId);
    return;
  }

  if (command === "set-homework-status") {
    const submission = await prisma.homeworkSubmission.findUnique({
      where: { id: targetId },
      select: { id: true, student: { select: { name: true } } },
    });
    assertVerificationName(submission?.student.name);
    if (
      !submission ||
      !extra ||
      !Object.values(HomeworkStatus).includes(extra as HomeworkStatus)
    ) {
      throw new Error("Valid verification submission and status are required");
    }
    await prisma.homeworkSubmission.update({
      where: { id: submission.id },
      data: { status: extra as HomeworkStatus },
    });
    process.stdout.write(submission.id);
    return;
  }

  const student = await prisma.student.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      name: true,
      classId: true,
      class: { select: { campusId: true } },
    },
  });
  assertVerificationName(student?.name);
  if (!student) throw new Error("Daily report verification student not found");

  if (command === "create-transfer-contamination") {
    if (!actorId) throw new Error("teacherId is required");
    const serviceDate = chinaBusinessDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    const happenedAt = new Date(serviceDate.getTime() + 10 * 60 * 60 * 1000);
    const template = await prisma.workflowTemplate.findFirst({
      where: { isActive: true },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template?.steps.length) {
      throw new Error("Active workflow template required");
    }
    const workflowMarker = "new-class workflow must not leak";
    const homeworkMarker = "new-class homework must not leak";

    await prisma.$transaction(async (tx) => {
      const session = await tx.workflowSession.upsert({
        where: {
          classId_date: { classId: student.classId, date: serviceDate },
        },
        create: {
          classId: student.classId,
          teacherId: actorId,
          templateId: template.id,
          date: serviceDate,
          steps: {
            create: template.steps.map((step) => ({
              stepKey: step.stepKey,
              name: step.name,
              timeRange: step.timeRange,
              sortOrder: step.sortOrder,
              requirePhoto: step.requirePhoto,
            })),
          },
        },
        update: {},
        include: { steps: { orderBy: { sortOrder: "asc" } } },
      });
      if (!session.steps[0]) throw new Error("Workflow step required");
      await tx.studentWorkflowStep.create({
        data: {
          workflowStepId: session.steps[0].id,
          studentId: student.id,
          status: StudentWorkflowStepStatus.completed,
          completedAt: happenedAt,
          teacherId: actorId,
          remark: workflowMarker,
        },
      });
      await tx.homeworkAssignment.create({
        data: {
          classId: student.classId,
          teacherId: actorId,
          title: homeworkMarker,
          subject: "general",
          content: "transferred class isolation verification",
          dueAt: happenedAt,
          createdAt: happenedAt,
          submissions: {
            create: {
              studentId: student.id,
              status: HomeworkStatus.reviewed,
              submittedAt: happenedAt,
              reviewedAt: happenedAt,
              remark: homeworkMarker,
            },
          },
        },
      });
    });
    process.stdout.write(
      JSON.stringify({
        date: serviceDate.toISOString().slice(0, 10),
        workflowMarker,
        homeworkMarker,
      }),
    );
    return;
  }

  if (command === "create-absence") {
    if (!actorId) throw new Error("teacherId is required");
    const event = await prisma.attendanceEvent.create({
      data: {
        studentId: student.id,
        teacherId: actorId,
        type: AttendanceType.absence,
        happenedAt: new Date(),
        remark: "家庭请假（CP-36 verification）",
      },
      select: { id: true },
    });
    process.stdout.write(event.id);
    return;
  }

  if (command === "create-attendance-fallback") {
    if (!actorId) throw new Error("teacherId is required");
    const now = Date.now();
    await prisma.attendanceEvent.createMany({
      data: [
        {
          studentId: student.id,
          teacherId: actorId,
          type: AttendanceType.arrive,
          happenedAt: new Date(now - 30 * 60 * 1000),
          remark: "legacy arrival fallback",
        },
        {
          studentId: student.id,
          teacherId: actorId,
          type: AttendanceType.leave,
          happenedAt: new Date(now - 10 * 60 * 1000),
          remark: "legacy leave fallback",
        },
      ],
    });
    process.stdout.write(student.id);
    return;
  }

  if (command === "snapshot") {
    const [growth, pickup, care, workflow, notes, audit] = await Promise.all([
      prisma.growthRecord.count({ where: { studentId: student.id } }),
      prisma.pickupRecord.count({ where: { studentId: student.id } }),
      prisma.studentCareRecord.count({ where: { studentId: student.id } }),
      prisma.studentWorkflowStep.findMany({
        where: { studentId: student.id },
        orderBy: { workflowStepId: "asc" },
        select: { id: true, status: true, completedAt: true, remark: true },
      }),
      prisma.studentDailyReportNote.count({ where: { studentId: student.id } }),
      prisma.auditLog.count(),
    ]);
    process.stdout.write(
      JSON.stringify({ growth, pickup, care, workflow, notes, audit }),
    );
    return;
  }

  if (command === "create-history") {
    if (!actorId) throw new Error("teacherId is required");
    const serviceDate = chinaBusinessDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    const happenedAt = new Date(serviceDate.getTime() + 9 * 60 * 60 * 1000);
    const template = await prisma.workflowTemplate.findFirst({
      where: { isActive: true },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template?.steps.length)
      throw new Error("Active workflow template required");

    await prisma.$transaction(async (tx) => {
      for (const [index, type] of [
        PickupEventType.picked_up_from_school,
        PickupEventType.arrived_at_center,
        PickupEventType.left_center,
      ].entries()) {
        await tx.pickupRecord.create({
          data: {
            studentId: student.id,
            campusId: student.class.campusId,
            classId: student.classId,
            serviceDate,
            type,
            happenedAt: new Date(happenedAt.getTime() + index * 30 * 60 * 1000),
            teacherId: actorId,
            createdById: actorId,
            arrivalMethod:
              type === PickupEventType.arrived_at_center
                ? PickupArrivalMethod.teacher_pickup
                : null,
            pickupPersonNameSnapshot:
              type === PickupEventType.left_center
                ? "historical pickup snapshot"
                : null,
            relationshipSnapshot:
              type === PickupEventType.left_center ? "father" : null,
            phoneSnapshot:
              type === PickupEventType.left_center ? "13800009999" : null,
            status: PickupHandoffStatus.normal,
          },
        });
      }
      await tx.studentCareRecord.create({
        data: {
          studentId: student.id,
          teacherId: actorId,
          type: StudentCareRecordType.mood,
          value: "good",
          happenedAt,
          serviceDate,
          remark: "historical daily mood",
        },
      });
      const session = await tx.workflowSession.create({
        data: {
          classId: student.classId,
          teacherId: actorId,
          templateId: template.id,
          date: serviceDate,
          steps: {
            create: template.steps.map((step) => ({
              stepKey: step.stepKey,
              name: step.name,
              timeRange: step.timeRange,
              sortOrder: step.sortOrder,
              requirePhoto: step.requirePhoto,
            })),
          },
        },
        include: { steps: { orderBy: { sortOrder: "asc" } } },
      });
      await tx.studentWorkflowStep.create({
        data: {
          workflowStepId: session.steps[0].id,
          studentId: student.id,
          status: StudentWorkflowStepStatus.completed,
          completedAt: happenedAt,
          teacherId: actorId,
          remark: "historical daily workflow",
        },
      });
      await tx.homeworkAssignment.create({
        data: {
          classId: student.classId,
          teacherId: actorId,
          title: "historical daily homework",
          subject: "general",
          content: "historical daily report verification",
          dueAt: happenedAt,
          createdAt: happenedAt,
          submissions: {
            create: {
              studentId: student.id,
              status: HomeworkStatus.reviewed,
              submittedAt: happenedAt,
              reviewedAt: happenedAt,
              remark: "historical daily reviewed",
            },
          },
        },
      });
      await tx.growthRecord.create({
        data: {
          studentId: student.id,
          teacherId: actorId,
          type: GrowthRecordType.teacher_feedback,
          title: "historical daily growth",
          content: "仅属于上一业务日",
          visibleToParent: true,
          happenedAt,
        },
      });
    });
    process.stdout.write(serviceDate.toISOString().slice(0, 10));
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

function chinaBusinessDate(instant = new Date()) {
  const local = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

function assertVerificationName(name?: string) {
  if (!name?.startsWith("verify-daily-report-")) {
    throw new Error("Refusing to mutate non-verification daily report data");
  }
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
