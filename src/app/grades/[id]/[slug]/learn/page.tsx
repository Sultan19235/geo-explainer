import {
  createLessonHtmlFrameUrl,
  createSignedUrl,
  loadAccessibleTopic,
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

export default async function LearnPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const gradeId = Number(id);

  const { supabase, topic } = await loadAccessibleTopic(gradeId, slug);

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
