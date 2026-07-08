import { createAdminClient } from "@/lib/supabase/admin";
import { LessonsAdminClient, type AdminTopic } from "./lessons-client";

export const dynamic = "force-dynamic";

export default async function AdminLessonsPage() {
  const admin = createAdminClient();
  const { data: topics } = await admin
    .from("lesson_topics")
    .select("id, slug, title_kz, title_ru, subtitle_kz, published, order_index")
    .order("order_index", { ascending: true });

  const { data: counts } = await admin
    .from("lesson_items")
    .select("topic_id, kind");

  const countMap = new Map<string, { problems: number; theory: number }>();
  for (const row of (counts as { topic_id: string; kind: string }[] | null) ?? []) {
    const entry = countMap.get(row.topic_id) ?? { problems: 0, theory: 0 };
    if (row.kind === "problem") entry.problems += 1;
    else entry.theory += 1;
    countMap.set(row.topic_id, entry);
  }

  const list: AdminTopic[] = (
    (topics as Omit<AdminTopic, "problems" | "theory">[] | null) ?? []
  ).map((topic) => ({
    ...topic,
    problems: countMap.get(topic.id)?.problems ?? 0,
    theory: countMap.get(topic.id)?.theory ?? 0,
  }));

  return <LessonsAdminClient topics={list} />;
}
