import {
  createLessonHtmlFrameUrl,
  createSignedUrl,
  loadAccessibleTopic,
} from "../topic-access";
import { QuizPageClient, type Quiz } from "./quiz-page-client";

type QuizRow = {
  id: string;
  title_kz: string;
  title_ru: string | null;
  display_order: number;
  is_ready: boolean;
  teacher_html_path: string | null;
};

export default async function QuizzesPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const gradeId = Number(id);

  const { supabase, topic } = await loadAccessibleTopic(gradeId, slug);

  // Only ready quizzes with a teacher file are fetched; each is signed and
  // proxied like theory/problems. A missing quizzes table (migration not yet
  // run) is tolerated — we just render an empty state rather than crashing.
  const { data: quizRows } = await supabase
    .from("quizzes")
    .select("id, title_kz, title_ru, display_order, is_ready, teacher_html_path")
    .eq("topic_id", topic.id)
    .eq("is_ready", true)
    .not("teacher_html_path", "is", null)
    .order("display_order", { ascending: true })
    .returns<QuizRow[]>();

  const quizzes = await Promise.all(
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
  );

  return (
    <QuizPageClient
      topic={{
        gradeId: topic.grade_id,
        slug: topic.slug,
        name_kz: topic.name_kz,
        name_ru: topic.name_ru,
      }}
      quizzes={quizzes}
    />
  );
}
