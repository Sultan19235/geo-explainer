import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TopicForm,
  type GradeOption,
  type TopicFormValues,
} from "../topic-form";
import {
  EditTopicHeading,
  TopicBackLink,
} from "../topic-back-link";
import { updateTopicAction, deleteTopicAction } from "../actions";
import { DeleteTopicButton } from "./delete-button";

export default async function EditTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: topic }, { data: grades }] = await Promise.all([
    admin
      .from("topics")
      .select(
        "id, grade_id, slug, name_kz, name_ru, description_kz, description_ru, is_published, is_free_sample, display_order, theory_html_path",
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("grades")
      .select("id")
      .order("id", { ascending: true })
      .returns<GradeOption[]>(),
  ]);

  if (!topic) {
    notFound();
  }

  const initial: TopicFormValues = {
    grade_id: topic.grade_id,
    slug: topic.slug ?? "",
    name_kz: topic.name_kz ?? "",
    name_ru: topic.name_ru ?? "",
    description_kz: topic.description_kz ?? "",
    description_ru: topic.description_ru ?? "",
    is_published: !!topic.is_published,
    is_free_sample: !!topic.is_free_sample,
    display_order: topic.display_order ?? 0,
    theory_html_path: topic.theory_html_path ?? null,
  };

  async function update(formData: FormData) {
    "use server";
    await updateTopicAction(id, formData);
  }

  async function remove() {
    "use server";
    await deleteTopicAction(id);
  }

  return (
    <div>
      <div className="mb-4 text-sm">
        <TopicBackLink />
      </div>
      <div className="mb-6 flex items-center justify-between">
        <EditTopicHeading />
        <DeleteTopicButton action={remove} />
      </div>
      <TopicForm
        action={update}
        grades={grades ?? []}
        initial={initial}
        submitLabelKey="submit_save"
      />
    </div>
  );
}
