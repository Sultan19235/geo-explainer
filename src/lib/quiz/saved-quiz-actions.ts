"use server";

// Mutations for teacher-saved quizzes. All run as the signed-in user through
// the cookie client, so RLS ("owner-only") is the real authority — these
// checks just produce friendlier errors than a policy violation.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  SAVED_QUIZ_NAME_MAX,
  SAVED_QUIZ_QUESTIONS_MAX,
  SAVED_QUIZZES_PER_TEACHER_MAX,
  type QuizOrderMode,
  type SavedQuizActionResult,
} from "./saved-quiz";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= SAVED_QUIZ_NAME_MAX ? name : null;
}

// Ordered, deduped, sane ids — content is validated against the pack only at
// load time, so a stale id can exist in a row but never reaches a student.
function cleanQuestionIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length >= 1 && ids.length <= SAVED_QUIZ_QUESTIONS_MAX ? ids : null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function createSavedQuizAction(input: {
  quizId: string;
  name: string;
  questionIds: string[];
  orderMode: QuizOrderMode;
}): Promise<SavedQuizActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };

  const name = cleanName(input.name);
  const questionIds = cleanQuestionIds(input.questionIds);
  const orderMode: QuizOrderMode =
    input.orderMode === "shuffle" ? "shuffle" : "custom";
  if (!name || !questionIds || !UUID_RE.test(input.quizId)) {
    return { ok: false, error: "invalid" };
  }

  const { count } = await auth.supabase
    .from("saved_quizzes")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", auth.user.id);
  if ((count ?? 0) >= SAVED_QUIZZES_PER_TEACHER_MAX) {
    return { ok: false, error: "limit" };
  }

  const { data, error } = await auth.supabase
    .from("saved_quizzes")
    .insert({
      teacher_id: auth.user.id,
      quiz_id: input.quizId,
      name,
      question_ids: questionIds,
      order_mode: orderMode,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: "db" };

  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// Console "save changes": overwrite the composition, keep the name.
export async function updateSavedQuizAction(input: {
  id: string;
  questionIds: string[];
  orderMode: QuizOrderMode;
}): Promise<SavedQuizActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };

  const questionIds = cleanQuestionIds(input.questionIds);
  const orderMode: QuizOrderMode =
    input.orderMode === "shuffle" ? "shuffle" : "custom";
  if (!questionIds || !UUID_RE.test(input.id)) {
    return { ok: false, error: "invalid" };
  }

  const { data, error } = await auth.supabase
    .from("saved_quizzes")
    .update({
      question_ids: questionIds,
      order_mode: orderMode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle<{ id: string }>();
  // RLS filters other owners' rows, so a vanished/foreign id comes back empty.
  if (error || !data) return { ok: false, error: "db" };

  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function renameSavedQuizAction(input: {
  id: string;
  name: string;
}): Promise<SavedQuizActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };

  const name = cleanName(input.name);
  if (!name || !UUID_RE.test(input.id)) return { ok: false, error: "invalid" };

  const { data, error } = await auth.supabase
    .from("saved_quizzes")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !data) return { ok: false, error: "db" };

  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

// The copy's name comes from the client so the "(copy)" suffix is in the
// teacher's current UI language.
export async function duplicateSavedQuizAction(input: {
  id: string;
  name: string;
}): Promise<SavedQuizActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };

  const name = cleanName(input.name);
  if (!name || !UUID_RE.test(input.id)) return { ok: false, error: "invalid" };

  const { data: source } = await auth.supabase
    .from("saved_quizzes")
    .select("quiz_id, question_ids, order_mode")
    .eq("id", input.id)
    .maybeSingle<{
      quiz_id: string;
      question_ids: string[];
      order_mode: QuizOrderMode;
    }>();
  if (!source) return { ok: false, error: "db" };

  return createSavedQuizAction({
    quizId: source.quiz_id,
    name,
    questionIds: source.question_ids,
    orderMode: source.order_mode,
  });
}

export async function deleteSavedQuizAction(input: {
  id: string;
}): Promise<SavedQuizActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };
  if (!UUID_RE.test(input.id)) return { ok: false, error: "invalid" };

  const { error } = await auth.supabase
    .from("saved_quizzes")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: "db" };

  revalidatePath("/dashboard");
  return { ok: true, id: input.id };
}
