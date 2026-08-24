import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";

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
const apply = process.argv.includes("--apply");
const verificationPrefix = "verify-";
const protectedIds = new Set([
  "acceptance-campus-a",
  "acceptance-class-grade-1",
  "acceptance-class-history-b",
  "acceptance-workflow-template",
  ...Array.from(
    { length: 20 },
    (_, index) => `acceptance-student-${String(index + 1).padStart(2, "0")}`,
  ),
]);
const protectedPhones = new Set(["13800000000", "13800000001", "13800000002"]);

async function main() {
  const campuses = await prisma.campus.findMany({
    where: { name: { startsWith: verificationPrefix } },
    select: { id: true, name: true },
  });
  const campusIds = campuses.map((item) => item.id);

  const users = await prisma.user.findMany({
    where: { name: { startsWith: verificationPrefix } },
    select: { id: true, name: true, phone: true, role: true, status: true },
  });
  const userIds = users.map((item) => item.id);

  const classes = await prisma.class.findMany({
    where: {
      OR: [
        { name: { startsWith: verificationPrefix } },
        ...(campusIds.length > 0 ? [{ campusId: { in: campusIds } }] : []),
      ],
    },
    select: { id: true, name: true },
  });
  const classIds = classes.map((item) => item.id);

  const students = await prisma.student.findMany({
    where: {
      OR: [
        { name: { startsWith: verificationPrefix } },
        ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
      ],
    },
    select: { id: true, name: true, status: true },
  });
  const studentIds = students.map((item) => item.id);

  const templates = await prisma.workflowTemplate.findMany({
    where: { name: { startsWith: verificationPrefix } },
    select: { id: true, name: true },
  });
  const templateIds = templates.map((item) => item.id);

  assertTargetsAreDisposable({
    campuses,
    users,
    classes,
    students,
    templates,
  });

  const summary = {
    campuses: campuses.length,
    users: users.length,
    classes: classes.length,
    students: students.length,
    workflowTemplates: templates.length,
  };

  if (!apply) {
    process.stdout.write(JSON.stringify({ mode: "dry-run", targets: summary }));
    return;
  }

  const localAssets = await prisma.fileAsset.findMany({
    where: {
      ownerId: userIds.length > 0 ? { in: userIds } : { in: [] },
      storageDriver: "local",
      storageKey: { not: null },
    },
    select: { id: true, storageKey: true },
  });

  const deleted = await prisma.$transaction(
    async (tx) => {
      const counts: Record<string, number> = {};
      const save = (name: string, count: number) => {
        counts[name] = (counts[name] ?? 0) + count;
      };
      const ids = <T extends { id: string }>(items: T[]) =>
        items.map((item) => item.id);

      const homework = await tx.homeworkAssignment.findMany({
        where: {
          OR: [
            ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
            ...(userIds.length > 0 ? [{ teacherId: { in: userIds } }] : []),
          ],
        },
        select: { id: true },
      });
      const homeworkIds = ids(homework);

      const notices = await tx.notice.findMany({
        where: {
          OR: [
            ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
            ...(userIds.length > 0 ? [{ teacherId: { in: userIds } }] : []),
          ],
        },
        select: { id: true },
      });
      const noticeIds = ids(notices);

      const conversations = await tx.conversation.findMany({
        where: {
          OR: [
            ...(studentIds.length > 0
              ? [{ studentId: { in: studentIds } }]
              : []),
            ...(userIds.length > 0
              ? [{ parentId: { in: userIds } }, { teacherId: { in: userIds } }]
              : []),
          ],
        },
        select: { id: true },
      });
      const conversationIds = ids(conversations);

      const activities = await tx.researchActivity.findMany({
        where: {
          OR: [
            ...(userIds.length > 0 ? [{ organizerId: { in: userIds } }] : []),
            ...(campusIds.length > 0 ? [{ campusId: { in: campusIds } }] : []),
          ],
        },
        select: { id: true },
      });
      const activityIds = ids(activities);

      const sessions = await tx.workflowSession.findMany({
        where: {
          OR: [
            ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
            ...(userIds.length > 0 ? [{ teacherId: { in: userIds } }] : []),
            ...(templateIds.length > 0
              ? [{ templateId: { in: templateIds } }]
              : []),
          ],
        },
        select: { id: true },
      });
      const sessionIds = ids(sessions);

      const workflowSteps = await tx.workflowStep.findMany({
        where: {
          OR: [
            ...(sessionIds.length > 0
              ? [{ sessionId: { in: sessionIds } }]
              : []),
            ...(userIds.length > 0 ? [{ teacherId: { in: userIds } }] : []),
          ],
        },
        select: { id: true },
      });
      const workflowStepIds = ids(workflowSteps);

      const pickups = await tx.pickupRecord.findMany({
        where: {
          OR: [
            ...(studentIds.length > 0
              ? [{ studentId: { in: studentIds } }]
              : []),
            ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
            ...(campusIds.length > 0 ? [{ campusId: { in: campusIds } }] : []),
            ...(userIds.length > 0
              ? [
                  { teacherId: { in: userIds } },
                  { createdById: { in: userIds } },
                ]
              : []),
          ],
        },
        select: { id: true, attendanceEventId: true },
      });
      const pickupIds = ids(pickups);
      const pickupAttendanceIds = pickups.flatMap((item) =>
        item.attendanceEventId ? [item.attendanceEventId] : [],
      );

      const auditTargetIds = [
        ...campusIds,
        ...userIds,
        ...classIds,
        ...studentIds,
        ...templateIds,
        ...homeworkIds,
        ...noticeIds,
        ...conversationIds,
        ...activityIds,
        ...sessionIds,
        ...workflowStepIds,
        ...pickupIds,
      ];

      if (conversationIds.length > 0 || userIds.length > 0) {
        save(
          "messages",
          (
            await tx.message.deleteMany({
              where: {
                OR: [
                  ...(conversationIds.length > 0
                    ? [{ conversationId: { in: conversationIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ senderId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }
      if (conversationIds.length > 0) {
        save(
          "conversations",
          (
            await tx.conversation.deleteMany({
              where: { id: { in: conversationIds } },
            })
          ).count,
        );
      }

      if (noticeIds.length > 0 || studentIds.length > 0 || userIds.length > 0) {
        save(
          "noticeReceipts",
          (
            await tx.noticeReceipt.deleteMany({
              where: {
                OR: [
                  ...(noticeIds.length > 0
                    ? [{ noticeId: { in: noticeIds } }]
                    : []),
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ parentId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }
      if (noticeIds.length > 0) {
        save(
          "notices",
          (await tx.notice.deleteMany({ where: { id: { in: noticeIds } } }))
            .count,
        );
      }

      if (homeworkIds.length > 0 || studentIds.length > 0) {
        save(
          "homeworkSubmissions",
          (
            await tx.homeworkSubmission.deleteMany({
              where: {
                OR: [
                  ...(homeworkIds.length > 0
                    ? [{ homeworkId: { in: homeworkIds } }]
                    : []),
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }
      if (homeworkIds.length > 0) {
        save(
          "homeworkAssignments",
          (
            await tx.homeworkAssignment.deleteMany({
              where: { id: { in: homeworkIds } },
            })
          ).count,
        );
      }

      if (activityIds.length > 0 || userIds.length > 0) {
        save(
          "researchParticipants",
          (
            await tx.researchParticipant.deleteMany({
              where: {
                OR: [
                  ...(activityIds.length > 0
                    ? [{ activityId: { in: activityIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }
      if (activityIds.length > 0) {
        save(
          "researchActivities",
          (
            await tx.researchActivity.deleteMany({
              where: { id: { in: activityIds } },
            })
          ).count,
        );
      }

      if (
        workflowStepIds.length > 0 ||
        studentIds.length > 0 ||
        userIds.length > 0
      ) {
        save(
          "studentWorkflowSteps",
          (
            await tx.studentWorkflowStep.deleteMany({
              where: {
                OR: [
                  ...(workflowStepIds.length > 0
                    ? [{ workflowStepId: { in: workflowStepIds } }]
                    : []),
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }
      if (workflowStepIds.length > 0) {
        save(
          "workflowSteps",
          (
            await tx.workflowStep.deleteMany({
              where: { id: { in: workflowStepIds } },
            })
          ).count,
        );
      }
      if (sessionIds.length > 0) {
        save(
          "workflowSessions",
          (
            await tx.workflowSession.deleteMany({
              where: { id: { in: sessionIds } },
            })
          ).count,
        );
      }

      if (pickupIds.length > 0) {
        save(
          "pickupRecords",
          (
            await tx.pickupRecord.deleteMany({
              where: { id: { in: pickupIds } },
            })
          ).count,
        );
      }
      if (studentIds.length > 0 || userIds.length > 0) {
        save(
          "attendanceEvents",
          (
            await tx.attendanceEvent.deleteMany({
              where: {
                OR: [
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                  ...(pickupAttendanceIds.length > 0
                    ? [{ id: { in: pickupAttendanceIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }

      if (studentIds.length > 0 || userIds.length > 0) {
        save(
          "careRecords",
          (
            await tx.studentCareRecord.deleteMany({
              where: {
                OR: [
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
        save(
          "dailyReportNotes",
          (
            await tx.studentDailyReportNote.deleteMany({
              where: {
                OR: [
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
        save(
          "growthRecords",
          (
            await tx.growthRecord.deleteMany({
              where: {
                OR: [
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }

      if (studentIds.length > 0) {
        save(
          "authorizedPickupPeople",
          (
            await tx.authorizedPickupPerson.deleteMany({
              where: { studentId: { in: studentIds } },
            })
          ).count,
        );
      }
      if (studentIds.length > 0 || userIds.length > 0) {
        save(
          "studentGuardians",
          (
            await tx.studentGuardian.deleteMany({
              where: {
                OR: [
                  ...(studentIds.length > 0
                    ? [{ studentId: { in: studentIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ parentId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }

      if (classIds.length > 0 || userIds.length > 0) {
        save(
          "teachingRecords",
          (
            await tx.teachingRecord.deleteMany({
              where: {
                OR: [
                  ...(classIds.length > 0
                    ? [{ classId: { in: classIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
        save(
          "lessonPlans",
          (
            await tx.lessonPlan.deleteMany({
              where: {
                OR: [
                  ...(classIds.length > 0
                    ? [{ classId: { in: classIds } }]
                    : []),
                  ...(userIds.length > 0
                    ? [{ teacherId: { in: userIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }

      if (userIds.length > 0) {
        save(
          "fileAssets",
          (
            await tx.fileAsset.deleteMany({
              where: { ownerId: { in: userIds } },
            })
          ).count,
        );
      }

      if (userIds.length > 0 || auditTargetIds.length > 0) {
        save(
          "auditLogs",
          (
            await tx.auditLog.deleteMany({
              where: {
                OR: [
                  ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
                  ...(auditTargetIds.length > 0
                    ? [{ targetId: { in: auditTargetIds } }]
                    : []),
                ],
              },
            })
          ).count,
        );
      }

      if (studentIds.length > 0) {
        save(
          "students",
          (
            await tx.student.deleteMany({
              where: { id: { in: studentIds } },
            })
          ).count,
        );
      }

      if (userIds.length > 0) {
        save(
          "detachedClassTeachers",
          (
            await tx.class.updateMany({
              where: {
                teacherId: { in: userIds },
                ...(classIds.length > 0 ? { id: { notIn: classIds } } : {}),
              },
              data: { teacherId: null },
            })
          ).count,
        );
      }
      if (classIds.length > 0) {
        save(
          "classes",
          (await tx.class.deleteMany({ where: { id: { in: classIds } } }))
            .count,
        );
      }

      if (templateIds.length > 0) {
        save(
          "workflowTemplateSteps",
          (
            await tx.workflowTemplateStep.deleteMany({
              where: { templateId: { in: templateIds } },
            })
          ).count,
        );
        save(
          "workflowTemplates",
          (
            await tx.workflowTemplate.deleteMany({
              where: { id: { in: templateIds } },
            })
          ).count,
        );
      }

      if (userIds.length > 0) {
        save(
          "users",
          (await tx.user.deleteMany({ where: { id: { in: userIds } } })).count,
        );
      }
      if (campusIds.length > 0) {
        save(
          "campuses",
          (await tx.campus.deleteMany({ where: { id: { in: campusIds } } }))
            .count,
        );
      }

      return counts;
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  const fileCleanup = await removeLocalAssets(localAssets);
  process.stdout.write(
    JSON.stringify({
      mode: "apply",
      targets: summary,
      deleted,
      localFiles: fileCleanup,
    }),
  );
}

function assertTargetsAreDisposable(targets: {
  campuses: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; phone: string | null }>;
  classes: Array<{ id: string; name: string }>;
  students: Array<{ id: string; name: string }>;
  templates: Array<{ id: string; name: string }>;
}) {
  const all = [
    ...targets.campuses,
    ...targets.users,
    ...targets.classes,
    ...targets.students,
    ...targets.templates,
  ];
  const protectedTarget = all.find((item) => protectedIds.has(item.id));
  if (protectedTarget) {
    throw new Error(
      `Refusing to delete protected acceptance record ${protectedTarget.id}`,
    );
  }

  const protectedUser = targets.users.find(
    (user) => user.phone && protectedPhones.has(user.phone),
  );
  if (protectedUser) {
    throw new Error(
      `Refusing to delete protected account ${protectedUser.phone}`,
    );
  }

  const unexpectedName = all.find(
    (item) => !item.name.startsWith(verificationPrefix),
  );
  if (unexpectedName) {
    throw new Error(
      `Refusing to delete non-verification record ${unexpectedName.id} (${unexpectedName.name})`,
    );
  }
}

async function removeLocalAssets(
  assets: Array<{ id: string; storageKey: string | null }>,
) {
  const uploadRoot = resolve(
    process.cwd(),
    process.env.LOCAL_UPLOAD_DIR?.trim() || "uploads",
  );
  let removed = 0;
  const errors: string[] = [];

  for (const asset of assets) {
    if (!asset.storageKey) continue;
    const target = resolve(uploadRoot, ...asset.storageKey.split("/"));
    const relativeTarget = relative(uploadRoot, target);
    if (
      !relativeTarget ||
      relativeTarget.startsWith("..") ||
      isAbsolute(relativeTarget)
    ) {
      errors.push(`${asset.id}: unsafe storage key`);
      continue;
    }
    try {
      await unlink(target);
      removed += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        errors.push(
          `${asset.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return { attempted: assets.length, removed, errors };
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
