"use server";

// Mutations/queries for teacher-saved lesson sets. All run as the signed-in
// user through the cookie client, so RLS ("owner-only") is the real
// authority — these checks just produce friendlier errors than a policy
// violation. Same shape as quiz/saved-quiz-actions.ts.

import { createClient } from "@/lib/supabase/server";
import {
  LESSON_SET_NAME_MAX,
  LESSON_SET_PROBLEMS_MAX,
  LESSON_SETS_PER_TEACHER_MAX,
  type LessonSetActionResult,
  type LessonSetListResult,
} from "./lesson-set";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= LESSON_SET_NAME_MAX ? name : null;
}

function cleanTopicId(raw: string): string | null {
  return /^[a-z0-9-]{1,64}$/.test(raw) ? raw : null;
}

// Ordered, deduped, sane ids — content is validated against the pack only at
// load time, so a stale id can exist in a row but never reaches the player.
function cleanProblemIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length >= 1 && ids.length <= LESSON_SET_PROBLEMS_MAX ? ids : null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function listLessonSetsAction(
  topicId: string,
): Promise<LessonSetListResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };
  const topic = cleanTopicId(topicId);
  if (!topic) return { ok: false, error: "db" };

  const { data, error } = await auth.supabase
    .from("lesson_sets")
    .select("id, name, problem_ids, updated_at")
    .eq("teacher_id", auth.user.id)
    .eq("topic_id", topic)
    .order("updated_at", { ascending: false });
  if (error || !data) return { ok: false, error: "db" };

  return {
    ok: true,
    sets: data.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      problemIds: (row.problem_ids as string[]) ?? [],
      updatedAt: row.updated_at as string,
    })),
  };
}

export async function createLessonSetAction(input: {
  topicId: string;
  name: string;
  problemIds: string[];
}): Promise<LessonSetActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };

  const topic = cleanTopicId(input.topicId);
  const name = cleanName(input.name);
  const problemIds = cleanProblemIds(input.problemIds);
  if (!topic || !name || !problemIds) return { ok: false, error: "invalid" };

  const { count } = await auth.supabase
    .from("lesson_sets")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", auth.user.id);
  if ((count ?? 0) >= LESSON_SETS_PER_TEACHER_MAX) {
    return { ok: false, error: "limit" };
  }

  const { data, error } = await auth.supabase
    .from("lesson_sets")
    .insert({
      teacher_id: auth.user.id,
      topic_id: topic,
      name,
      problem_ids: problemIds,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: "db" };

  return { ok: true, id: data.id };
}

export async function deleteLessonSetAction(input: {
  id: string;
}): Promise<LessonSetActionResult> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "unauthorized" };
  if (!UUID_RE.test(input.id)) return { ok: false, error: "invalid" };

  const { error } = await auth.supabase
    .from("lesson_sets")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: "db" };

  return { ok: true, id: input.id };
}
