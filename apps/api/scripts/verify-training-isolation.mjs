import { readFileSync } from "node:fs";

loadLocalEnvironment();
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const baseUrl = (process.env.VERIFY_API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const phone = `17${suffix.slice(-9)}`;
let campusId;
let adminId;

try {
  const target = await prisma.trainingAssignment.findFirst({
    orderBy: { assignedAt: "desc" },
    select: { id: true, campusId: true },
  });
  if (!target) throw new Error("No training assignment fixture is available");

  const campus = await prisma.campus.create({
    data: { name: `培训隔离验证-${suffix}` },
  });
  campusId = campus.id;
  const admin = await prisma.user.create({
    data: {
      role: "admin",
      name: `隔离验证管理员-${suffix}`,
      phone,
      status: "active",
    },
  });
  adminId = admin.id;
  await prisma.trainingPermissionGrant.create({
    data: {
      userId: admin.id,
      campusId: campus.id,
      scopeKey: campus.id,
      permission: "training_manage",
      isActive: true,
    },
  });
  await prisma.trainingFeatureFlag.create({
    data: {
      campusId: campus.id,
      enabled: true,
      reason: "自动化校区隔离验证临时数据",
    },
  });

  const login = await api("/auth/dev-login", {
    method: "POST",
    body: { role: "admin", phone },
    expected: 201,
  });
  const token = login.data.token;
  const capabilities = await api("/admin/training/capabilities", { token });
  assert(capabilities.data.trainingManage === true, "Scoped training capability was missing");
  assert(capabilities.data.courseManage === false, "Scoped administrator received headquarters course maintenance");
  assert(capabilities.data.permissionManage === false, "Scoped administrator received global permission management");
  assert(capabilities.data.practicalConfirm === false, "Training management implicitly granted practical confirmation");
  assert(capabilities.data.safetyConfirm === false, "Scoped administrator received safety confirmation implicitly");
  const subjects = await api("/admin/training/assignment-subjects", { token });
  assert(
    subjects.data.campuses.length === 1 && subjects.data.campuses[0].id === campus.id,
    "Assignment campus choices exceeded the authorized scope",
  );
  assert(subjects.data.teachers.length === 0, "Assignment choices exposed teachers from another campus");
  const list = await api("/admin/training/assignments?page=1&pageSize=20", { token });
  assert(list.data.total === 0, "Scoped administrator saw assignments from another campus");
  const stats = await api("/admin/training/assignments/stats", { token });
  assert(stats.data.participants === 0, "Scoped statistics included another campus");
  const detail = await api(`/admin/training/assignments/${target.id}`, {
    token,
    expected: 403,
  });
  assert(detail.error?.code === "FORBIDDEN", "Cross-campus assignment detail was not rejected");
  await api("/admin/training/courses", { token, expected: 403 });
  await api("/admin/training/permissions", { token, expected: 403 });
  await api("/admin/training/safety/pending", { token, expected: 403 });
  await api("/admin/training/practical/pending", { token, expected: 403 });
  await prisma.trainingPermissionGrant.create({
    data: {
      userId: admin.id,
      campusId: campus.id,
      scopeKey: campus.id,
      permission: "practical_confirm",
      isActive: true,
    },
  });
  const practicalCapabilities = await api("/admin/training/capabilities", { token });
  assert(
    practicalCapabilities.data.practicalConfirm === true,
    "Explicit practical permission was not reflected in capabilities",
  );
  await api("/admin/training/practical/pending", { token });
  const flags = await api("/admin/training/feature-flags", { token });
  assert(
    flags.data.length === 1 && flags.data[0].campus.id === campus.id,
    "Feature flags were not restricted to the authorized campus",
  );
  process.stdout.write("Training campus isolation verification passed.\n");
} finally {
  if (adminId) {
    await prisma.trainingPermissionGrant.deleteMany({ where: { userId: adminId } });
  }
  if (campusId) {
    await prisma.trainingFeatureFlag.deleteMany({ where: { campusId } });
  }
  if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
  if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
  await prisma.$disconnect();
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
    ) {
      value = value.slice(1, -1);
    }
    process.env[name] ??= value;
  }
}
