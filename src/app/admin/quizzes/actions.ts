"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Teacher consoles live in the PRIVATE bucket (embedded via signed URL on the
// gated lesson page). Student files live in a PUBLIC bucket (opened directly by
// QR on phones, no auth).
const TEACHER_BUCKET = "lessons";
const STUDENT_BUCKET = "quizzes-public";
const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

function teacherPath(quizId: string) {
  return `quiz/${quizId}/teacher.html`;
}
function studentPath(quizId: string) {
  return `quiz/${quizId}/student.html`;
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

async function uploadHtml(
  bucket: string,
  path: string,
  file: File,
): Promise<void> {
  const admin = createAdminClient();
  const arrayBuffer = await file.arrayBuffer();
  const body = new Blob([arrayBuffer], { type: HTML_CONTENT_TYPE });
  const { error } = await admin.storage.from(bucket).upload(path, body, {
    contentType: HTML_CONTENT_TYPE,
    upsert: true,
  });
  if (error) {
    throw new Error(`Файлды жүктеу қатесі: ${error.message}`);
  }
}

export async function createQuizAction(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const topic_id = getString(formData, "topic_id");
  const title_kz = getString(formData, "title_kz");
  const title_ru = getOptionalString(formData, "title_ru");
  const display_order = Number(getString(formData, "display_order") || "0");
  let is_ready = getCheckbox(formData, "is_ready");

  if (!topic_id || !title_kz) {
    throw new Error("Тақырып және қазақша атау міндетті.");
  }

  const teacherFile = formData.get("teacher_file");
  const studentFile = formData.get("student_file");
  const hasTeacher = teacherFile instanceof File && teacherFile.size > 0;
  const hasStudent = studentFile instanceof File && studentFile.size > 0;
  if (hasTeacher) is_ready = true;

  const { data: inserted, error: insertError } = await admin
    .from("quizzes")
    .insert({ topic_id, title_kz, title_ru, display_order, is_ready })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Тест құру қатесі.");
  }

  const update: { teacher_html_path?: string; student_html_path?: string } = {};
  if (hasTeacher) {
    const path = teacherPath(inserted.id);
    await uploadHtml(TEACHER_BUCKET, path, teacherFile as File);
    update.teacher_html_path = path;
  }
  if (hasStudent) {
    const path = studentPath(inserted.id);
    await uploadHtml(STUDENT_BUCKET, path, studentFile as File);
    update.student_html_path = path;
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await admin
      .from("quizzes")
      .update(update)
      .eq("id", inserted.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes");
}

export async function updateQuizAction(id: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const topic_id = getString(formData, "topic_id");
  const title_kz = getString(formData, "title_kz");
  const title_ru = getOptionalString(formData, "title_ru");
  const display_order = Number(getString(formData, "display_order") || "0");
  const is_ready = getCheckbox(formData, "is_ready");

  if (!topic_id || !title_kz) {
    throw new Error("Тақырып және қазақша атау міндетті.");
  }

  const teacherFile = formData.get("teacher_file");
  const studentFile = formData.get("student_file");
  const hasTeacher = teacherFile instanceof File && teacherFile.size > 0;
  const hasStudent = studentFile instanceof File && studentFile.size > 0;

  const update: {
    topic_id: string;
    title_kz: string;
    title_ru: string | null;
    display_order: number;
    is_ready: boolean;
    teacher_html_path?: string;
    student_html_path?: string;
  } = { topic_id, title_kz, title_ru, display_order, is_ready };

  if (hasTeacher) {
    const path = teacherPath(id);
    await uploadHtml(TEACHER_BUCKET, path, teacherFile as File);
    update.teacher_html_path = path;
    update.is_ready = true;
  }
  if (hasStudent) {
    const path = studentPath(id);
    await uploadHtml(STUDENT_BUCKET, path, studentFile as File);
    update.student_html_path = path;
  }

  const { error } = await admin.from("quizzes").update(update).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes");
}

export async function deleteQuizAction(id: string) {
  await requireAdmin();
  const admin = createAdminClient();

  // Remove both files (ignore missing — remove is idempotent enough here).
  await admin.storage.from(TEACHER_BUCKET).remove([teacherPath(id)]);
  await admin.storage.from(STUDENT_BUCKET).remove([studentPath(id)]);

  const { error } = await admin.from("quizzes").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes");
}
