import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  teacherHasGradeAccess,
  type TeacherAccessRow,
} from "@/lib/teacher-access";

export const BUCKET = "lessons";
export const VALID_GRADES = new Set([7, 8, 9, 10, 11]);
// Signed iframe URLs expire after 1 hour. If a teacher leaves the page open
// longer than that, problem iframes can 404 until the page is refreshed.
export const SIGNED_URL_EXPIRES_IN = 3600;

export type TopicRow = {
  id: string;
  grade_id: number;
  slug: string;
  name_kz: string;
  name_ru: string | null;
  description_kz: string | null;
  description_ru: string | null;
  is_published: boolean;
  is_free_sample: boolean;
  theory_html_path: string | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Loads a topic for the given grade/slug and enforces the access gate shared by
 * the lesson hub and its sub-pages (theory/problems and quizzes). Triggers
 * `notFound()` for unknown/unpublished topics and `redirect()` when the teacher
 * lacks access. Returns the topic row and a server Supabase client on success.
 */
export async function loadAccessibleTopic(gradeId: number, slug: string) {
  if (!VALID_GRADES.has(gradeId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: topic } = await supabase
    .from("topics")
    .select(
      "id, grade_id, slug, name_kz, name_ru, description_kz, description_ru, is_published, is_free_sample, theory_html_path",
    )
    .eq("grade_id", gradeId)
    .eq("slug", slug)
    .maybeSingle<TopicRow>();

  if (!topic || !topic.is_published) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasAccess = topic.is_free_sample;
  if (!hasAccess && user) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("granted_grades, access_expires_at")
      .eq("id", user.id)
      .maybeSingle<TeacherAccessRow>();

    hasAccess = teacherHasGradeAccess(teacher, gradeId);
  }

  if (!hasAccess) {
    redirect(`/grades/${gradeId}?access=required`);
  }

  // `user` is returned so callers can attribute analytics events. It is null for
  // anonymous visitors on a free-sample topic — such visits are not tracked
  // (analytics covers signed-in teachers only).
  return { supabase: supabase as SupabaseClient, topic, user };
}

export async function createSignedUrl(path: string | null) {
  if (!path) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);

  if (error) {
    throw new Error(`Signed URL қатесі: ${error.message}`);
  }

  return data.signedUrl;
}

export function createLessonHtmlFrameUrl(signedUrl: string | null) {
  if (!signedUrl) return null;
  return `/api/lesson-html?url=${encodeURIComponent(signedUrl)}`;
}
