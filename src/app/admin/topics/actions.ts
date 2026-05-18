"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "lessons";

function theoryPath(topicId: string) {
  return `theory/${topicId}.html`;
}

function getCheckbox(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === "on" || v === "true";
}

function getString(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function getOptionalString(formData: FormData, name: string): string | null {
  const v = getString(formData, name);
  return v === "" ? null : v;
}

async function uploadTheoryFile(
  topicId: string,
  file: File,
): Promise<string> {
  const admin = createAdminClient();
  const path = theoryPath(topicId);
  const arrayBuffer = await file.arrayBuffer();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: "text/html",
      upsert: true,
    });
  if (error) {
    throw new Error(`Файлды жүктеу қатесі: ${error.message}`);
  }
  return path;
}

export async function createTopicAction(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const gradeId = Number(getString(formData, "grade_id"));
  const slug = getString(formData, "slug");
  const name_kz = getString(formData, "name_kz");
  const name_ru = getOptionalString(formData, "name_ru");
  const description_kz = getOptionalString(formData, "description_kz");
  const description_ru = getOptionalString(formData, "description_ru");
  const is_published = getCheckbox(formData, "is_published");
  const is_free_sample = getCheckbox(formData, "is_free_sample");
  const display_order = Number(getString(formData, "display_order") || "0");

  if (!gradeId || !slug || !name_kz) {
    throw new Error("Сынып, slug және қазақша атау міндетті.");
  }

  const { data: inserted, error: insertError } = await admin
    .from("topics")
    .insert({
      grade_id: gradeId,
      slug,
      name_kz,
      name_ru,
      description_kz,
      description_ru,
      is_published,
      is_free_sample,
      display_order,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Тақырып құру қатесі.");
  }

  const file = formData.get("theory_file");
  if (file instanceof File && file.size > 0) {
    const path = await uploadTheoryFile(inserted.id, file);
    const { error: updateError } = await admin
      .from("topics")
      .update({ theory_html_path: path })
      .eq("id", inserted.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath("/admin/topics");
  redirect("/admin/topics");
}

export async function updateTopicAction(id: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const gradeId = Number(getString(formData, "grade_id"));
  const slug = getString(formData, "slug");
  const name_kz = getString(formData, "name_kz");
  const name_ru = getOptionalString(formData, "name_ru");
  const description_kz = getOptionalString(formData, "description_kz");
  const description_ru = getOptionalString(formData, "description_ru");
  const is_published = getCheckbox(formData, "is_published");
  const is_free_sample = getCheckbox(formData, "is_free_sample");
  const display_order = Number(getString(formData, "display_order") || "0");

  if (!gradeId || !slug || !name_kz) {
    throw new Error("Сынып, slug және қазақша атау міндетті.");
  }

  const file = formData.get("theory_file");
  let theory_html_path: string | undefined;
  if (file instanceof File && file.size > 0) {
    theory_html_path = await uploadTheoryFile(id, file);
  }

  const { error } = await admin
    .from("topics")
    .update({
      grade_id: gradeId,
      slug,
      name_kz,
      name_ru,
      description_kz,
      description_ru,
      is_published,
      is_free_sample,
      display_order,
      ...(theory_html_path ? { theory_html_path } : {}),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/topics");
  redirect("/admin/topics");
}

export async function deleteTopicAction(id: string) {
  await requireAdmin();
  const admin = createAdminClient();

  await admin.storage.from(BUCKET).remove([theoryPath(id)]);

  const { error } = await admin.from("topics").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/topics");
  redirect("/admin/topics");
}
