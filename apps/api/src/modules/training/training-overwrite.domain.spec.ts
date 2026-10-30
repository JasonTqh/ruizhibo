import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareSnapshots,
  versionedPayload,
  snapshotChecksum,
} from "./training-overwrite.domain";
import type { TrainingCourseSnapshotPayload as Payload } from "./training.types";
const payload = (): Payload => ({
  schemaVersion: 1,
  course: {
    id: "course",
    code: "course",
    name: "课程",
    category: "business",
    summary: "简介",
    audience: null,
    expectedMinutes: 15,
    minimumMinutes: 15,
    sortOrder: 1,
    requiresPractical: true,
    isSafety: false,
    coverAssetId: null,
  },
  chapters: [
    {
      key: "old-chapter",
      title: "章节",
      contentHtml: "<p>原文</p>",
      sortOrder: 1,
      media: [
        {
          id: "old-media",
          fileAssetId: "same-video",
          type: "video",
          caption: null,
          sortOrder: 1,
          durationSeconds: 120,
        },
      ],
    },
  ],
  quiz: {
    passScore: 80,
    maxAttempts: 3,
    questions: [
      {
        id: "old-question",
        type: "single_choice",
        prompt: "问题",
        options: [
          { id: "a", label: "正确" },
          { id: "b", label: "错误" },
        ],
        correctAnswers: ["a"],
        score: 100,
        explanation: null,
        sortOrder: 1,
      },
    ],
  },
  practicalItems: [
    {
      id: "old-practical",
      title: "操作",
      instructions: "步骤",
      isRequired: true,
      sortOrder: 1,
    },
  ],
});
test("time-only updates retain semantic progress despite regenerated database IDs", () => {
  const before = payload(),
    after = versionedPayload(payload(), "new");
  after.course.minimumMinutes = 3;
  const diff = compareSnapshots(before, after);
  assert.equal(diff.chapters.length, 1);
  assert.equal(diff.questions.length, 1);
  assert.equal(diff.practical.length, 1);
  assert(diff.quizUnchanged);
  assert(diff.practicalUnchanged);
  assert.deepEqual(diff.summary.relearnChapters, []);
  assert.equal(diff.summary.minimumBefore, 15);
  assert.equal(diff.summary.minimumAfter, 3);
  assert.notEqual(snapshotChecksum(before), snapshotChecksum(after));
});
test("changed prose or media require that chapter again", () => {
  const after = payload();
  after.chapters[0].media[0].fileAssetId = "new-video";
  assert.equal(compareSnapshots(payload(), after).chapters.length, 0);
  after.chapters[0].media[0].fileAssetId = "same-video";
  after.chapters[0].contentHtml = "<p>新文</p>";
  assert.equal(compareSnapshots(payload(), after).chapters.length, 0);
});
test("question, answer IDs, score threshold and attempt-limit changes require retake", () => {
  for (const edit of [
    (p: Payload) => (p.quiz!.questions[0].prompt = "新题"),
    (p: Payload) => (p.quiz!.questions[0].options[0].id = "new-a"),
    (p: Payload) => (p.quiz!.passScore = 90),
    (p: Payload) => (p.quiz!.maxAttempts = 1),
  ]) {
    const next = payload();
    edit(next);
    assert.equal(compareSnapshots(payload(), next).quizUnchanged, false);
  }
});
test("changed practical requirements invalidate carried practical results", () => {
  const next = payload();
  next.practicalItems[0].instructions = "新要求";
  assert.equal(compareSnapshots(payload(), next).practicalUnchanged, false);
});
test("ambiguous identical chapters do not inherit progress", () => {
  const before = payload(),
    after = payload();
  before.chapters.push({ ...before.chapters[0], key: "duplicate" });
  after.chapters.push({ ...after.chapters[0], key: "duplicate-next" });
  assert.equal(compareSnapshots(before, after).chapters.length, 0);
});
test("JSON object property order is not a curriculum change", () => {
  const after = payload();
  after.quiz!.questions[0].options = [
    { label: "正确", id: "a" },
    { label: "错误", id: "b" },
  ];
  assert.equal(compareSnapshots(payload(), after).quizUnchanged, true);
});
