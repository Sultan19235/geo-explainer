// Shared types/limits for teacher-saved quizzes (a named question selection
// from one pack). Kept apart from saved-quiz-actions.ts because "use server"
// files may only export async functions.

export type QuizOrderMode = "custom" | "shuffle";

export const SAVED_QUIZ_NAME_MAX = 120;
export const SAVED_QUIZ_QUESTIONS_MAX = 500;
// Soft per-teacher cap so a buggy or hostile client can't fill the table.
export const SAVED_QUIZZES_PER_TEACHER_MAX = 200;

export type SavedQuizActionResult =
  | { ok: true; id: string }
  | { ok: false; error: "unauthorized" | "invalid" | "limit" | "db" };

// What the console needs to know about the saved quiz it is editing.
export type SavedQuizRef = {
  id: string;
  name: string;
  // Saved question ids that no longer exist in the pack (dropped at load).
  missing: number;
};

// One row of the dashboard's "My quizzes" list.
export type SavedQuizSummary = {
  id: string;
  name: string;
  quizId: string;
  quizTitleKz: string;
  quizTitleRu: string | null;
  questionCount: number;
  orderMode: QuizOrderMode;
  updatedAt: string;
};
