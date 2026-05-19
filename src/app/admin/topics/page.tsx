import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TopicsListClient,
  type AdminTopicRow,
} from "./topics-list-client";

export default async function TopicsAdminPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: topics, error } = await admin
    .from("topics")
    .select(
      "id, slug, name_kz, name_ru, is_published, is_free_sample, display_order, theory_html_path, grade_id",
    )
    .order("display_order", { ascending: true })
    .order("name_kz", { ascending: true })
    .returns<AdminTopicRow[]>();

  const grouped = new Map<number, AdminTopicRow[]>();
  for (const t of topics ?? []) {
    const g = t.grade_id ?? 0;
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(t);
  }
  const groups = Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([grade, rows]) => ({ grade, rows }));

  return (
    <TopicsListClient groups={groups} errorMessage={error?.message ?? null} />
  );
}
