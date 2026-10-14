const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Prisma, PrismaClient } = require("@prisma/client");
const { ConfigService } = require("@nestjs/config");
const { Reflector } = require("@nestjs/core");
const { AdminService } = require("../dist/modules/admin/admin.service");
const { AuthService } = require("../dist/modules/auth/auth.service");
const { AuthGuard } = require("../dist/modules/auth/auth.guard");
const { RolesGuard } = require("../dist/modules/auth/roles.guard");
const { JwtService } = require("../dist/modules/auth/jwt.service");
const {
  AdminLoginThrottleService,
} = require("../dist/modules/auth/admin-login-throttle.service");
const { hashPassword } = require("../dist/modules/auth/password");
const { ROLES_KEY } = require("../dist/modules/auth/roles.decorator");
const {
  ApiExceptionFilter,
  userIdentityConflictMessage,
} = require("../dist/modules/common/api-exception.filter");

test("phone throttling is role scoped and IP throttling is retained", () => {
  const throttle = new AdminLoginThrottleService();
  for (let i = 0; i < 10; i++)
    throttle.recordFailure("13800000999", "test-ip", "teacher");
  assert.throws(() =>
    throttle.assertAllowed("13800000999", "test-ip", "teacher"),
  );
  assert.doesNotThrow(() => throttle.assertAllowed("13800000999", "test-ip"));
  throttle.recordSuccess("13800000999");
  assert.throws(() =>
    throttle.assertAllowed("13800000999", "test-ip", "teacher"),
  );
  for (let i = 0; i < 20; i++) throttle.recordFailure(String(i), "test-ip");
  assert.throws(() => throttle.assertAllowed("different-phone", "test-ip"));
});

test("concurrent identity duplicates produce a safe HTTP 409", () => {
  const error = new Prisma.PrismaClientKnownRequestError("database details", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["role", "phone"] },
  });
  assert.match(userIdentityConflictMessage(error), /当前身份/);
  const response = {
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  new ApiExceptionFilter().catch(error, {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: "test" }),
      getResponse: () => response,
    }),
  });
  assert.equal(response.code, 409);
  assert.equal(response.body.error.code, "CONFLICT");
  assert.doesNotMatch(JSON.stringify(response.body), /database details/);
  assert.equal(userIdentityConflictMessage(new Error("unknown")), undefined);
});

