import {
  TrainingAssignmentStatus,
  TrainingCourseStatus,
  TrainingSafetyStatus,
} from "@prisma/client";
import type {
  TrainingSnapshotQuestion,
  WatchedRange,
} from "./training.types";

export const DEFAULT_TRAINING_DAYS = 7;
export const SAFETY_VALID_MONTHS = 6;
export const SAFETY_EXPIRING_DAYS = 7;
export const VIDEO_COMPLETION_PERCENT = 90;
export const VIDEO_PROGRESS_SAVE_SECONDS = 15;
export const DEFAULT_IDLE_SECONDS = 5 * 60;

export type DeadlineStatus = "normal" | "due_soon" | "overdue";

export function addNaturalDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addCalendarMonthsClamped(value: Date, months: number) {
  const result = new Date(value.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function deadlineStatus(now: Date, dueAt: Date): DeadlineStatus {
  if (now.getTime() > dueAt.getTime()) return "overdue";
  if (dueAt.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000) {
    return "due_soon";
  }
  return "normal";
}

export function calculateHeartbeatSeconds(
  lastHeartbeatAt: Date,
  now: Date,
  isEffectiveActivity: boolean,
  idleThresholdSeconds = DEFAULT_IDLE_SECONDS,
) {
  if (!isEffectiveActivity) return 0;
  const elapsed = Math.floor(
    (now.getTime() - lastHeartbeatAt.getTime()) / 1000,
  );
  if (elapsed <= 0 || elapsed > idleThresholdSeconds) return 0;
  return elapsed;
}

export function mergeWatchedRanges(
  existing: WatchedRange[],
  next: WatchedRange,
  durationSeconds: number,
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const normalized: WatchedRange[] = [...existing, next]
    .map(([start, end]) => [
      clamp(Number(start), 0, durationSeconds),
      clamp(Number(end), 0, durationSeconds),
    ] as WatchedRange)
    .filter(([start, end]) => Number.isFinite(start) && end > start)
    .sort((a, b) => a[0] - b[0]);

  const merged: WatchedRange[] = [];
  for (const range of normalized) {
    const previous = merged.at(-1);
    if (!previous || range[0] > previous[1] + 0.25) {
      merged.push([...range]);
    } else {
      previous[1] = Math.max(previous[1], range[1]);
    }
  }
  return merged;
}

export function watchedPercent(
  ranges: WatchedRange[],
  durationSeconds: number,
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const covered = mergeWatchedRanges(ranges, [0, 0], durationSeconds).reduce(
    (sum, [start, end]) => sum + end - start,
    0,
  );
  return round(Math.min(100, (covered / durationSeconds) * 100), 2);
}

export function gradeQuiz(
  questions: TrainingSnapshotQuestion[],
  answers: Record<string, string[]>,
  passScore: number,
) {
  const totalPoints = questions.reduce((sum, item) => sum + item.score, 0);
  let earnedPoints = 0;
  const results = questions.map((question) => {
    const actual = normalizeAnswer(answers[question.id] ?? []);
    const expected = normalizeAnswer(question.correctAnswers);
    const correct =
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]);
    if (correct) earnedPoints += question.score;
    return {
      questionId: question.id,
      correct,
      selectedAnswers: actual,
    };
  });
  const score = totalPoints > 0 ? round((earnedPoints / totalPoints) * 100, 2) : 0;
  return { score, passed: score >= passScore, earnedPoints, totalPoints, results };
}

export function evaluateCourseState(input: {
  chapterCount: number;
  completedChapterCount: number;
  accumulatedSeconds: number;
  minimumMinutes: number;
  quizRequired: boolean;
  quizPassed: boolean;
  practicalRequired: boolean;
  practicalPassed: boolean;
  isSafety: boolean;
}): TrainingCourseStatus {
  const learningSatisfied =
    input.chapterCount > 0 &&
    input.completedChapterCount >= input.chapterCount &&
    input.accumulatedSeconds >= input.minimumMinutes * 60 &&
    (!input.quizRequired || input.quizPassed);
  if (!learningSatisfied) return TrainingCourseStatus.in_progress;
  if (input.practicalRequired && !input.practicalPassed) {
    return TrainingCourseStatus.awaiting_practical;
  }
  if (input.isSafety) return TrainingCourseStatus.awaiting_safety;
  return TrainingCourseStatus.completed;
}

export function deriveSafetyStatus(input: {
  now: Date;
  validUntil: Date | null;
  awaitingConfirmation?: boolean;
  retrainingRequired?: boolean;
}) {
  if (input.retrainingRequired) return TrainingSafetyStatus.retraining_required;
  if (input.awaitingConfirmation) return TrainingSafetyStatus.awaiting_confirmation;
  if (!input.validUntil) return TrainingSafetyStatus.not_obtained;
  if (input.now.getTime() >= input.validUntil.getTime()) {
    return TrainingSafetyStatus.retraining_required;
  }
  if (
    input.validUntil.getTime() - input.now.getTime() <=
    SAFETY_EXPIRING_DAYS * 24 * 60 * 60 * 1000
  ) {
    return TrainingSafetyStatus.expiring;
  }
  return TrainingSafetyStatus.valid;
}

const assignmentTransitions: Record<
  TrainingAssignmentStatus,
  TrainingAssignmentStatus[]
> = {
  pending: ["in_progress", "frozen", "terminated"],
  in_progress: ["awaiting_safety", "frozen", "terminated"],
  awaiting_safety: ["completed", "in_progress", "frozen", "terminated"],
  completed: ["in_progress"],
  frozen: ["pending", "in_progress", "awaiting_safety", "terminated"],
  terminated: [],
};

export function canTransitionAssignment(
  from: TrainingAssignmentStatus,
  to: TrainingAssignmentStatus,
) {
  return assignmentTransitions[from].includes(to);
}

const courseTransitions: Record<TrainingCourseStatus, TrainingCourseStatus[]> = {
  locked: ["available", "exempted"],
  available: ["in_progress", "exempted"],
  in_progress: [
    "awaiting_practical",
    "awaiting_safety",
    "completed",
    "exempted",
  ],
  awaiting_practical: ["in_progress", "awaiting_safety", "completed"],
  awaiting_safety: ["completed", "in_progress"],
  completed: ["available"],
  exempted: ["available"],
};

export function canTransitionCourse(
  from: TrainingCourseStatus,
  to: TrainingCourseStatus,
) {
  return courseTransitions[from].includes(to);
}

export function isCourseProgressComplete(status: TrainingCourseStatus) {
  const completeStatuses: TrainingCourseStatus[] = [
    TrainingCourseStatus.completed,
    TrainingCourseStatus.exempted,
    TrainingCourseStatus.awaiting_safety,
  ];
  return completeStatuses.includes(status);
}

function normalizeAnswer(values: string[]) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
