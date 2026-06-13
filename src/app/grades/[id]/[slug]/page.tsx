import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  teacherHasGradeAccess,
  type TeacherAccessRow,
} from "@/lib/teacher-access";
import {
  TopicPageClient,
  type Problem,
  type Quiz,
} from "./topic-page-client";

const BUCKET = "lessons";
const VALID_GRADES = new Set([7, 8, 9, 10, 11]);
// Signed iframe URLs expire after 1 hour. If a teacher leaves the page open
// longer than that, problem iframes can 404 until the page is refreshed.
const SIGNED_URL_EXPIRES_IN = 3600;

type TopicRow = {
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

type ProblemRow = {
  id: string;
  number: string;
  title_kz: string;
  title_ru: string | null;
  difficulty: "easy" | "med" | "hard";
  tags_kz: string[] | null;
  tags_ru: string[] | null;
  display_order: number;
  is_ready: boolean;
  problem_html_path: string | null;
};

type QuizRow = {
  id: string;
  title_kz: string;
  title_ru: string | null;
  display_order: number;
  is_ready: boolean;
  teacher_html_path: string | null;
};

async function createSignedUrl(path: string | null) {
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

function createLessonHtmlFrameUrl(signedUrl: string | null) {
  if (!signedUrl) return null;
  return `/api/lesson-html?url=${encodeURIComponent(signedUrl)}`;
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const gradeId = Number(id);

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

  const { data: problemRows, error: problemsError } = await supabase
    .from("problems")
    .select(
      "id, number, title_kz, title_ru, difficulty, tags_kz, tags_ru, display_order, is_ready, problem_html_path",
    )
    .eq("topic_id", topic.id)
    .order("display_order", { ascending: true })
    .order("number", { ascending: true })
    .returns<ProblemRow[]>();

  if (problemsError) {
    throw new Error(`Есептерді жүктеу қатесі: ${problemsError.message}`);
  }

  // Quizzes embed below problems on this (already gated) page. Only ready
  // quizzes with a teacher file are fetched; each is signed and proxied like
  // theory/problems. A missing quizzes table (migration not yet run) is
  // tolerated — we just render no quiz section rather than crashing the page.
  const { data: quizRows } = await supabase
    .from("quizzes")
    .select("id, title_kz, title_ru, display_order, is_ready, teacher_html_path")
    .eq("topic_id", topic.id)
    .eq("is_ready", true)
    .not("teacher_html_path", "is", null)
    .order("display_order", { ascending: true })
    .returns<QuizRow[]>();

  const [theorySignedUrl, problems, quizzes] = await Promise.all([
    createSignedUrl(topic.theory_html_path),
    Promise.all(
      (problemRows ?? []).map(async (problem): Promise<Problem> => {
        const signedUrl = problem.problem_html_path
          ? await createSignedUrl(problem.problem_html_path)
          : null;

        return {
          id: problem.id,
          number: problem.number,
          title_kz: problem.title_kz,
          title_ru: problem.title_ru,
          difficulty: problem.difficulty,
          tags_kz: problem.tags_kz ?? [],
          tags_ru: problem.tags_ru ?? [],
          display_order: problem.display_order,
          is_ready: problem.is_ready,
          problem_html_path: problem.problem_html_path,
          signed_url: createLessonHtmlFrameUrl(signedUrl),
        };
      }),
    ),
    Promise.all(
      (quizRows ?? []).map(async (quiz): Promise<Quiz> => {
        const signedUrl = quiz.teacher_html_path
          ? await createSignedUrl(quiz.teacher_html_path)
          : null;

        return {
          id: quiz.id,
          title_kz: quiz.title_kz,
          title_ru: quiz.title_ru,
          signed_url: createLessonHtmlFrameUrl(signedUrl),
        };
      }),
    ),
  ]);

  return (
    <TopicPageClient
      topic={{
        gradeId: topic.grade_id,
        slug: topic.slug,
        name_kz: topic.name_kz,
        name_ru: topic.name_ru,
        description_kz: topic.description_kz,
        description_ru: topic.description_ru,
      }}
      theoryUrl={createLessonHtmlFrameUrl(theorySignedUrl)}
      problems={problems}
      quizzes={quizzes}
    />
  );
}
