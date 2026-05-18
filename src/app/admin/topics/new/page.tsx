import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopicForm, type GradeOption } from "../topic-form";
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
        <Link href="/admin/topics" className="text-muted-foreground hover:underline">
          ← Тақырыптар
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold">Жаңа тақырып</h1>
      <TopicForm
        action={createTopicAction}
        grades={grades ?? []}
        submitLabel="Құру"
      />
    </div>
  );
}
