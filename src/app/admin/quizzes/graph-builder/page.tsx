import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizBackLink } from "../quiz-back-link";
import { type TopicOption } from "../quiz-form";
import { GraphBuilderClient } from "./graph-builder-client";

type RawTopic = {
  id: string;
  name_kz: string;
  name_ru: string | null;
  display_order: number;
  grade_id: number | null;
};

// The graph-quiz authoring widget: hand-build A/B/C/D quadratic-graph
// questions visually, then either save straight to a quiz or download a
// pack.json. No JSON hand-editing required.
export default async function GraphBuilderPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: rawTopics } = await admin
    .from("topics")
    .select("id, name_kz, name_ru, display_order, grade_id")
    .order("display_order", { ascending: true })
    .returns<RawTopic[]>();

  const topics: TopicOption[] = (rawTopics ?? []).map((topic) => ({
    id: topic.id,
    name_kz: topic.name_kz,
    name_ru: topic.name_ru,
    grade: topic.grade_id ?? 0,
  }));

  return (
    <div>
      <div className="mb-4 text-sm">
        <QuizBackLink />
      </div>
      <GraphBuilderClient topics={topics} />
    </div>
  );
}
