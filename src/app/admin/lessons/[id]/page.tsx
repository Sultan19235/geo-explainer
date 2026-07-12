import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TopicDetailClient,
  type AdminItem,
  type CatalogTopicOption,
} from "./topic-detail-client";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminLessonTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const admin = createAdminClient();
  const { data: topic } = await admin
    .from("lesson_topics")
    .select("id, slug, title_kz, published")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      slug: string;
      title_kz: string;
      published: boolean;
    }>();
  if (!topic) notFound();

  const [{ data: items }, { data: catalogRows }] = await Promise.all([
    admin
      .from("lesson_items")
      .select(
        "id, kind, file_id, number, title_kz, difficulty, tags_kz, tags_ru, order_index, published, updated_at",
      )
      .eq("topic_id", id)
      .order("kind", { ascending: false })
      .order("order_index", { ascending: true }),
    admin
      .from("topics")
      .select("id, grade_id, slug, name_kz, lesson_topic_id")
      .order("grade_id", { ascending: true })
      .order("name_kz", { ascending: true }),
  ]);

  const catalogTopics = (catalogRows as CatalogTopicOption[] | null) ?? [];
  const linkedCatalogId =
    catalogTopics.find((row) => row.lesson_topic_id === id)?.id ?? null;

  return (
    <TopicDetailClient
      topic={topic}
      items={((items as AdminItem[] | null) ?? []).map((item) => ({
        ...item,
        tags_kz: item.tags_kz ?? [],
        tags_ru: item.tags_ru ?? [],
      }))}
      catalogTopics={catalogTopics}
      linkedCatalogId={linkedCatalogId}
    />
  );
}
