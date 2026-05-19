import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ProblemsListClient,
  type AdminProblemRow,
  type TopicFilterOption,
} from "./problems-list-client";

type RawProblemRow = {
  id: string;
  number: string;
  title_kz: string;
  title_ru: string | null;
  difficulty: "easy" | "med" | "hard";
  display_order: number;
  is_ready: boolean;
  problem_html_path: string | null;
  topic_id: string;
  topics: {
    id: string;
    name_kz: string;
    name_ru: string | null;
    display_order: number;
  } | null;
};

export default async function ProblemsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const { topic: topicFilter } = await searchParams;

  let query = admin
    .from("problems")
    .select(
      "id, number, title_kz, title_ru, difficulty, display_order, is_ready, problem_html_path, topic_id, topics(id, name_kz, name_ru, display_order)",
    );

  if (topicFilter) {
    query = query.eq("topic_id", topicFilter);
  }

  const { data: problemsRaw, error } = await query.returns<RawProblemRow[]>();

  const { data: topics } = await admin
    .from("topics")
    .select("id, name_kz, name_ru")
    .order("display_order", { ascending: true })
    .returns<TopicFilterOption[]>();

  const sorted = (problemsRaw ?? []).slice().sort((a, b) => {
    const ao = a.topics?.display_order ?? 0;
    const bo = b.topics?.display_order ?? 0;
    if (ao !== bo) return ao - bo;
    if (a.display_order !== b.display_order)
      return a.display_order - b.display_order;
    return a.number.localeCompare(b.number);
  });

  const problems: AdminProblemRow[] = sorted.map((row) => ({
    id: row.id,
    number: row.number,
    title_kz: row.title_kz,
    title_ru: row.title_ru,
    difficulty: row.difficulty,
    problem_html_path: row.problem_html_path,
    topic_name_kz: row.topics?.name_kz ?? null,
    topic_name_ru: row.topics?.name_ru ?? null,
  }));

  return (
    <ProblemsListClient
      problems={problems}
      topics={topics ?? []}
      topicFilter={topicFilter ?? null}
      errorMessage={error?.message ?? null}
    />
  );
}
