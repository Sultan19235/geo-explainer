import { loadAccessibleTopic } from "./topic-access";
import { LessonHubClient } from "./lesson-hub-client";

export default async function LessonHubPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const gradeId = Number(id);

  const { supabase, topic } = await loadAccessibleTopic(gradeId, slug);

  // Counts power the badges on the two hub cards. Quizzes mirror the filter used
  // by the quizzes sub-page (ready + has a teacher file) so the badge matches
  // what the teacher will actually see there.
  const [{ count: problemCount }, { count: quizCount }] = await Promise.all([
    supabase
      .from("problems")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id),
    supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id)
      .eq("is_ready", true)
      .not("teacher_html_path", "is", null),
  ]);

  return (
    <LessonHubClient
      topic={{
        gradeId: topic.grade_id,
        slug: topic.slug,
        name_kz: topic.name_kz,
        name_ru: topic.name_ru,
        description_kz: topic.description_kz,
        description_ru: topic.description_ru,
      }}
      problemCount={problemCount ?? 0}
      quizCount={quizCount ?? 0}
    />
  );
}
