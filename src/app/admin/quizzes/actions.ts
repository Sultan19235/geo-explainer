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

// The public URL students open by QR. Points at our own /play/q/<id> route
// (which serves the student file as real text/html — Supabase's public bucket
// serves stored .html as text/plain). The teacher console's STUDENT_URL is
// rewritten to this on upload so the QR always points at this quiz's own
// student page (the author can't know the quiz id ahead of time). Absolute
// because students scan it externally on phones.
function studentPageUrl(quizId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set — cannot build the student QR URL.",
    );
  }
  return `${base}/play/q/${quizId}`;
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

async function uploadBlob(bucket: string, path: string, blob: Blob) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(path, blob, {
    contentType: HTML_CONTENT_TYPE,
    upsert: true,
  });
  if (error) {
    throw new Error(`Файлды жүктеу қатесі: ${error.message}`);
  }
}

// Optionally rewrites `const BACKEND = '...'` to QUIZ_BACKEND_URL. Lets the
// live-quiz server move hosts (e.g. to api.mathsabaq.online) by changing one
// env var instead of re-editing every quiz file. Unset env → file unchanged.
function rewriteBackendUrl(html: string): string {
  const backend = process.env.QUIZ_BACKEND_URL?.replace(/\/+$/, "");
  if (!backend) return html;
  return html.replace(
    /(const\s+BACKEND\s*=\s*)(['"])(?:\\.|(?!\2).)*\2/,
    `$1$2${backend}$2`,
  );
}

async function uploadStudentFile(quizId: string, file: File): Promise<void> {
  const original = await file.text();
  await uploadBlob(
    STUDENT_BUCKET,
    studentPath(quizId),
    new Blob([rewriteBackendUrl(original)], { type: HTML_CONTENT_TYPE }),
  );
}

// Uploads the teacher console, rewriting its `const STUDENT_URL = '...'` line to
// this quiz's student public URL so the embedded console's QR resolves (the
// author can't know the quiz id ahead of time). A file without that line
// uploads unchanged.
async function uploadTeacherFile(quizId: string, file: File): Promise<void> {
  const original = await file.text();
  const target = studentPageUrl(quizId);
  const rewritten = rewriteBackendUrl(original).replace(
    /(const\s+STUDENT_URL\s*=\s*)(['"])(?:\\.|(?!\2).)*\2/,
    `$1$2${target}$2`,
  );
  await uploadBlob(
    TEACHER_BUCKET,
    teacherPath(quizId),
    new Blob([rewritten], { type: HTML_CONTENT_TYPE }),
  );
}

export async function createQuizAction(formData: FormData) {
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

  const { data: inserted, error: insertError } = await admin
    .from("quizzes")
    .insert({ topic_id, title_kz, title_ru, display_order, is_ready })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Тест құру қатесі.");
  }

  const update: {
    teacher_html_path?: string;
    student_html_path?: string;
    is_ready?: boolean;
  } = {};
  // Upload the student file first so its public URL exists before the teacher
  // file's STUDENT_URL is rewritten to point at it.
  if (hasStudent) {
    await uploadStudentFile(inserted.id, studentFile as File);
    update.student_html_path = studentPath(inserted.id);
  }
  if (hasTeacher) {
    await uploadTeacherFile(inserted.id, teacherFile as File);
    update.teacher_html_path = teacherPath(inserted.id);
    // Only mark ready once the teacher file is actually uploaded — a failed
    // upload must not leave a "ready" quiz with no file behind it.
    update.is_ready = true;
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

  // Student first, so the teacher file's STUDENT_URL is rewritten to point at
  // the up-to-date student public URL.
  if (hasStudent) {
    await uploadStudentFile(id, studentFile as File);
    update.student_html_path = studentPath(id);
  }
  if (hasTeacher) {
    await uploadTeacherFile(id, teacherFile as File);
    update.teacher_html_path = teacherPath(id);
    update.is_ready = true;
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
