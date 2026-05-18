"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "lessons";
const HTML_CONTENT_TYPE = "text/html; charset=utf-8";
const VALID_DIFFICULTIES = ["easy", "med", "hard"] as const;
type Difficulty = (typeof VALID_DIFFICULTIES)[number];

function problemPath(problemId: string) {
  return `problems/${problemId}.html`;
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

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseDifficulty(value: string): Difficulty {
  if ((VALID_DIFFICULTIES as readonly string[]).includes(value)) {
    return value as Difficulty;
  }
  throw new Error("Қиындық деңгейі дұрыс емес.");
}

async function uploadProblemFile(
  problemId: string,
  file: File,
): Promise<string> {
  const admin = createAdminClient();
  const path = problemPath(problemId);
  const arrayBuffer = await file.arrayBuffer();
  const body = new Blob([arrayBuffer], { type: HTML_CONTENT_TYPE });
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, body, {
      contentType: HTML_CONTENT_TYPE,
      upsert: true,
    });
  if (error) {
    throw new Error(`Файлды жүктеу қатесі: ${error.message}`);
  }
  return path;
}

export async function createProblemAction(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const topic_id = getString(formData, "topic_id");
  const number = getString(formData, "number");
  const title_kz = getString(formData, "title_kz");
  const title_ru = getOptionalString(formData, "title_ru");
  const difficulty = parseDifficulty(getString(formData, "difficulty"));
  const tags_kz = parseTags(getString(formData, "tags_kz"));
  const tags_ru = parseTags(getString(formData, "tags_ru"));
  const display_order = Number(getString(formData, "display_order") || "0");
  let is_ready = getCheckbox(formData, "is_ready");

  if (!topic_id || !number || !title_kz) {
    throw new Error("Тақырып, нөмір және қазақша тақырыбы міндетті.");
  }

  const file = formData.get("problem_file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) is_ready = true;

  const { data: inserted, error: insertError } = await admin
    .from("problems")
    .insert({
      topic_id,
      number,
      title_kz,
      title_ru,
      difficulty,
      tags_kz,
      tags_ru,
      display_order,
      is_ready,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Есеп құру қатесі.");
  }

  if (hasFile) {
    const path = await uploadProblemFile(inserted.id, file as File);
    const { error: updateError } = await admin
      .from("problems")
      .update({ problem_html_path: path })
      .eq("id", inserted.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath("/admin/problems");
  redirect("/admin/problems");
}

export async function updateProblemAction(id: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const topic_id = getString(formData, "topic_id");
  const number = getString(formData, "number");
  const title_kz = getString(formData, "title_kz");
  const title_ru = getOptionalString(formData, "title_ru");
  const difficulty = parseDifficulty(getString(formData, "difficulty"));
  const tags_kz = parseTags(getString(formData, "tags_kz"));
  const tags_ru = parseTags(getString(formData, "tags_ru"));
  const display_order = Number(getString(formData, "display_order") || "0");
  let is_ready = getCheckbox(formData, "is_ready");

  if (!topic_id || !number || !title_kz) {
    throw new Error("Тақырып, нөмір және қазақша тақырыбы міндетті.");
  }

  const file = formData.get("problem_file");
  const hasFile = file instanceof File && file.size > 0;
  let problem_html_path: string | undefined;
  if (hasFile) {
    problem_html_path = await uploadProblemFile(id, file as File);
    is_ready = true;
  }

  const { error } = await admin
    .from("problems")
    .update({
      topic_id,
      number,
      title_kz,
      title_ru,
      difficulty,
      tags_kz,
      tags_ru,
      display_order,
      is_ready,
      ...(problem_html_path ? { problem_html_path } : {}),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/problems");
  redirect("/admin/problems");
}

export async function deleteProblemAction(id: string) {
  await requireAdmin();
  const admin = createAdminClient();

  await admin.storage.from(BUCKET).remove([problemPath(id)]);

  const { error } = await admin.from("problems").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/problems");
  redirect("/admin/problems");
}
