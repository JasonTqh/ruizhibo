import { readFileSync } from "node:fs";

loadLocalEnvironment();
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const baseUrl = (process.env.VERIFY_API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const phone = process.env.VERIFY_TEACHER_PHONE ?? "13800000001";
let originalFlag;
let campusId;

try {
  const teacher = await prisma.user.findFirst({
    where: { phone, role: "teacher" },
    select: {
      id: true,
      trainingAssignments: {
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: { campusId: true },
      },
    },
  });
  if (!teacher?.trainingAssignments[0]) {
    throw new Error("Teacher training assignment fixture is required");
  }
  campusId = teacher.trainingAssignments[0].campusId;
  originalFlag = await prisma.trainingFeatureFlag.findUnique({ where: { campusId } });
  const beforeCounts = await historyCounts(teacher.id);
  await prisma.trainingFeatureFlag.upsert({
    where: { campusId },
    update: { enabled: false, reason: "自动化关闭回滚验证" },
    create: { campusId, enabled: false, reason: "自动化关闭回滚验证" },
  });

  const login = await api("/auth/dev-login", {
    method: "POST",
    body: { role: "teacher", phone },
    expected: 201,
  });
  const token = login.data.token;
  const disabledHome = await api("/teacher/training/home", { token });
  assert(disabledHome.data.enabled === false, "Disabled campus still exposed the academy entry");
  const blocked = await api("/teacher/training/current", { token, expected: 403 });
  assert(blocked.error?.code === "FORBIDDEN", "Disabled campus did not block training reads");
  assertCounts(beforeCounts, await historyCounts(teacher.id), "closing the feature flag");

  await prisma.trainingFeatureFlag.update({
    where: { campusId },
    data: {
      enabled: true,
      reason: originalFlag?.reason ?? "自动化重新启用验证",
      updatedById: originalFlag?.updatedById ?? null,
    },
  });
  const enabledHome = await api("/teacher/training/home", { token });
  assert(enabledHome.data.enabled === true, "Re-enabled campus did not restore the academy entry");
  assertCounts(beforeCounts, await historyCounts(teacher.id), "re-enabling the feature flag");
  process.stdout.write("Training feature-flag rollback verification passed.\n");
} finally {
  if (campusId) {
    if (originalFlag) {
      await prisma.trainingFeatureFlag.update({
        where: { campusId },
        data: {
          enabled: originalFlag.enabled,
          reason: originalFlag.reason,
          updatedById: originalFlag.updatedById,
        },
      }).catch(() => undefined);
    } else {
      await prisma.trainingFeatureFlag.deleteMany({ where: { campusId } });
    }
  }
  await prisma.$disconnect();
}

async function historyCounts(teacherId) {
  const [assignments, attempts, progress, audits] = await Promise.all([
    prisma.trainingAssignment.count({ where: { teacherId } }),
    prisma.trainingCourseAttempt.count({
      where: { assignmentCourse: { assignment: { teacherId } } },
    }),
    prisma.trainingChapterProgress.count({
      where: {
        courseAttempt: { assignmentCourse: { assignment: { teacherId } } },
      },
    }),
    prisma.trainingAuditRecord.count({
      where: { assignment: { teacherId } },
    }),
  ]);
  return { assignments, attempts, progress, audits };
}

function assertCounts(expected, actual, action) {
  assert(
    JSON.stringify(expected) === JSON.stringify(actual),
    `Training data changed while ${action}: ${JSON.stringify({ expected, actual })}`,
  );
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json();
  const expected = options.expected ?? 200;
  if (response.status !== expected) {
    throw new Error(`${path} expected ${expected}, received ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadLocalEnvironment() {
  if (process.env.DATABASE_URL) return;
  const file = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    process.env[name] ??= value;
  }
}
