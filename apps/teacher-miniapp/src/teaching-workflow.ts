const LESSON_TAG_PREFIX = "lesson-plan:";

export function lessonTag(id: string) {
  return `${LESSON_TAG_PREFIX}${id}`;
}

export function visibleTags(tags: string[] = []) {
  return tags.filter((tag) => !tag.startsWith(LESSON_TAG_PREFIX));
}

// Pending entries are read directly from saved plans, so they remain in sync
// across devices and do not turn planned teaching into completed classroom facts.
export function pendingLessons(plans: any[], records: any[]) {
  const completed = new Set(records.flatMap((record) => record.tags || []));
  return plans.filter(
    (plan) => plan.status !== "draft" && !completed.has(lessonTag(plan.id)),
  );
}

export function recordFromLesson(plan: any) {
  const date = new Date(plan.lessonDate);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    classId: plan.classId,
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    course: plan.theme,
    content: "",
    tags: "",
  };
}
