import { createAdminClient } from "@/lib/supabase/admin";
import {
  FileLessonClient,
  type FileLessonTopic,
  type LessonItemRef,
} from "@/app/labs/lesson/file-lesson-client";
import {
  createLessonHtmlFrameUrl,
  createSignedUrl,
  loadAccessibleTopic,
  type TopicRow,
} from "../topic-access";
import { LearnPageClient, type Problem } from "./learn-page-client";

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

type LessonItemRow = {
  id: string;
  kind: "problem" | "theory";
  file_id: string;
  number: string;
  title_kz: string;
  title_ru: string | null;
  difficulty: "easy" | "med" | "hard" | null;
  tags_kz: string[] | null;
  tags_ru: string[] | null;
  updated_at: string;
};

// A topic linked to a lesson topic renders the native lesson player on the
// bulk-uploaded .js files instead of the legacy HTML iframes. Access was
// already enforced by loadAccessibleTopic; the admin client is used because
// the lesson topic may be unpublished in the /labs listing while the catalog
// topic (the source of truth here) is published.
async function renderFileLesson(topic: TopicRow) {
  const admin = createAdminClient();
  const [lessonTopicResult, itemsResult] = await Promise.all([
    admin
      .from("lesson_topics")
      .select("slug, subtitle_kz, subtitle_ru")
      .eq("id", topic.lesson_topic_id!)
      .maybeSingle<{
        slug: string;
        subtitle_kz: string | null;
        subtitle_ru: string | null;
      }>(),
    admin
      .from("lesson_items")
      .select(
        "id, kind, file_id, number, title_kz, title_ru, difficulty, tags_kz, tags_ru, updated_at",
      )
      .eq("topic_id", topic.lesson_topic_id!)
      .eq("published", true)
      .order("order_index", { ascending: true })
      .returns<LessonItemRow[]>(),
  ]);

  const lessonTopic = lessonTopicResult.data;
  const items = itemsResult.data ?? [];
  const toRef = (row: LessonItemRow): LessonItemRef => ({
    itemId: row.id,
    fileId: row.file_id,
    number: row.number,
    titleKz: row.title_kz,
    titleRu: row.title_ru,
    difficulty: row.difficulty,
    tagsKz: row.tags_kz ?? [],
    tagsRu: row.tags_ru ?? [],
    version: Date.parse(row.updated_at) || 0,
  });

  // The catalog topic names the lesson on the main site; the lesson topic
  // only contributes its subtitle (authored for the player header).
  const topicProps: FileLessonTopic = {
    slug: lessonTopic?.slug ?? topic.slug,
    titleKz: topic.name_kz,
    titleRu: topic.name_ru,
    subtitleKz: lessonTopic?.subtitle_kz ?? null,
    subtitleRu: lessonTopic?.subtitle_ru ?? null,
  };

  return (
    <FileLessonClient
      topic={topicProps}
      theoryItems={items.filter((row) => row.kind === "theory").map(toRef)}
      problemItems={items.filter((row) => row.kind === "problem").map(toRef)}
      backHref={`/grades/${topic.grade_id}/${topic.slug}`}
    />
  );
}

export default async function LearnPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const gradeId = Number(id);

  const { supabase, topic } = await loadAccessibleTopic(gradeId, slug);

  if (topic.lesson_topic_id) {
    return renderFileLesson(topic);
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

  const [theorySignedUrl, problems] = await Promise.all([
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
  ]);

  return (
    <LearnPageClient
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
    />
  );
}
