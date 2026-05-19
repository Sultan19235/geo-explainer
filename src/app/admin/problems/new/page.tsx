import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProblemForm, type TopicOption } from "../problem-form";
import {
  NewProblemHeading,
  ProblemBackLink,
} from "../problem-back-link";
import { createProblemAction } from "../actions";

type RawTopic = {
  id: string;
  name_kz: string;
  name_ru: string | null;
  display_order: number;
  grade_id: number | null;
};

export default async function NewProblemPage() {
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
        <ProblemBackLink />
      </div>
      <NewProblemHeading />
      <ProblemForm
        action={createProblemAction}
        topics={topics}
        submitLabelKey="submit_create"
      />
    </div>
  );
}