const url = process.env.ROLE_IDENTITY_TEST_DATABASE_URL;
test(
  "real PostgreSQL multi-identity creation login binding and isolation",
  { skip: !url },
  async (t) => {
    // Never inherit DATABASE_URL or connect to an existing project database.
    const parsed = new URL(url);
    assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname));
    assert.equal(parsed.pathname, "/role_identity_test");
    assert.equal(parsed.port, "55439");
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    t.after(() => prisma.$disconnect());
    const events = [];
    const audit = { log: async (event) => events.push(event) };
    const admin = new AdminService(
      prisma,
      audit,
      {},
      {
        handleTeacherAccountChange: async () => {},
      },
    );
    const jwt = new JwtService(
      new ConfigService({
        JWT_SECRET: "isolated-test-secret-not-for-deployment",
      }),
    );
    const auth = new AuthService(
      prisma,
      jwt,
      audit,
      new AdminLoginThrottleService(),
    );
    // Mock only the external WeChat transport; queries, hashes, JWTs and guards are real.
    auth.fetchWechatOpenid = async (code) => code;
    auth.fetchWechatPhone = async (code) => code;
    const phone = "13900000901";
    const password = "Admin-Test-Password-2026!";
    const adminUser = await prisma.user.create({
      data: {
        role: "admin",
        name: "兼任管理员",
        phone,
        passwordHash: await hashPassword(password),
      },
    });
    let teacher;
    let parent;

    await t.test(
      "legacy identities and relationships survive the migration",
      async () => {
        const legacy = await prisma.user.findUnique({
          where: { id: "role-test-legacy-admin" },
        });
        assert.equal(legacy.phone, "13900000801");
        assert.equal(legacy.passwordHash, "preserved-hash");
        const legacyTeacher = await prisma.user.findUnique({
          where: { id: "role-test-legacy-teacher" },
        });
        assert.equal(legacyTeacher.wechatOpenid, "legacy-teacher-openid");
        const klass = await prisma.class.findUnique({
          where: { id: "role-test-legacy-class" },
        });
        assert.equal(klass.teacherId, legacyTeacher.id);
      },
    );

    await t.test(
      "the same phone creates independent teacher and parent identities",
      async () => {
        teacher = (
          await admin.createTeacher(adminUser.id, {
            name: "兼任教师",
            phone,
            status: "active",
            assignTraining: false,
          })
        ).data;
        parent = (
          await admin.createParent(adminUser.id, { name: "兼任家长", phone })
        ).data;
        assert.equal(new Set([adminUser.id, teacher.id, parent.id]).size, 3);
        await assert.rejects(
          () =>
            admin.createTeacher(adminUser.id, {
              name: "重复教师",
              phone,
              status: "active",
              assignTraining: false,
            }),
          /已存在教师/,
        );
        await assert.rejects(
          () => admin.createParent(adminUser.id, { name: "重复家长", phone }),
          /已存在家长/,
        );
      },
    );

    await t.test(
      "admin and teacher web logins select their own password and role",
      async () => {
        await prisma.user.update({
          where: { id: teacher.id },
          data: {
            passwordHash: await hashPassword("Teacher-Test-Password-2026!"),
          },
        });
        const result = await auth.adminLogin({ phone, password }, "127.0.0.1");
        assert.equal(jwt.verify(result.data.token).sub, adminUser.id);
        await assert.rejects(
          () => auth.teacherWebLogin({ phone, password }, "127.0.0.1"),
          /手机号或密码错误/,
        );
        const web = await auth.teacherWebLogin(
          { phone, password: "Teacher-Test-Password-2026!" },
          "127.0.0.1",
        );
        assert.equal(jwt.verify(web.data.token).sub, teacher.id);
      },
    );

    await t.test(
      "same OpenID text in different miniapp roles binds independently",
      async () => {
        for (const role of ["teacher", "parent"]) {
          const result = await auth.wechatLogin({
            role,
            code: "same-openid-text",
          });
          assert.equal(result.data.status, "binding_required");
          const bound = await auth.bindPhone({
            role,
            bindingToken: result.data.bindingToken,
            phoneCode: phone,
          });
          const expected = role === "teacher" ? teacher : parent;
          assert.equal(jwt.verify(bound.data.token).sub, expected.id);
          assert.equal(jwt.verify(bound.data.token).role, role);
          assert.equal(
            (await auth.wechatLogin({ role, code: "same-openid-text" })).data
              .user.id,
            expected.id,
          );
        }
        await assert.rejects(
          () => auth.wechatLogin({ role: "admin", code: "x" }),
          /仅支持教师或家长/,
        );
        const bindingToken = jwt.signWechatBinding({
          role: "teacher",
          openid: "x",
        });
        await assert.rejects(
          () =>
            auth.bindPhone({ role: "parent", bindingToken, phoneCode: phone }),
          /角色不匹配/,
        );
        await assert.rejects(
          () =>
            auth.bindPhone({
              role: "teacher",
              bindingToken: jwt.signWechatBinding({
                role: "teacher",
                openid: "replacement",
              }),
              phoneCode: phone,
            }),
          /已绑定其他微信/,
        );
      },
    );

    await t.test(
      "a parent token cannot access teacher or administrator routes",
      async () => {
        const guard = new AuthGuard(jwt, prisma);
        const roles = new RolesGuard(new Reflector());
        const request = {
          headers: {
            authorization:
              "Bearer " + jwt.sign({ sub: parent.id, role: "parent" }),
          },
        };
        const handler = () => {};
        const context = {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => handler,
          getClass: () => AuthService,
        };
        await guard.canActivate(context);
        Reflect.defineMetadata(ROLES_KEY, ["teacher", "admin"], handler);
        assert.throws(() => roles.canActivate(context), /not allowed/);
        request.headers.authorization =
          "Bearer " + jwt.sign({ sub: parent.id, role: "admin" });
        await assert.rejects(() => guard.canActivate(context), /not allowed/);
      },
    );

    await t.test(
      "disabling one identity does not disable the others",
      async () => {
        await prisma.user.update({
          where: { id: teacher.id },
          data: { status: "disabled" },
        });
        await assert.rejects(
          () => auth.wechatLogin({ role: "teacher", code: "same-openid-text" }),
          /停用/,
        );
        assert.equal(
          (await auth.wechatLogin({ role: "parent", code: "same-openid-text" }))
            .data.user.id,
          parent.id,
        );
        assert.equal(
          (await auth.adminLogin({ phone, password }, "127.0.0.1")).data.user
            .id,
          adminUser.id,
        );
      },
    );

    await t.test(
      "guardian resolution creates a parent even when the phone belongs to an admin",
      async () => {
        const legacy = await prisma.user.findUnique({
          where: { id: "role-test-legacy-admin" },
        });
        const result = await admin.resolveGuardianParent({
          parentPhone: legacy.phone,
          parentName: "新家长",
          relation: "爸爸",
        });
        assert.equal(result.role, "parent");
        assert.notEqual(result.id, legacy.id);
        const reused = await admin.resolveGuardianParent({
          parentPhone: legacy.phone,
          parentName: "更新家长",
          relation: "爸爸",
        });
        assert.equal(reused.id, result.id);
        assert.equal(
          (await prisma.user.findUnique({ where: { id: legacy.id } })).name,
          legacy.name,
        );
      },
    );

    await t.test(
      "phone updates are scoped and same-role conflicts stay rejected",
      async () => {
        const other = (
          await admin.createParent(adminUser.id, {
            name: "其他家长",
            phone: "13900000902",
          })
        ).data;
        await assert.rejects(
          () => admin.updateParent(adminUser.id, other.id, { phone }),
          /已存在家长/,
        );
        await admin.updateParent(adminUser.id, other.id, {
          phone: "13900000802",
        }); // legacy teacher's phone
        assert.equal(
          (
            await prisma.user.findUnique({
              where: { id: "role-test-legacy-teacher" },
            })
          ).phone,
          "13900000802",
        );
      },
    );

    await t.test(
      "teacher edits reject same-role duplicates and preserve sibling accounts",
      async () => {
        const other = (
          await admin.createTeacher(adminUser.id, {
            name: "待编辑教师",
            phone: "13900000911",
            status: "active",
            assignTraining: false,
          })
        ).data;
        await assert.rejects(
          () => admin.updateTeacher(adminUser.id, other.id, { phone }),
          /已存在教师/,
        );
        await admin.updateTeacher(adminUser.id, other.id, {
          phone: "13900000801",
        });
        const legacy = await prisma.user.findUnique({
          where: { id: "role-test-legacy-admin" },
        });
        assert.equal(legacy.role, "admin");
        assert.equal(legacy.passwordHash, "preserved-hash");
        const siblingParent = await prisma.user.findUnique({
          where: { role_phone: { role: "parent", phone: legacy.phone } },
        });
        assert.equal(siblingParent.name, "更新家长");
      },
    );

    await t.test(
      "guardian binding by a shared phone resolves only the parent identity",
      async () => {
        const student = (
          await admin.createStudent(adminUser.id, {
            classId: "role-test-legacy-class",
            name: "绑定隔离学生",
            status: "active",
          })
        ).data;
        const binding = (
          await admin.bindGuardian(adminUser.id, student.id, {
            parentPhone: phone,
            parentName: "兼任家长",
            relation: "母亲",
          })
        ).data;
        assert.equal(binding.parentId, parent.id);
        assert.notEqual(binding.parentId, adminUser.id);
        assert.notEqual(binding.parentId, teacher.id);
        assert.equal(
          await prisma.user.count({ where: { role: "parent", phone } }),
          1,
        );
        assert.equal(
          (await prisma.user.findUnique({ where: { id: adminUser.id } })).name,
          "兼任管理员",
        );
      },
    );

    await t.test(
      "database uniqueness rejects concurrent duplicate identities",
      async () => {
        const results = await Promise.allSettled(
          [1, 2].map(() =>
            prisma.user.create({
              data: { role: "parent", phone: "13900000903", name: "并发" },
            }),
          ),
        );
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        assert.match(
          userIdentityConflictMessage(
            results.find((x) => x.status === "rejected").reason,
          ),
          /当前身份/,
        );
      },
    );

    await t.test(
      "concurrent different WeChat bindings cannot overwrite the winner",
      async () => {
        const racingPhone = "13900000904";
        const racer = (
          await admin.createParent(adminUser.id, {
            name: "并发绑定",
            phone: racingPhone,
          })
        ).data;
        const results = await Promise.allSettled(
          ["openid-a", "openid-b"].map((openid) =>
            auth.bindPhone({
              role: "parent",
              phoneCode: racingPhone,
              bindingToken: jwt.signWechatBinding({ role: "parent", openid }),
            }),
          ),
        );
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        assert.equal(results.filter((x) => x.status === "rejected").length, 1);
        const stored = await prisma.user.findUnique({
          where: { id: racer.id },
        });
        assert.ok(["openid-a", "openid-b"].includes(stored.wechatOpenid));
        const winner = results.find((x) => x.status === "fulfilled").value;
        const losingOpenid =
          stored.wechatOpenid === "openid-a" ? "openid-b" : "openid-a";
        assert.equal(jwt.verify(winner.data.token).sub, racer.id);
        await assert.rejects(
          () =>
            auth.bindPhone({
              role: "parent",
              phoneCode: racingPhone,
              bindingToken: jwt.signWechatBinding({
                role: "parent",
                openid: losingOpenid,
              }),
            }),
          /已绑定其他微信/,
        );
        assert.equal(
          (await prisma.user.findUnique({ where: { id: racer.id } }))
            .wechatOpenid,
          stored.wechatOpenid,
        );
      },
    );

    await t.test(
      "one OpenID cannot bind two accounts of the same role",
      async () => {
        const p1 = "13900000905",
          p2 = "13900000906";
        for (const number of [p1, p2])
          await admin.createParent(adminUser.id, {
            name: "绑定竞争",
            phone: number,
          });
        const bindingToken = jwt.signWechatBinding({
          role: "parent",
          openid: "shared-parent-openid",
        });
        const results = await Promise.allSettled(
          [p1, p2].map((phoneCode) =>
            auth.bindPhone({ role: "parent", phoneCode, bindingToken }),
          ),
        );
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        assert.equal(results.filter((x) => x.status === "rejected").length, 1);
        assert.equal(
          await prisma.user.count({
            where: { role: "parent", wechatOpenid: "shared-parent-openid" },
          }),
          1,
        );
      },
    );

    await t.test(
      "HTTP routes preserve role isolation, old-token revocation and concurrent conflicts",
      async () => {
        const { NestFactory } = require("@nestjs/core");
        const { ValidationPipe } = require("@nestjs/common");
        const {
          requestContextMiddleware,
        } = require("../dist/modules/common/request-context");
        const envKeys = [
          "DATABASE_URL",
          "JWT_SECRET",
          "ENABLE_DEV_LOGIN",
          "NODE_ENV",
        ];
        const previousEnv = Object.fromEntries(
          envKeys.map((key) => [key, process.env[key]]),
        );
        process.env.DATABASE_URL = url;
        process.env.JWT_SECRET = "isolated-test-secret-not-for-deployment";
        process.env.ENABLE_DEV_LOGIN = "true";
        process.env.NODE_ENV = "test";
        const { AppModule } = require("../dist/modules/app.module");
        const app = await NestFactory.create(AppModule, { logger: false });
        try {
          app.setGlobalPrefix("api");
          app.use(requestContextMiddleware);
          app.useGlobalFilters(new ApiExceptionFilter());
          app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
          );
          await app.listen(0, "127.0.0.1");
          const baseUrl = await app.getUrl();
          const api = async (method, path, body, token) => {
            const response = await fetch(`${baseUrl}/api${path}`, {
              method,
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            });
            return { status: response.status, body: await response.json() };
          };
          const login = await api("POST", "/auth/admin-login", {
            phone,
            password,
          });
          assert.equal(login.status, 201);
          assert.equal(login.body.data.user.id, adminUser.id);
          const adminToken = login.body.data.token;
          const parentToken = jwt.sign({ sub: parent.id, role: "parent" });
          const oldTeacherToken = jwt.sign({
            sub: teacher.id,
            role: "teacher",
          });
          assert.equal(
            (await api("GET", "/me", null, oldTeacherToken)).status,
            401,
          );
          assert.equal(
            (await api("GET", "/me", null, parentToken)).status,
            200,
          );
          assert.equal((await api("GET", "/me", null, adminToken)).status, 200);
          assert.equal(
            (await api("GET", "/admin/teachers", null, parentToken)).status,
            403,
          );
          assert.equal(
            (await api("GET", "/teacher/classes", null, parentToken)).status,
            403,
          );
          assert.equal(
            (
              await api(
                "GET",
                "/me",
                null,
                jwt.sign({ sub: parent.id, role: "admin" }),
              )
            ).status,
            401,
          );
          const concurrentPhone = "13900000915";
          const racing = await Promise.all(
            [1, 2].map(() =>
              api(
                "POST",
                "/admin/teachers",
                {
                  name: "HTTP并发教师",
                  phone: concurrentPhone,
                  status: "active",
                  assignTraining: false,
                },
                adminToken,
              ),
            ),
          );
          assert.deepEqual(
            racing.map((result) => result.status).sort(),
            [201, 409],
          );
          const conflict = racing.find((result) => result.status === 409);
          assert.equal(conflict.body.error.code, "CONFLICT");
          assert.match(conflict.body.error.message, /身份|教师/);
          assert.ok(conflict.body.error.requestId);
          assert.equal(
            await prisma.user.count({
              where: { role: "teacher", phone: concurrentPhone },
            }),
            1,
          );
          const newParent = await api(
            "POST",
            "/admin/parents",
            { name: "HTTP同号家长", phone: concurrentPhone },
            adminToken,
          );
          assert.equal(newParent.status, 201);
          const duplicateParent = await api(
            "POST",
            "/admin/parents",
            { name: "HTTP重复家长", phone: concurrentPhone },
            adminToken,
          );
          assert.equal(duplicateParent.status, 409);
        } finally {
          await app.close();
          for (const key of envKeys) {
            if (previousEnv[key] === undefined) delete process.env[key];
            else process.env[key] = previousEnv[key];
          }
        }
      },
    );

    await t.test(
      "deleting an unreferenced teacher preserves admin and parent identities",
      async () => {
        await admin.deleteTeacher(adminUser.id, teacher.id, false);
        assert.equal(
          await prisma.user.findUnique({ where: { id: teacher.id } }),
          null,
        );
        assert.ok(
          await prisma.user.findUnique({ where: { id: adminUser.id } }),
        );
        assert.ok(await prisma.user.findUnique({ where: { id: parent.id } }));
      },
    );

    await t.test(
      "disabling and deleting a parent identity preserves the admin and replacement teacher",
      async () => {
        const replacementTeacher = (
          await admin.createTeacher(adminUser.id, {
            name: "保留教师身份",
            phone,
            status: "active",
            assignTraining: false,
          })
        ).data;
        await admin.updateParent(adminUser.id, parent.id, {
          status: "disabled",
        });
        await assert.rejects(
          () => auth.wechatLogin({ role: "parent", code: "same-openid-text" }),
          /停用/,
        );
        assert.equal(
          (await auth.adminLogin({ phone, password }, "127.0.0.1")).data.user
            .id,
          adminUser.id,
        );
        const bindings = await prisma.studentGuardian.findMany({
          where: { parentId: parent.id },
        });
        await admin.deleteParent(adminUser.id, parent.id, true);
        assert.equal(
          await prisma.user.findUnique({ where: { id: parent.id } }),
          null,
        );
        assert.ok(
          await prisma.user.findUnique({ where: { id: adminUser.id } }),
        );
        assert.ok(
          await prisma.user.findUnique({
            where: { id: replacementTeacher.id },
          }),
        );
        for (const binding of bindings) {
          assert.ok(
            await prisma.student.findUnique({
              where: { id: binding.studentId },
            }),
          );
        }
      },
    );
    assert.ok(
      events.some(
        (e) => e.action === "admin.teacher.create" && e.targetId === teacher.id,
      ),
    );
    assert.ok(
      events.some(
        (e) => e.action === "auth.wechat.bind" && e.targetId === parent.id,
      ),
    );
  },
);
