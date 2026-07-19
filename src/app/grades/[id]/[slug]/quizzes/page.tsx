import { after } from "next/server";
import { isPrefetchRequest, logActivity } from "@/lib/analytics/track";
import {
  downloadDrillGeneratorCode,
  downloadPack,
} from "@/lib/quiz/pack-server";
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
  pack_path: string | null;
};

export default async function QuizzesPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const gradeId = Number(id);

  const { supabase, topic, user } = await loadAccessibleTopic(gradeId, slug);

  // Only ready quizzes with a teacher file OR a pack are fetched. If the
  // pack_path migration hasn't run yet, fall back to the legacy query so
  // existing HTML quizzes keep rendering.
  let quizRows: QuizRow[] | null = null;
  const withPack = await supabase
    .from("quizzes")
    .select(
      "id, title_kz, title_ru, display_order, is_ready, teacher_html_path, pack_path",
    )
    .eq("topic_id", topic.id)
    .eq("is_ready", true)
    .or("teacher_html_path.not.is.null,pack_path.not.is.null")
    .order("display_order", { ascending: true })
    .returns<QuizRow[]>();
  if (withPack.error) {
    const { data: legacyRows } = await supabase
      .from("quizzes")
      .select(
        "id, title_kz, title_ru, display_order, is_ready, teacher_html_path",
      )
      .eq("topic_id", topic.id)
      .eq("is_ready", true)
      .not("teacher_html_path", "is", null)
      .order("display_order", { ascending: true })
      .returns<Omit<QuizRow, "pack_path">[]>();
    quizRows = (legacyRows ?? []).map((row) => ({ ...row, pack_path: null }));
  } else {
    quizRows = withPack.data;
  }

  // Each rendered quiz iframe is a "used" quiz — log one open_quiz per quiz the
  // teacher is shown. Runs after the response, so it adds no render latency.
  // Link-prefetch renders don't count — checked here, not in after().
  if (user && quizRows && quizRows.length > 0 && !(await isPrefetchRequest())) {
    const rows = quizRows;
    after(() =>
      Promise.all(
        rows.map((quiz) =>
          logActivity(user.id, "open_quiz", {
            gradeId: topic.grade_id,
            topicId: topic.id,
            quizId: quiz.id,
            path: `/grades/${gradeId}/${slug}/quizzes`,
          }),
        ),
      ),
    );
  }

  const quizzes = await Promise.all(
    (quizRows ?? []).map(async (quiz): Promise<Quiz> => {
      // Engine quiz: the native console needs the pack title, questions and
      // tag groups (picker filters) — not the whole pack.
      if (quiz.pack_path) {
        const pack = await downloadPack(quiz.pack_path);
        // Uploaded drill generators also need their .js source: the
        // tournament console pre-generates its answer keys from it.
        const generatorCode =
          pack?.generator?.type === "drill" && pack.generator.file
            ? await downloadDrillGeneratorCode(quiz.id)
            : null;
        return {
          id: quiz.id,
          title_kz: quiz.title_kz,
          title_ru: quiz.title_ru,
          signed_url: null,
          pack: pack
            ? {
                title: pack.title,
                questions: pack.questions,
                tagGroups: pack.tagGroups,
                generator: pack.generator,
                generatorCode,
              }
            : null,
        };
      }

      const signedUrl = quiz.teacher_html_path
        ? await createSignedUrl(quiz.teacher_html_path)
        : null;

      return {
        id: quiz.id,
        title_kz: quiz.title_kz,
        title_ru: quiz.title_ru,
        signed_url: createLessonHtmlFrameUrl(signedUrl),
        pack: null,
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
