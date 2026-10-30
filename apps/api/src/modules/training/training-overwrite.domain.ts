import { createHash } from "node:crypto";
import type { TrainingCourseSnapshotPayload as Payload } from "./training.types";

export function snapshotChecksum(payload: Payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
function stripIds(value: any): any {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["id", "key", "revision"].includes(key))
        .map(([key, item]) => [key, stripIds(item)]),
    );
  return value;
}
export function canonical(value: any): string {
  const normalize = (v: any): any =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, normalize(v[k])]),
          )
        : v;
  return JSON.stringify(normalize(value));
}
export function semantic(value: unknown) {
  return canonical(stripIds(value));
}
function uniqueMap<T>(before: T[], after: T[], key: (item: T) => string) {
  const old = new Map<string, T[]>(),
    next = new Map<string, T[]>();
  for (const item of before)
    old.set(key(item), [...(old.get(key(item)) ?? []), item]);
  for (const item of after)
    next.set(key(item), [...(next.get(key(item)) ?? []), item]);
  return after.flatMap((item) => {
    const a = old.get(key(item)),
      b = next.get(key(item));
    return a?.length === 1 && b?.length === 1
      ? [{ before: a[0], after: item }]
      : [];
  });
}
export function compareSnapshots(before: Payload, after: Payload) {
  const chapters = uniqueMap(before.chapters, after.chapters, semantic);
  // Option identifiers are answer keys, not generated database IDs: preserve them in comparison.
  const quizValue = (quiz: Payload["quiz"]) =>
    quiz && { ...quiz, questions: quiz.questions.map(({ id, ...q }) => q) };
  const questions =
    before.quiz && after.quiz
      ? uniqueMap(before.quiz.questions, after.quiz.questions, (q) =>
          canonical(
            quizValue({ passScore: 0, maxAttempts: null, questions: [q] }),
          ),
        )
      : [];
  const quizUnchanged =
    canonical(quizValue(before.quiz)) === canonical(quizValue(after.quiz)) &&
    (!after.quiz || questions.length === after.quiz.questions.length);
  const practical = uniqueMap(
    before.practicalItems,
    after.practicalItems,
    semantic,
  );
  const practicalUnchanged =
    before.course.requiresPractical === after.course.requiresPractical &&
    before.course.isSafety === after.course.isSafety &&
    semantic(before.practicalItems) === semantic(after.practicalItems) &&
    practical.length === after.practicalItems.length;
  return {
    chapters,
    questions,
    practical,
    quizUnchanged,
    practicalUnchanged,
    summary: {
      minimumBefore: before.course.minimumMinutes,
      minimumAfter: after.course.minimumMinutes,
      preservedChapters: chapters.length,
      relearnChapters: after.chapters
        .filter((c) => !chapters.some((pair) => pair.after === c))
        .map((c) => c.title),
      removedChapters: before.chapters
        .filter((c) => !chapters.some((pair) => pair.before === c))
        .map((c) => c.title),
      retakeQuiz: !quizUnchanged && !!after.quiz,
      recheckPractical: !practicalUnchanged && after.course.requiresPractical,
    },
  };
}
export function versionedPayload(payload: Payload, revision: string): Payload {
  return {
    ...payload,
    revision,
    chapters: payload.chapters.map((c, i) => ({
      ...c,
      key: `${revision}:chapter:${i}`,
      media: c.media.map((m, j) => ({
        ...m,
        id: `${revision}:media:${i}:${j}`,
      })),
    })),
    quiz: payload.quiz
      ? {
          ...payload.quiz,
          questions: payload.quiz.questions.map((q, i) => ({
            ...q,
            id: `${revision}:question:${i}`,
          })),
        }
      : null,
    practicalItems: payload.practicalItems.map((p, i) => ({
      ...p,
      id: `${revision}:practical:${i}`,
    })),
  };
}
