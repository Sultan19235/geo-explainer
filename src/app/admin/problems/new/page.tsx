import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProblemForm, type TopicOption } from "../problem-form";
import { createProblemAction } from "../actions";

type RawTopic = {
  id: string;
  name_kz: string;
  display_order: number;
  grade_id: number | null;
};

export default async function NewProblemPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: rawTopics } = await admin
    .from("topics")
    .select("id, name_kz, display_order, grade_id")
    .order("display_order", { ascending: true })
    .returns<RawTopic[]>();

  const topics: TopicOption[] = (rawTopics ?? []).map((t) => ({
    id: t.id,
    name_kz: t.name_kz,
    grade: t.grade_id ?? 0,
  }));

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
      <h1 className="mb-6 text-2xl font-semibold">Жаңа есеп</h1>
      <ProblemForm
        action={createProblemAction}
        topics={topics}
        submitLabel="Құру"
      />
    </div>
  );
}
