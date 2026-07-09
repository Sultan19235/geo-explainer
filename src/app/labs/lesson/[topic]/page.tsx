import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LessonLabClient } from "../lesson-client";
import {
  FileLessonClient,
  type FileLessonTopic,
  type LessonItemRef,
} from "../file-lesson-client";

export const dynamic = "force-dynamic";

type TopicRow = {
  id: string;
  slug: string;
  title_kz: string;
  title_ru: string | null;
  subtitle_kz: string | null;
  subtitle_ru: string | null;
  published: boolean;
};

type ItemRow = {
  id: string;
  kind: "problem" | "theory";
  file_id: string;
  number: string;
  title_kz: string;
  title_ru: string | null;
  difficulty: "easy" | "med" | "hard" | null;
  tags_kz: string[];
  tags_ru: string[];
  published: boolean;
  updated_at: string;
};

async function isAdminRequest(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: teacher } = await supabase
      .from("teachers")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle<{ is_admin: boolean }>();
    return !!teacher?.is_admin;
  } catch {
    return false;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic } = await params;
  return { title: `${topic} · Lesson player (labs)` };
}

export default async function LessonTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic: slug } = await params;

  // The native pack demo keeps its own client.
  if (slug === "cylinder") {
    return <LessonLabClient />;
  }

  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) notFound();

  const admin = createAdminClient();
  const { data: topicRow } = await admin
    .from("lesson_topics")
    .select("id, slug, title_kz, title_ru, subtitle_kz, subtitle_ru, published")
    .eq("slug", slug)
    .maybeSingle<TopicRow>();

  if (!topicRow) notFound();

  const adminViewer = await isAdminRequest();
  if (!topicRow.published && !adminViewer) notFound();

  let query = admin
    .from("lesson_items")
    .select(
      "id, kind, file_id, number, title_kz, title_ru, difficulty, tags_kz, tags_ru, published, updated_at",
    )
    .eq("topic_id", topicRow.id)
    .order("order_index", { ascending: true });
  if (!adminViewer) query = query.eq("published", true);
  const { data: itemRows } = await query;

  const items = (itemRows as ItemRow[] | null) ?? [];
  const toRef = (row: ItemRow): LessonItemRef => ({
    itemId: row.id,
    fileId: row.file_id,
    number: row.number,
    titleKz: row.title_kz,
    titleRu: row.title_ru,
    difficulty: row.difficulty,
    tagsKz: row.tags_kz ?? [],
    tagsRu: row.tags_ru ?? [],
    // Cache-buster for /lesson-files/<id>?v= — changes on re-upload.
    version: Date.parse(row.updated_at) || 0,
  });

  const topicProps: FileLessonTopic = {
    slug: topicRow.slug,
    titleKz: topicRow.title_kz,
    titleRu: topicRow.title_ru,
    subtitleKz: topicRow.subtitle_kz,
    subtitleRu: topicRow.subtitle_ru,
  };

  return (
    <FileLessonClient
      topic={topicProps}
      theoryItems={items.filter((row) => row.kind === "theory").map(toRef)}
      problemItems={items.filter((row) => row.kind === "problem").map(toRef)}
    />
  );
}
