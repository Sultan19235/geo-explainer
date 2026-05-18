import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ProblemForm,
  type ProblemFormValues,
  type TopicOption,
} from "../problem-form";
import { updateProblemAction, deleteProblemAction } from "../actions";
import { DeleteProblemButton } from "./delete-button";

type RawTopic = {
  id: string;
  name_kz: string;
  display_order: number;
  grade_id: number | null;
};

export default async function EditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: problem }, { data: rawTopics }] = await Promise.all([
    admin
      .from("problems")
      .select(
        "id, topic_id, number, title_kz, title_ru, difficulty, tags_kz, tags_ru, display_order, is_ready, problem_html_path",
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("topics")
      .select("id, name_kz, display_order, grade_id")
      .order("display_order", { ascending: true })
      .returns<RawTopic[]>(),
  ]);

  if (!problem) {
    notFound();
  }

  const topics: TopicOption[] = (rawTopics ?? []).map((t) => ({
    id: t.id,
    name_kz: t.name_kz,
    grade: t.grade_id ?? 0,
  }));

  const difficulty: ProblemFormValues["difficulty"] =
    problem.difficulty === "med" || problem.difficulty === "hard"
      ? problem.difficulty
      : "easy";

  const initial: ProblemFormValues = {
    topic_id: problem.topic_id,
    number: problem.number ?? "",
    title_kz: problem.title_kz ?? "",
    title_ru: problem.title_ru ?? "",
    difficulty,
    tags_kz: Array.isArray(problem.tags_kz) ? problem.tags_kz.join(", ") : "",
    tags_ru: Array.isArray(problem.tags_ru) ? problem.tags_ru.join(", ") : "",
    display_order: problem.display_order ?? 0,
    is_ready: !!problem.is_ready,
    problem_html_path: problem.problem_html_path ?? null,
  };

  async function update(formData: FormData) {
    "use server";
    await updateProblemAction(id, formData);
  }

  async function remove() {
    "use server";
    await deleteProblemAction(id);
  }

  return (
    <div>
      <div className="mb-4 text-sm">
        <Link
          href="/admin/problems"
          className="text-muted-foreground hover:underline"
        >
          ← Есептер
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Есепті өңдеу</h1>
        <DeleteProblemButton action={remove} />
      </div>
      <ProblemForm
        action={update}
        topics={topics}
        initial={initial}
        submitLabel="Сақтау"
      />
    </div>
  );
}
