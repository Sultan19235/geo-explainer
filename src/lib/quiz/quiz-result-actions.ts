"use server";

// Mutations for saved quiz results. Same shape as saved-quiz-actions: all run
// as the signed-in user through the cookie client, so RLS ("owner-only") is
// the real authority — validation here just produces friendlier errors and
// keeps garbage out of the jsonb column.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnswerMap } from "./live-client";
import {
  QUIZ_RESULTS_PER_TEACHER_MAX,
  RESULT_STUDENTS_MAX,
  type QuizResultActionResult,
  type ResultStudent,
} from "./quiz-result";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanAnswers(raw: unknown): AnswerMap | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: AnswerMap = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length === 0 || key.length > 64) continue;
    if (value !== 0 && value !== 1) continue;
    out[key] = value;
    if (++n >= 500) break;
  }
  return n > 0 ? out : undefined;
}

function cleanStudents(raw: unknown): ResultStudent[] | null {
  if (!Array.isArray(raw)) return null;
  const students: ResultStudent[] = [];
  for (const item of raw.slice(0, RESULT_STUDENTS_MAX)) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as Record<string, unknown>;
    if (typeof s.name !== "string" || s.name.length === 0) return null;
    students.push({
      name: s.name.slice(0, 40),
      score: typeof s.score === "number" ? Math.max(0, Math.round(s.score)) : 0,
      total: typeof s.total === "number" ? Math.max(0, Math.round(s.total)) : 0,
      finished: s.finished === true,
      tabSwitches:
        typeof s.tabSwitches === "number"
          ? Math.max(0, Math.round(s.tabSwitches))
          : 0,
      awaySeconds:
        typeof s.awaySeconds === "number"
          ? Math.max(0, Math.round(s.awaySeconds))
          : 0,
      answers: cleanAnswers(s.answers),
    });
  }
  return students.length >= 1 ? students : null;
}

function cleanQuestionIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) return null;
  const ids: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || id.length === 0 || id.length > 64) {
      return null;
    }
    ids.push(id);
  }
  return ids;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

// Called by the console when a room reaches results. quizId is null for rooms
// with no pack row behind them (the standalone graph-quadratic console,
// dev-preview); questionIds is null when questions have no stable ids
// (generator rooms).
export async function saveQuizResultAction(input: {
  quizId: string | null;
  title: string;
  roomCode: string;
  questionIds: string[] | null;
  students: ResultStudent[];
}): Promise<QuizResultActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };

  const title = input.title.trim().slice(0, 200);
  const roomCode = input.roomCode.trim().slice(0, 8);
  const students = cleanStudents(input.students);
  const questionIds =
    input.questionIds === null ? null : cleanQuestionIds(input.questionIds);
  const quizId =
    input.quizId !== null && UUID_RE.test(input.quizId) ? input.quizId : null;
  if (!title || !roomCode || !students) return { ok: false, error: "invalid" };

  const { data, error } = await auth.supabase
    .from("quiz_results")
    .insert({
      teacher_id: auth.user.id,
      quiz_id: quizId,
      title,
      room_code: roomCode,
      question_ids: questionIds,
      students,
      student_count: students.length,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: "db" };

  // Auto-saves accumulate forever, so prune past the cap instead of refusing
  // the save (refusing would silently drop today's lesson to keep an old one).
  const { data: overflow } = await auth.supabase
    .from("quiz_results")
    .select("id")
    .eq("teacher_id", auth.user.id)
    .order("ended_at", { ascending: false })
    .range(QUIZ_RESULTS_PER_TEACHER_MAX, QUIZ_RESULTS_PER_TEACHER_MAX + 49)
    .returns<{ id: string }[]>();
  if (overflow && overflow.length > 0) {
    await auth.supabase
      .from("quiz_results")
      .delete()
      .in(
        "id",
        overflow.map((row) => row.id),
      );
  }

  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function deleteQuizResultAction(input: {
  id: string;
}): Promise<QuizResultActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };
  if (!UUID_RE.test(input.id)) return { ok: false, error: "invalid" };

  const { error } = await auth.supabase
    .from("quiz_results")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: "db" };

  revalidatePath("/dashboard");
  return { ok: true, id: input.id };
}
