import assert from "node:assert/strict";
import test from "node:test";
import {
  TrainingCourseStatus,
  TrainingPermission,
  UserRole,
} from "@prisma/client";
import { FilesService } from "./files.service";

const assignedAssetId = "asset-assigned";
const otherAssetId = "asset-other";

type CourseFixture = {
  status: TrainingCourseStatus;
  assetId: string;
};

function createService(options: {
  role?: UserRole;
  courses?: CourseFixture[];
  adminGrant?: boolean;
}) {
  const prisma = {
    fileAsset: {
      findFirst: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        scene: "training-course",
        mimeType: "image/png",
        size: 128,
        storageKey: `training-course/${where.id}.png`,
      }),
    },
    user: {
      findFirst: async () => ({ role: options.role ?? UserRole.teacher }),
    },
    trainingAssignment: {
      findMany: async (query: {
        where: { teacherId: string; activeSlot: string };
      }) => {
        assert.equal(query.where.teacherId, query.where.activeSlot);
        return options.courses
          ? [
              {
                courses: options.courses.map((course) => ({
                  status: course.status,
                  snapshot: {
                    payload: {
                      course: { coverAssetId: course.assetId },
                      chapters: [],
                    },
                  },
                })),
              },
            ]
          : [];
      },
    },
    trainingPermissionGrant: {
      findFirst: async (query: {
        where: {
          permission: TrainingPermission;
          scopeKey: string;
          isActive: boolean;
        };
      }) => {
        assert.equal(
          query.where.permission,
          TrainingPermission.training_manage,
        );
        assert.equal(query.where.scopeKey, "GLOBAL");
        assert.equal(query.where.isActive, true);
        return options.adminGrant ? { id: "global-training-manager" } : null;
      },
    },
  };
  return new FilesService(prisma as never, {} as never);
}

async function expectDenied(service: FilesService, assetId: string) {
  await assert.rejects(
    () => service.createTrainingAccessUrl("teacher-a", assetId),
    /该素材不属于当前已解锁的培训课程/,
  );
}

test("teacher without an active assignment cannot access enabled course media", async () => {
  await expectDenied(createService({}), assignedAssetId);
});

test("teacher cannot access media absent from the active assignment snapshot", async () => {
  await expectDenied(
    createService({
      courses: [
        { status: TrainingCourseStatus.available, assetId: otherAssetId },
      ],
    }),
    assignedAssetId,
  );
});

test("teacher cannot access media from a locked assignment course", async () => {
  await expectDenied(
    createService({
      courses: [
        { status: TrainingCourseStatus.locked, assetId: assignedAssetId },
      ],
    }),
    assignedAssetId,
  );
});

test("teacher can access media from an unlocked active assignment snapshot", async () => {
  const result = await createService({
    courses: [
      { status: TrainingCourseStatus.available, assetId: assignedAssetId },
    ],
  }).createTrainingAccessUrl("teacher-a", assignedAssetId);
  assert.match(result.data.url, new RegExp(`/training/${assignedAssetId}/content`));
});

test("snapshot media remains accessible independently of later course edits", async () => {
  const result = await createService({
    courses: [
      { status: TrainingCourseStatus.completed, assetId: assignedAssetId },
    ],
  }).createTrainingAccessUrl("teacher-a", assignedAssetId);
  assert.equal(result.data.assetId, assignedAssetId);
});

test("teacher cannot access another teacher assignment asset", async () => {
  await expectDenied(
    createService({
      courses: [
        { status: TrainingCourseStatus.in_progress, assetId: otherAssetId },
      ],
    }),
    assignedAssetId,
  );
});

test("global training manager can preview course media", async () => {
  const result = await createService({
    role: UserRole.admin,
    adminGrant: true,
  }).createTrainingAccessUrl("admin-a", assignedAssetId);
  assert.equal(result.data.assetId, assignedAssetId);
});

process.env.TRAINING_MEDIA_SIGNING_SECRET ??=
  "training-media-test-secret-at-least-32-characters";
