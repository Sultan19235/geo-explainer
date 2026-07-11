// Types + limits for saved quiz results (quiz_results table): the frozen
// scoreboard a teacher's console writes when a live room ends, listed in the
// profile. Mirrors the console's LiveStudent minus live-only fields (focused,
// flash) — a saved result records what happened, not who had the tab open.

import type { AnswerMap } from "./live-client";

// Newest rows kept per teacher; the save action prunes older ones so an
// auto-saving console can never grow a teacher's history without bound.
export const QUIZ_RESULTS_PER_TEACHER_MAX = 500;
// Shown on the dashboard without a "load more" (full history stays in the DB
// until pruned; a pager can come later if anyone scrolls past this).
export const QUIZ_RESULTS_DASHBOARD_LIMIT = 30;
export const RESULT_STUDENTS_MAX = 200;

export type ResultStudent = {
  name: string;
  score: number;
  total: number;
  finished: boolean;
  tabSwitches: number;
  awaySeconds: number;
  answers?: AnswerMap;
};

export type QuizResultSummary = {
  id: string;
  quizId: string | null;
  title: string;
  roomCode: string;
  questionIds: string[] | null;
  students: ResultStudent[];
  studentCount: number;
  startedAt: string | null;
  endedAt: string;
};

export type QuizResultActionResult =
  | { ok: true; id: string }
  | { ok: false; error: "unauthorized" | "invalid" | "db" };
