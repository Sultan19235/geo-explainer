import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizForm, type QuizFormValues, type TopicOption } from "../quiz-form";
import { EditQuizHeading, QuizBackLink } from "../quiz-back-link";
import { updateQuizAction, deleteQuizAction } from "../actions";
import { DeleteQuizButton } from "./delete-button";

type RawTopic = {
  id: string;
  name_kz: string;
  name_ru: string | null;
  display_order: number;
  grade_id: number | null;
};

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: quiz }, { data: rawTopics }] = await Promise.all([
    admin
      .from("quizzes")
      .select(
        "id, topic_id, title_kz, title_ru, display_order, is_ready, teacher_html_path, student_html_path",
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("topics")
      .select("id, name_kz, name_ru, display_order, grade_id")
      .order("display_order", { ascending: true })
      .returns<RawTopic[]>(),
  ]);

  if (!quiz) {
    notFound();
  }

  const topics: TopicOption[] = (rawTopics ?? []).map((topic) => ({
    id: topic.id,
    name_kz: topic.name_kz,
    name_ru: topic.name_ru,
    grade: topic.grade_id ?? 0,
  }));

  const initial: QuizFormValues = {
    topic_id: quiz.topic_id,
    title_kz: quiz.title_kz ?? "",
    title_ru: quiz.title_ru ?? "",
    display_order: quiz.display_order ?? 0,
    is_ready: !!quiz.is_ready,
    teacher_html_path: quiz.teacher_html_path ?? null,
    student_html_path: quiz.student_html_path ?? null,
  };

  async function update(formData: FormData) {
    "use server";
    await updateQuizAction(id, formData);
  }

  async function remove() {
    "use server";
    await deleteQuizAction(id);
  }

  return (
    <div>
      <div className="mb-4 text-sm">
        <QuizBackLink />
      </div>
      <div className="mb-6 flex items-center justify-between">
        <EditQuizHeading />
        <DeleteQuizButton action={remove} />
      </div>
      <QuizForm
        action={update}
        topics={topics}
        initial={initial}
        submitLabelKey="submit_save"
      />
    </div>
  );
}
