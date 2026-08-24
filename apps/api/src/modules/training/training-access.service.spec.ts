import assert from "node:assert/strict";
import test from "node:test";
import { TrainingPermission } from "@prisma/client";
import { TrainingAccessService } from "./training-access.service";

test("campus permission accepts only the requested campus or global scope", async () => {
  let receivedWhere: unknown;
  const service = new TrainingAccessService({
    trainingPermissionGrant: {
      findFirst: async (query: { where: unknown }) => {
        receivedWhere = query.where;
        return { id: "grant" };
      },
    },
  } as never);

  await service.assertPermission(
    "admin-a",
    TrainingPermission.training_manage,
    "campus-a",
  );
  assert.deepEqual(receivedWhere, {
    userId: "admin-a",
    permission: TrainingPermission.training_manage,
    isActive: true,
    scopeKey: { in: ["GLOBAL", "campus-a"] },
  });
});

test("missing scoped permission is rejected at the service boundary", async () => {
  const service = new TrainingAccessService({
    trainingPermissionGrant: { findFirst: async () => null },
  } as never);

  await assert.rejects(
    () =>
      service.assertPermission(
        "admin-b",
        TrainingPermission.safety_confirm,
        "campus-b",
      ),
    /没有相应的培训权限或校区数据权限/,
  );
});

test("campus scope distinguishes global and campus-only grants", async () => {
  const globalService = new TrainingAccessService({
    trainingPermissionGrant: {
      findMany: async () => [{ campusId: null, scopeKey: "GLOBAL" }],
    },
  } as never);
  assert.equal(
    await globalService.campusScope(
      "admin-global",
      TrainingPermission.training_manage,
    ),
    null,
  );

  const scopedService = new TrainingAccessService({
    trainingPermissionGrant: {
      findMany: async () => [
        { campusId: "campus-a", scopeKey: "campus-a" },
        { campusId: "campus-b", scopeKey: "campus-b" },
      ],
    },
  } as never);
  assert.deepEqual(
    await scopedService.campusScope(
      "admin-scoped",
      TrainingPermission.training_manage,
    ),
    ["campus-a", "campus-b"],
  );
});

test("teacher campus membership includes classes and prior training rounds", async () => {
  let receivedWhere: unknown;
  const service = new TrainingAccessService({
    user: {
      findFirst: async (query: { where: unknown }) => {
        receivedWhere = query.where;
        return { id: "teacher-a" };
      },
    },
  } as never);

  await service.assertTeacherInCampus("teacher-a", "campus-a");
  assert.deepEqual(receivedWhere, {
    id: "teacher-a",
    role: "teacher",
    OR: [
      { teachingClasses: { some: { campusId: "campus-a" } } },
      { trainingAssignments: { some: { campusId: "campus-a" } } },
    ],
  });
});

test("practical review requires the explicit permission unless actor is the mentor", async () => {
  let receivedWhere: unknown;
  const service = new TrainingAccessService({
    trainingPermissionGrant: {
      findFirst: async (query: { where: unknown }) => {
        receivedWhere = query.where;
        return { id: "practical-grant" };
      },
    },
  } as never);

  await service.assertPracticalReviewer({
    actorId: "admin-practical",
    campusId: "campus-a",
    mentorId: "mentor-a",
  });
  assert.deepEqual(receivedWhere, {
    userId: "admin-practical",
    permission: TrainingPermission.practical_confirm,
    isActive: true,
    scopeKey: { in: ["GLOBAL", "campus-a"] },
  });

  let queried = false;
  const mentorService = new TrainingAccessService({
    trainingPermissionGrant: {
      findFirst: async () => {
        queried = true;
        return null;
      },
    },
  } as never);
  await mentorService.assertPracticalReviewer({
    actorId: "mentor-a",
    campusId: "campus-a",
    mentorId: "mentor-a",
  });
  assert.equal(queried, false);
});
