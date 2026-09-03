import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { TeacherEmploymentStatus, UserRole, UserStatus } from "@prisma/client";
import { AuthService } from "./auth.service";
import { hashPassword } from "./password";

const PHONE = "13800000001";
const PASSWORD = "Teacher-Web!2026";

describe("teacher web authentication", () => {
  it("issues a short-lived teacher web token for an active employed teacher", async () => {
    const fixture = await createFixture();
    const result = await fixture.service.teacherWebLogin(
      { phone: PHONE, password: PASSWORD },
      "127.0.0.1",
    );

    assert.equal(result.data.token, "teacher-web-token");
    assert.equal(result.data.user.role, UserRole.teacher);
    assert.equal(fixture.signedPayload?.sub, "teacher-1");
    assert.equal(fixture.successes, 1);
    assert.equal(fixture.failures, 0);
    assert.deepEqual(fixture.auditActions, ["auth.teacher_web.login"]);
  });

  it("rejects a wrong password and records the failed attempt", async () => {
    const fixture = await createFixture();
    await assert.rejects(
      fixture.service.teacherWebLogin(
        { phone: PHONE, password: "Wrong-Password!2026" },
        "127.0.0.2",
      ),
      UnauthorizedException,
    );
    assert.equal(fixture.failures, 1);
    assert.equal(fixture.successes, 0);
  });

  it("rejects a resigned teacher even when the password matches", async () => {
    const fixture = await createFixture({
      employmentStatus: TeacherEmploymentStatus.resigned,
    });
    await assert.rejects(
      fixture.service.teacherWebLogin(
        { phone: PHONE, password: PASSWORD },
        "127.0.0.3",
      ),
      UnauthorizedException,
    );
    assert.equal(fixture.failures, 1);
  });

  it("rejects an account without a teacher web password", async () => {
    const fixture = await createFixture({ passwordHash: null });
    await assert.rejects(
      fixture.service.teacherWebLogin(
        { phone: PHONE, password: PASSWORD },
        "127.0.0.4",
      ),
      UnauthorizedException,
    );
    assert.equal(fixture.failures, 1);
  });
});

async function createFixture(
  overrides: Partial<{
    passwordHash: string | null;
    status: UserStatus;
    employmentStatus: TeacherEmploymentStatus;
  }> = {},
) {
  const user = {
    id: "teacher-1",
    role: UserRole.teacher,
    name: "李老师",
    phone: PHONE,
    passwordHash: await hashPassword(PASSWORD),
    status: UserStatus.active,
    employmentStatus: TeacherEmploymentStatus.employed,
    ...overrides,
  };
  let failures = 0;
  let successes = 0;
  let signedPayload: { sub: string; role: UserRole } | undefined;
  const auditActions: string[] = [];

  const service = new AuthService(
    {
      user: {
        findFirst: async () => user,
      },
    } as never,
    {
      signTeacherWeb: (payload: { sub: string; role: UserRole }) => {
        signedPayload = payload;
        return "teacher-web-token";
      },
    } as never,
    {
      log: async ({ action }: { action: string }) => {
        auditActions.push(action);
      },
    } as never,
    {
      assertAllowed: () => undefined,
      recordFailure: () => {
        failures += 1;
      },
      recordSuccess: () => {
        successes += 1;
      },
    } as never,
  );

  return {
    service,
    get failures() {
      return failures;
    },
    get successes() {
      return successes;
    },
    get signedPayload() {
      return signedPayload;
    },
    auditActions,
  };
}
