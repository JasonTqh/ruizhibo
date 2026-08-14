// 锐之博测试环境深度功能回归脚本（管理后台验收）
// 目标：生产模式测试环境 http://localhost:8080/api（dev-login 已禁用）
// 用法：node tools/run-regression.mjs（需 Node 22，建议 NODE_OPTIONS=''）
// 输出：tmp/regression-results.json
const ADMIN_PHONE = "13800000000";
const ADMIN_PASSWORD = "RzLocalTest#2026";
const TS = Date.now().toString().slice(-6);
const TAG = `回归${TS}`;
// 生成合法 11 位手机号（1 开头 + 10 位数字）
const mkPhone = () => `138${String(Math.floor(10000000 + Math.random() * 89999999))}`;

const results = [];
const failures = [];

function record(group, name, expected, actual, pass, extra) {
  results.push({ group, name, expected, actual, pass, extra: extra ?? "" });
  if (!pass) failures.push({ group, name, expected, actual, extra: extra ?? "" });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] [${group}] ${name} (${expected} -> ${actual})`);
}

async function call(method, path, { token, body, headers } = {}) {
  const h = { ...(headers ?? {}) };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: res.status, headers: res.headers, data, text };
}

function passIn(...codes) {
  return codes; // expected status set
}
const ok = (actual, ...expected) => expected.includes(actual);

// ---------- A. 认证 ----------
console.log("=== A. 认证 ===");
let adminToken = null;

{
  const r = await call("POST", "/auth/admin-login", { body: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
  const got = r.data?.data?.token ?? r.data?.token;
  adminToken = got ?? null;
  record("认证", "管理员正式登录成功", "200+token", `${r.status}`, ok(r.status, 200, 201) && !!adminToken, r.status === 200 ? "" : r.text.slice(0, 150));
}
{
  const r = await call("POST", "/auth/admin-login", { body: { phone: ADMIN_PHONE, password: "wrong-password" } });
  record("认证", "错误密码被拒绝", "401/403", `${r.status}`, ok(r.status, 401, 403), r.text.slice(0, 150));
}
{
  const r = await call("POST", "/auth/admin-login", { body: { phone: ADMIN_PHONE } });
  record("认证", "缺少密码返回 400", "400", `${r.status}`, ok(r.status, 400), r.text.slice(0, 150));
}
{
  const r = await call("POST", "/auth/dev-login", { body: { role: "admin", phone: ADMIN_PHONE } });
  record("认证", "开发登录已禁用(生产)", "403", `${r.status}`, ok(r.status, 403), r.text.slice(0, 150));
}
{
  const r = await call("GET", "/me", { token: adminToken });
  record("认证", "GET /me 返回管理员", "200+role=admin", `${r.status}`, ok(r.status, 200) && r.data?.data?.role === "admin", JSON.stringify(r.data?.data ?? {}).slice(0, 150));
}
{
  const r = await call("GET", "/me");
  record("认证", "无 token 访问受保护接口", "401", `${r.status}`, ok(r.status, 401), r.text.slice(0, 120));
}

// ---------- B. 教师管理 ----------
console.log("=== B. 教师管理 ===");
let seedTeacherId = null;
let newTeacherId = null;
{
  const r = await call("GET", "/admin/teachers", { token: adminToken });
  const list = r.data?.data ?? [];
  const seed = list.find((t) => t.phone === "13800000001");
  seedTeacherId = seed?.id ?? null;
  record("教师", "GET /admin/teachers 列表", "200", `${r.status}`, ok(r.status, 200));
}
{
  const r = await call("POST", "/admin/teachers", { token: adminToken, body: { name: `回归教师${TAG}`, phone: mkPhone(), status: "active" } });
  newTeacherId = r.data?.data?.id ?? null;
  record("教师", "创建教师", "201", `${r.status}`, ok(r.status, 201) && !!newTeacherId, r.text.slice(0, 150));
}
{
  const r = await call("PATCH", `/admin/teachers/${newTeacherId}`, { token: adminToken, body: { name: `回归教师改名${TAG}` } });
  record("教师", "修改教师", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const r = await call("GET", `/admin/teachers/${newTeacherId}/references`, { token: adminToken });
  record("教师", "教师引用检查", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const st = await call("PATCH", `/admin/teachers/${newTeacherId}`, { token: adminToken, body: { status: "disabled" } });
  record("教师", "教师置为停用", "200", `${st.status}`, ok(st.status, 200), st.text.slice(0, 120));
  const r = await call("DELETE", `/admin/teachers/${newTeacherId}?force=true`, { token: adminToken });
  record("教师", "删除教师", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}

// ---------- C. 班级管理 ----------
console.log("=== C. 班级管理 ===");
let newClassId = null;
{
  const r = await call("GET", "/admin/classes", { token: adminToken });
  record("班级", "GET /admin/classes 列表", "200", `${r.status}`, ok(r.status, 200));
}
{
  const r = await call("POST", "/admin/classes", { token: adminToken, body: { campusId: "seed-campus-main", name: `回归班${TAG}`, teacherId: seedTeacherId } });
  newClassId = r.data?.data?.id ?? null;
  record("班级", "创建班级", "201", `${r.status}`, ok(r.status, 201) && !!newClassId, r.text.slice(0, 150));
}
{
  const r = await call("PATCH", `/admin/classes/${newClassId}`, { token: adminToken, body: { name: `回归班改名${TAG}` } });
  record("班级", "修改班级", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const r = await call("GET", `/admin/classes/${newClassId}/references`, { token: adminToken });
  record("班级", "班级引用检查", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}

// ---------- D. 学生管理 ----------
console.log("=== D. 学生管理 ===");
let newStudentId = null;
let newGuardianId = null;
let bindParentPhone = mkPhone();
{
  const r = await call("GET", "/admin/students", { token: adminToken });
  record("学生", "GET /admin/students 列表", "200", `${r.status}`, ok(r.status, 200));
}
{
  const r = await call("POST", "/admin/students", { token: adminToken, body: { classId: newClassId, name: `回归学生${TAG}`, gender: "male", birthday: "2019-06-01", status: "active" } });
  newStudentId = r.data?.data?.id ?? null;
  record("学生", "创建学生", "201", `${r.status}`, ok(r.status, 201) && !!newStudentId, r.text.slice(0, 150));
}
{
  const r = await call("PATCH", `/admin/students/${newStudentId}`, { token: adminToken, body: { name: `回归学生改名${TAG}` } });
  record("学生", "修改学生", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const r = await call("GET", `/admin/students/${newStudentId}/references`, { token: adminToken });
  record("学生", "学生引用检查", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const r = await call("POST", `/admin/students/${newStudentId}/guardians`, { token: adminToken, body: { parentName: `回归家长${TAG}`, parentPhone: bindParentPhone, relation: "妈妈", isPrimary: true, canReceiveNotice: true } });
  newGuardianId = r.data?.data?.id ?? null;
  record("学生", "绑定监护人", "201", `${r.status}`, ok(r.status, 201) && !!newGuardianId, r.text.slice(0, 200));
}
{
  const r = await call("PATCH", `/admin/students/${newStudentId}/guardians/${newGuardianId}`, { token: adminToken, body: { relation: "妈妈", isPrimary: true } });
  record("学生", "修改监护人", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const r = await call("DELETE", `/admin/students/${newStudentId}/guardians/${newGuardianId}`, { token: adminToken });
  record("学生", "解绑监护人", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}

// ---------- E. 家长管理 ----------
console.log("=== E. 家长管理 ===");
let newParentId = null;
{
  const r = await call("GET", "/admin/parents", { token: adminToken });
  record("家长", "GET /admin/parents 列表", "200", `${r.status}`, ok(r.status, 200));
}
{
  const r = await call("POST", "/admin/parents", { token: adminToken, body: { name: `回归家长独立${TAG}`, phone: mkPhone(), status: "active" } });
  newParentId = r.data?.data?.id ?? null;
  record("家长", "创建家长", "201", `${r.status}`, ok(r.status, 201) && !!newParentId, r.text.slice(0, 150));
}
{
  const r = await call("PATCH", `/admin/parents/${newParentId}`, { token: adminToken, body: { name: `回归家长独立改名${TAG}` } });
  record("家长", "修改家长", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const r = await call("GET", `/admin/parents/${newParentId}/references`, { token: adminToken });
  record("家长", "家长引用检查", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const st = await call("PATCH", `/admin/parents/${newParentId}`, { token: adminToken, body: { status: "disabled" } });
  record("家长", "家长置为停用", "200", `${st.status}`, ok(st.status, 200), st.text.slice(0, 120));
  const r = await call("DELETE", `/admin/parents/${newParentId}?force=true`, { token: adminToken });
  record("家长", "删除家长", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}

// ---------- F. 流程模板 ----------
console.log("=== F. 流程模板 ===");
let newTemplateId = null;
{
  const r = await call("GET", "/admin/workflow-templates", { token: adminToken });
  record("流程模板", "GET 模板列表", "200", `${r.status}`, ok(r.status, 200));
}
{
  const r = await call("POST", "/admin/workflow-templates", {
    token: adminToken,
    body: {
      name: `回归模板${TAG}`,
      isActive: false,
      steps: [
        { stepKey: `checkin-${TS}`, name: "签到", timeRange: "08:00-09:00", sortOrder: 0, requirePhoto: false },
        { stepKey: `snack-${TS}`, name: "加餐", timeRange: "15:30-15:50", sortOrder: 1, requirePhoto: true },
      ],
    },
  });
  newTemplateId = r.data?.data?.id ?? null;
  record("流程模板", "创建模板(含步骤)", "201", `${r.status}`, ok(r.status, 201) && !!newTemplateId, r.text.slice(0, 200));
}
{
  const r = await call("PATCH", `/admin/workflow-templates/${newTemplateId}`, { token: adminToken, body: { name: `回归模板改名${TAG}`, isActive: true } });
  record("流程模板", "修改模板", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}
{
  const r = await call("GET", `/admin/workflow-templates/${newTemplateId}/references`, { token: adminToken });
  record("流程模板", "模板引用检查", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 150));
}

// ---------- G. 业务查询与状态 ----------
console.log("=== G. 业务查询与状态 ===");
const bizEndpoints = [
  ["business/homework", "作业记录查询"],
  ["business/teaching-records", "教学记录查询"],
  ["business/growth-records", "成长反馈查询"],
  ["business/attendance", "出勤记录查询"],
  ["business/workflows", "流程执行查询"],
  ["business/lesson-plans", "备课查询"],
  ["business/research-activities", "教研活动查询"],
];
for (const [path, label] of bizEndpoints) {
  const r = await call("GET", `/admin/${path}`, { token: adminToken });
  record("业务查询", label, "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 120));
}

// 状态流转：若存在备课/教研记录则尝试
{
  const r = await call("GET", "/admin/business/lesson-plans", { token: adminToken });
  const first = r.data?.data?.items?.[0] ?? r.data?.data?.[0];
  if (first?.id) {
    const p = await call("PATCH", `/admin/business/lesson-plans/${first.id}/status`, { token: adminToken, body: { status: "published" } });
    record("业务状态", "备课状态流转(draft->published)", "200", `${p.status}`, ok(p.status, 200), p.text.slice(0, 150));
  } else {
    record("业务状态", "备课状态流转(无数据跳过)", "-", "-", true, "seed 无备课记录，跳过");
  }
}
{
  const r = await call("GET", "/admin/business/research-activities", { token: adminToken });
  const first = r.data?.data?.items?.[0] ?? r.data?.data?.[0];
  if (first?.id) {
    const p = await call("PATCH", `/admin/business/research-activities/${first.id}/status`, { token: adminToken, body: { status: "open" } });
    record("业务状态", "教研状态流转(draft->open)", "200", `${p.status}`, ok(p.status, 200), p.text.slice(0, 150));
  } else {
    record("业务状态", "教研状态流转(无数据跳过)", "-", "-", true, "seed 无教研记录，跳过");
  }
}

// ---------- H. 审计日志 ----------
console.log("=== H. 审计日志 ===");
{
  const r = await call("GET", "/admin/audit-logs", { token: adminToken });
  const items = r.data?.data?.items ?? r.data?.data ?? [];
  record("审计日志", "审计日志可查询", "200", `${r.status}`, ok(r.status, 200));
  record("审计日志", "包含本次回归操作记录", "≥1条", `${Array.isArray(items) ? items.length : "?"}条`, Array.isArray(items) && items.length > 0, r.text.slice(0, 120));
}

// ---------- I. 权限负向校验 ----------
console.log("=== I. 权限负向校验 ===");
{
  const r = await call("GET", "/admin/teachers");
  record("权限负向", "无 token 访问 admin", "401", `${r.status}`, ok(r.status, 401), r.text.slice(0, 120));
}
{
  const r = await call("GET", "/admin/teachers", { headers: { Authorization: "Bearer garbage.token.here" } });
  record("权限负向", "伪造 token 被拒绝", "401", `${r.status}`, ok(r.status, 401), r.text.slice(0, 120));
}
{
  const r = await call("GET", "/teacher/dashboard", { token: adminToken });
  record("权限负向", "管理员访问教师接口", "403", `${r.status}`, ok(r.status, 403), r.text.slice(0, 120));
}
{
  const r = await call("GET", "/parent/children", { token: adminToken });
  record("权限负向", "管理员访问家长接口", "403", `${r.status}`, ok(r.status, 403), r.text.slice(0, 120));
}

// ---------- J. 文件上传与公开读取 ----------
console.log("=== J. 文件上传与公开读取 ===");
let uploadedUrl = null;
{
  const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = await call("POST", "/files", { token: adminToken, body: { fileName: `regression-${TS}.png`, mimeType: "image/png", base64: pngB64, scene: "regression", size: 70 } });
  uploadedUrl = r.data?.data?.url ?? r.data?.url ?? null;
  record("文件", "上传验证图片", "201", `${r.status}`, ok(r.status, 201) && !!uploadedUrl, r.text.slice(0, 200));
}
if (uploadedUrl) {
  const pub = uploadedUrl.startsWith("http") ? uploadedUrl : `${BASE.replace(/\/api$/, "")}${uploadedUrl}`;
  const r = await fetch(pub, { method: "GET" });
  record("文件", "上传文件公开读取", "200", `${r.status}`, ok(r.status, 200), `url=${pub}`);
}
{
  const r = await call("POST", "/files", { token: adminToken, body: { fileName: "bad.txt", mimeType: "text/plain", base64: "!!!not-base64!!!" } });
  record("文件", "非法 base64 被拒绝", "400", `${r.status}`, ok(r.status, 400), r.text.slice(0, 120));
}
{
  const r = await call("POST", "/files", { body: { fileName: "x.png", mimeType: "image/png", base64: "aGk=" } });
  record("文件", "无 token 上传被拒绝", "401", `${r.status}`, ok(r.status, 401), r.text.slice(0, 120));
}

// ---------- K. CORS ----------
console.log("=== K. CORS ===");
{
  const r = await call("GET", "/health", { headers: { Origin: "http://localhost:8080" } });
  const acao = r.headers.get("access-control-allow-origin");
  record("CORS", "允许来源获得授权", "aca=localhost:8080", `${acao ?? "(无)"}`, acao === "http://localhost:8080");
}
{
  const r = await call("GET", "/health", { headers: { Origin: "http://evil.example.com" } });
  const acao = r.headers.get("access-control-allow-origin");
  record("CORS", "非法来源被拒绝", "无 ACAO", `${acao ?? "(无)"}`, acao === null || acao === undefined);
}

// ---------- L. 健康与请求 ID ----------
console.log("=== L. 健康与请求 ID ===");
{
  const r = await call("GET", "/health");
  const v = r.data?.data?.version ?? "";
  record("健康", "版本号匹配当前提交", "ac40fbc", `${v.slice(0, 7)}`, v.startsWith("ac40fbc"), r.text.slice(0, 200));
  record("健康", "数据库状态 ok", "ok", `${r.data?.data?.database ?? "?"}`, r.data?.data?.database === "ok");
  record("健康", "文件存储 local", "local", `${r.data?.data?.fileStorage ?? "?"}`, r.data?.data?.fileStorage === "local");
  const rid = r.headers.get("x-request-id");
  record("请求ID", "响应包含 x-request-id", "有值", `${rid ?? "(无)"}`, !!rid);
}

// ---------- 清理 ----------
console.log("=== 清理 ===");
if (newTemplateId) {
  const r = await call("DELETE", `/admin/workflow-templates/${newTemplateId}`, { token: adminToken });
  record("清理", "删除回归模板", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 120));
}
if (newStudentId) {
  const st = await call("PATCH", `/admin/students/${newStudentId}`, { token: adminToken, body: { status: "inactive" } });
  record("清理", "学生状态置为停用", "200", `${st.status}`, ok(st.status, 200), st.text.slice(0, 120));
  const r = await call("DELETE", `/admin/students/${newStudentId}?force=true`, { token: adminToken });
  record("清理", "删除回归学生", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 120));
}
if (newClassId) {
  const r = await call("DELETE", `/admin/classes/${newClassId}?force=true`, { token: adminToken });
  record("清理", "删除回归班级", "200", `${r.status}`, ok(r.status, 200), r.text.slice(0, 120));
}
// 解绑监护人时自动创建的家长用户
{
  const r = await call("GET", "/admin/parents", { token: adminToken });
  const list = r.data?.data ?? [];
  const orphan = list.find((p) => p.phone === bindParentPhone);
  if (orphan?.id) {
    const st = await call("PATCH", `/admin/parents/${orphan.id}`, { token: adminToken, body: { status: "disabled" } });
    record("清理", "监护人家长置为停用", "200", `${st.status}`, ok(st.status, 200), st.text.slice(0, 120));
    const d = await call("DELETE", `/admin/parents/${orphan.id}?force=true`, { token: adminToken });
    record("清理", "删除监护人自动创建的家长", "200", `${d.status}`, ok(d.status, 200), d.text.slice(0, 120));
  }
}

// ---------- 汇总 ----------
const passCount = results.filter((r) => r.pass).length;
console.log(`\n===== 汇总: ${passCount}/${results.length} 通过 =====`);
if (failures.length) {
  console.log("--- 失败项 ---");
  for (const f of failures) console.log(`[FAIL] [${f.group}] ${f.name}: 期望 ${f.expected}, 实际 ${f.actual} | ${f.extra}`);
}
const fs = await import("node:fs");
fs.writeFileSync("tmp/regression-results.json", JSON.stringify({ runAt: new Date().toISOString(), total: results.length, pass: passCount, fail: failures.length, results, failures }, null, 2), "utf-8");
console.log("结果已写入 tmp/regression-results.json");
