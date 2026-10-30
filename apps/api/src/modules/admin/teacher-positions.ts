export function normalizeTeacherPositions(
  positions?: string[],
  legacy?: string | null,
): string[] {
  if (positions !== undefined) return [...new Set(positions)];
  if (legacy === "supervisor_teacher") return ["supervisor", "teacher"];
  return legacy ? [legacy] : [];
}
