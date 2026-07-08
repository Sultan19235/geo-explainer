"use server";

// Admin actions for bulk-uploaded lesson content (topics + .js lesson files).
// All run behind requireAdmin() with the service-role client — RLS keeps the
// public read-only.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLessonFileMeta } from "@/lib/lesson/file-format";

const BUCKET = "lessons";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_MAX_BYTES = 400_000;

export type TopicActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createTopicAction(input: {
  slug: string;
  titleKz: string;
  titleRu: string;
  subtitleKz: string;
  subtitleRu: string;
}): Promise<TopicActionResult> {
  await requireAdmin();
  const slug = input.slug.trim().toLowerCase();
  const titleKz = input.titleKz.trim();
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "slug: тек a-z, 0-9, дефис" };
  }
  if (slug === "cylinder") {
    return { ok: false, error: "cylinder — демо тақырыптың атауы" };
  }
  if (titleKz.length === 0 || titleKz.length > 160) {
    return { ok: false, error: "title (KZ) міндетті" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lesson_topics")
    .insert({
      slug,
      title_kz: titleKz,
      title_ru: input.titleRu.trim() || null,
      subtitle_kz: input.subtitleKz.trim() || null,
      subtitle_ru: input.subtitleRu.trim() || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "db error" };
  }
  revalidatePath("/admin/lessons");
  return { ok: true, id: data.id };
}

export async function setTopicPublishedAction(input: {
  id: string;
  published: boolean;
}): Promise<TopicActionResult> {
  await requireAdmin();
  if (!UUID_RE.test(input.id)) return { ok: false, error: "invalid id" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("lesson_topics")
    .update({ published: input.published, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/lessons");
  revalidatePath("/labs/lesson");
  return { ok: true, id: input.id };
}

// ─── Bulk file upload ────────────────────────────────────────────────────────

export type UploadFileResult = {
  name: string;
  ok: boolean;
  message: string;
};

export async function uploadLessonFilesAction(input: {
  topicId: string;
  files: { name: string; text: string }[];
}): Promise<{ ok: boolean; results: UploadFileResult[] }> {
  await requireAdmin();
  if (!UUID_RE.test(input.topicId) || !Array.isArray(input.files)) {
    return { ok: false, results: [] };
  }

  const admin = createAdminClient();
  const { data: topic } = await admin
    .from("lesson_topics")
    .select("id")
    .eq("id", input.topicId)
    .maybeSingle<{ id: string }>();
  if (!topic) return { ok: false, results: [] };

  const { data: lastItem } = await admin
    .from("lesson_items")
    .select("order_index")
    .eq("topic_id", input.topicId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();
  let nextOrder = (lastItem?.order_index ?? 0) + 1;

  const results: UploadFileResult[] = [];

  for (const file of input.files.slice(0, 200)) {
    const name = String(file.name ?? "file");
    const text = String(file.text ?? "");
    if (text.length === 0 || text.length > FILE_MAX_BYTES) {
      results.push({ name, ok: false, message: "файл бос немесе тым үлкен" });
      continue;
    }
    const parsed = parseLessonFileMeta(text);
    if (!parsed.ok) {
      results.push({ name, ok: false, message: parsed.error });
      continue;
    }
    const meta = parsed.meta;
    const storagePath = `lesson-player/${input.topicId}/${meta.kind}-${meta.id}.js`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, new Blob([text], { type: "text/javascript" }), {
        upsert: true,
        contentType: "text/javascript; charset=utf-8",
      });
    if (uploadError) {
      results.push({ name, ok: false, message: uploadError.message });
      continue;
    }

    // Re-uploading the same file id updates the content + title but keeps
    // admin-edited metadata (difficulty/tags/order/published).
    const { data: existing } = await admin
      .from("lesson_items")
      .select("id")
      .eq("topic_id", input.topicId)
      .eq("kind", meta.kind)
      .eq("file_id", meta.id)
      .maybeSingle<{ id: string }>();

    if (existing) {
      const { error } = await admin
        .from("lesson_items")
        .update({
          number: meta.number ?? "",
          title_kz: meta.title.kz,
          title_ru: meta.title.ru ?? null,
          storage_path: storagePath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      results.push({
        name,
        ok: !error,
        message: error ? error.message : `жаңартылды (${meta.kind} ${meta.id})`,
      });
    } else {
      const { error } = await admin.from("lesson_items").insert({
        topic_id: input.topicId,
        kind: meta.kind,
        file_id: meta.id,
        number: meta.number ?? "",
        title_kz: meta.title.kz,
        title_ru: meta.title.ru ?? null,
        difficulty: meta.difficulty ?? null,
        tags_kz: (meta.tags ?? []).map((tag) => tag.kz),
        tags_ru: (meta.tags ?? []).map((tag) => tag.ru ?? tag.kz),
        storage_path: storagePath,
        order_index: nextOrder,
      });
      nextOrder += 1;
      results.push({
        name,
        ok: !error,
        message: error ? error.message : `қосылды (${meta.kind} ${meta.id})`,
      });
    }
  }

  revalidatePath("/admin/lessons");
  return { ok: results.every((result) => result.ok), results };
}

// ─── Item metadata quick-edit ────────────────────────────────────────────────

export async function updateLessonItemAction(input: {
  id: string;
  number?: string;
  difficulty?: "easy" | "med" | "hard" | null;
  tagsKz?: string[];
  tagsRu?: string[];
  orderIndex?: number;
  published?: boolean;
}): Promise<TopicActionResult> {
  await requireAdmin();
  if (!UUID_RE.test(input.id)) return { ok: false, error: "invalid id" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.number !== undefined) patch.number = input.number.trim().slice(0, 24);
  if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
  if (input.tagsKz !== undefined) {
    patch.tags_kz = input.tagsKz.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  }
  if (input.tagsRu !== undefined) {
    patch.tags_ru = input.tagsRu.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  }
  if (input.orderIndex !== undefined && Number.isFinite(input.orderIndex)) {
    patch.order_index = Math.trunc(input.orderIndex);
  }
  if (input.published !== undefined) patch.published = input.published;

  const admin = createAdminClient();
  const { error } = await admin
    .from("lesson_items")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/lessons");
  return { ok: true, id: input.id };
}

export async function deleteLessonItemAction(input: {
  id: string;
}): Promise<TopicActionResult> {
  await requireAdmin();
  if (!UUID_RE.test(input.id)) return { ok: false, error: "invalid id" };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("lesson_items")
    .select("storage_path")
    .eq("id", input.id)
    .maybeSingle<{ storage_path: string }>();
  if (item) {
    await admin.storage.from(BUCKET).remove([item.storage_path]);
  }
  const { error } = await admin.from("lesson_items").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/lessons");
  return { ok: true, id: input.id };
}
