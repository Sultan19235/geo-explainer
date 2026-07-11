// Shared types/limits for teacher-saved lesson sets (a named, ordered
// problem selection from one topic's bank). Kept apart from
// lesson-set-actions.ts because "use server" files may only export async
// functions. Stores only the composition — never student results (see the
// 2026-07-02 decision).

export const LESSON_SET_NAME_MAX = 120;
export const LESSON_SET_PROBLEMS_MAX = 200;
// Soft per-teacher cap so a buggy or hostile client can't fill the table.
export const LESSON_SETS_PER_TEACHER_MAX = 200;

export type LessonSetSummary = {
  id: string;
  name: string;
  problemIds: string[];
  updatedAt: string;
};

export type LessonSetActionResult =
  | { ok: true; id: string }
  | { ok: false; error: "unauthorized" | "invalid" | "limit" | "db" };

export type LessonSetListResult =
  | { ok: true; sets: LessonSetSummary[] }
  | { ok: false; error: "unauthorized" | "db" };
