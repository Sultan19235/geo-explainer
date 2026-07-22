import { after } from "next/server";
import { isPrefetchRequest, logActivity } from "@/lib/analytics/track";
import { createAdminClient } from "@/lib/supabase/admin";
import { readPresentIndex } from "@/lib/present/index-store";
import { loadAccessibleTopic } from "./topic-access";
import { LessonHubClient } from "./lesson-hub-client";

export default async function LessonHubPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const gradeId = Number(id);

  const { supabase, topic, user } = await loadAccessibleTopic(gradeId, slug);

  // Skip Link-prefetch renders — only a real navigation counts as a view.
  if (user && !(await isPrefetchRequest())) {
    after(() =>
      logActivity(user.id, "view_lesson", {
        gradeId: topic.grade_id,
        topicId: topic.id,
        path: `/grades/${gradeId}/${slug}`,
      }),
    );
  }

  // Counts power the badges on the two hub cards. Quizzes mirror the filter
  // used by the quizzes sub-page — ready + (teacher HTML file OR engine pack)
  // — so the badge matches what the teacher will actually see there. Same
  // legacy fallback as the sub-page for a database without pack_path yet.
  const countQuizzes = async () => {
    const withPack = await supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id)
      .eq("is_ready", true)
      .or("teacher_html_path.not.is.null,pack_path.not.is.null");
    if (!withPack.error) return withPack.count;
    const legacy = await supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id)
      .eq("is_ready", true)
      .not("teacher_html_path", "is", null);
    return legacy.count;
  };

  // A topic linked to a lesson topic serves the native lesson player, so the
  // badge counts its published lesson problems, not the legacy HTML ones.
  const countProblems = async () => {
    if (topic.lesson_topic_id) {
      // Admin client: the RLS policy on lesson_items requires the lesson
      // topic to be published in the /labs listing, which linked topics
      // deliberately don't need. Access was gated by loadAccessibleTopic.
      const { count } = await createAdminClient()
        .from("lesson_items")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", topic.lesson_topic_id)
        .eq("kind", "problem")
        .eq("published", true);
      return count;
    }
    const { count } = await supabase
      .from("problems")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id);
    return count;
  };

  // Explicit attachment: the admin picks a topic per presentation in
  // /admin/presentations; the link (topicId) lives in the presentations
  // index — no migration needed.
  const findPresentation = async () => {
    try {
      const entries = await readPresentIndex(createAdminClient());
      return entries.find((entry) => entry.topicId === topic.id) ?? null;
    } catch {
      return null; // storage unreachable — the hub renders without the card
    }
  };

  const [problemCount, quizCount, presentation] = await Promise.all([
    countProblems(),
    countQuizzes(),
    findPresentation(),
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
      presentation={
        presentation
          ? { id: presentation.id, slides: presentation.slides }
          : null
      }
      // Presentation-taught topics (grade 5+) have no separate theory/problems
      // section — the slides ARE the lesson. An empty «0 есеп» card would just
      // confuse; it reappears as soon as the topic gets real learn content.
      showLearn={
        (problemCount ?? 0) > 0 ||
        Boolean(topic.lesson_topic_id) ||
        Boolean(topic.theory_html_path)
      }
    />
  );
}
