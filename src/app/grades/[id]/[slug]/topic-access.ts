import { unstable_cache } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  teacherHasGradeAccess,
  type TeacherAccessRow,
} from "@/lib/teacher-access";

export const BUCKET = "lessons";
export const VALID_GRADES = new Set([7, 8, 9, 10, 11]);
// Signed iframe URLs expire after 4 hours and are cached for 1, so a page
// always gets a URL with ≥3h of validity left — longer than any lesson. A
// signed URL is path + token; re-uploading to the same path serves the new
// content through a cached URL just fine.
export const SIGNED_URL_EXPIRES_IN = 4 * 3600;
const SIGNED_URL_CACHE_SECONDS = 3600;

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
  // The topic lookup and the auth check are independent — running them
  // concurrently saves one Vercel↔Supabase round trip on every lesson page.
  const [topicResult, userResult] = await Promise.all([
    supabase
      .from("topics")
      .select(
        "id, grade_id, slug, name_kz, name_ru, description_kz, description_ru, is_published, is_free_sample, theory_html_path",
      )
      .eq("grade_id", gradeId)
      .eq("slug", slug)
      .maybeSingle<TopicRow>(),
    supabase.auth.getUser(),
  ]);
  const topic = topicResult.data;
  const user = userResult.data.user;

  if (!topic || !topic.is_published) {
    notFound();
  }

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

  // Cached across requests (and users — access is gated before any caller
  // gets here): the learn page signs one URL per problem, so without the
  // cache every visit pays a Storage round trip per problem.
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);

      if (error) {
        throw new Error(`Signed URL қатесі: ${error.message}`);
      }

      return data.signedUrl;
    },
    ["signed-url", BUCKET, path],
    { revalidate: SIGNED_URL_CACHE_SECONDS },
  )();
}

export function createLessonHtmlFrameUrl(signedUrl: string | null) {
  if (!signedUrl) return null;
  return `/api/lesson-html?url=${encodeURIComponent(signedUrl)}`;
}
