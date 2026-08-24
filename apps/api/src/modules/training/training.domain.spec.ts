import assert from "node:assert/strict";
import test from "node:test";
import {
  TrainingAssignmentStatus,
  TrainingCourseStatus,
  TrainingQuestionType,
  TrainingSafetyStatus,
} from "@prisma/client";
import {
  addCalendarMonthsClamped,
  calculateHeartbeatSeconds,
  canTransitionAssignment,
  deadlineStatus,
  deriveSafetyStatus,
  evaluateCourseState,
  gradeQuiz,
  mergeWatchedRanges,
  watchedPercent,
} from "./training.domain";

test("video coverage merges overlaps and does not double count", () => {
  const ranges = mergeWatchedRanges(
    [
      [0, 40],
      [30, 70],
    ],
    [60, 90],
    100,
  );
  assert.deepEqual(ranges, [[0, 90]]);
  assert.equal(watchedPercent(ranges, 100), 90);
});
test("background or idle heartbeat does not add learning time", () => {
  const start = new Date("2026-08-20T00:00:00Z");
  assert.equal(
    calculateHeartbeatSeconds(start, new Date("2026-08-20T00:00:15Z"), true),
    15,
  );
  assert.equal(
    calculateHeartbeatSeconds(start, new Date("2026-08-20T00:00:15Z"), false),
    0,
  );
  assert.equal(
    calculateHeartbeatSeconds(start, new Date("2026-08-20T00:06:00Z"), true),
    0,
  );
});

test("quiz grading requires exact answers for multiple choice", () => {
  const result = gradeQuiz(
    [
      {
        id: "q1",
        type: TrainingQuestionType.multiple_choice,
        prompt: "请选择",
        options: [],
        correctAnswers: ["a", "c"],
        score: 10,
        explanation: null,
        sortOrder: 1,
      },
      {
        id: "q2",
        type: TrainingQuestionType.true_false,
        prompt: "判断",
        options: [],
        correctAnswers: ["true"],
        score: 10,
        explanation: null,
        sortOrder: 2,
      },
    ],
    { q1: ["c", "a"], q2: ["false"] },
    80,
  );
  assert.equal(result.score, 50);
  assert.equal(result.passed, false);
});

test("course waits for practical and safety confirmation", () => {
  const common = {
    chapterCount: 2,
    completedChapterCount: 2,
    accumulatedSeconds: 600,
    minimumMinutes: 10,
    quizRequired: true,
    quizPassed: true,
    practicalRequired: true,
  };
  assert.equal(
    evaluateCourseState({ ...common, practicalPassed: false, isSafety: false }),
    TrainingCourseStatus.awaiting_practical,
  );
  assert.equal(
    evaluateCourseState({ ...common, practicalPassed: true, isSafety: true }),
    TrainingCourseStatus.awaiting_safety,
  );
});

test("safety validity uses six clamped calendar months", () => {
  assert.equal(
    addCalendarMonthsClamped(new Date("2026-08-31T08:00:00Z"), 6).toISOString(),
    "2027-02-28T08:00:00.000Z",
  );
  const validUntil = new Date("2027-02-28T08:00:00Z");
  assert.equal(
    deriveSafetyStatus({ now: new Date("2027-02-20T08:00:00Z"), validUntil }),
    TrainingSafetyStatus.valid,
  );
  assert.equal(
    deriveSafetyStatus({ now: new Date("2027-02-22T08:00:00Z"), validUntil }),
    TrainingSafetyStatus.expiring,
  );
});

test("deadline and assignment transitions preserve terminal history", () => {
  const dueAt = new Date("2026-08-20T08:00:00Z");
  assert.equal(deadlineStatus(new Date("2026-08-20T08:00:01Z"), dueAt), "overdue");
  assert.equal(
    canTransitionAssignment(
      TrainingAssignmentStatus.terminated,
      TrainingAssignmentStatus.in_progress,
    ),
    false,
  );
  assert.equal(
    canTransitionAssignment(
      TrainingAssignmentStatus.completed,
      TrainingAssignmentStatus.in_progress,
    ),
    true,
  );
});
