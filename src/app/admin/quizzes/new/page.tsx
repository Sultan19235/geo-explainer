import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizForm, type TopicOption } from "../quiz-form";
import { NewQuizHeading, QuizBackLink } from "../quiz-back-link";
import { createQuizAction } from "../actions";

type RawTopic = {
  id: string;
  name_kz: string;
  name_ru: string | null;
  display_order: number;
  grade_id: number | null;
};

export default async function NewQuizPage() {
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
      <NewQuizHeading />
      <QuizForm
        action={createQuizAction}
        topics={topics}
        submitLabelKey="submit_create"
      />
    </div>
  );
}
