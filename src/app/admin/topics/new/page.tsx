import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopicForm, type GradeOption } from "../topic-form";
import {
  NewTopicHeading,
  TopicBackLink,
} from "../topic-back-link";
import { createTopicAction } from "../actions";

export default async function NewTopicPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: grades } = await admin
    .from("grades")
    .select("id")
    .order("id", { ascending: true })
    .returns<GradeOption[]>();

  return (
    <div>
      <div className="mb-4 text-sm">
        <TopicBackLink />
      </div>
      <NewTopicHeading />
      <TopicForm
        action={createTopicAction}
        grades={grades ?? []}
        submitLabelKey="submit_create"
      />
    </div>
  );
}
