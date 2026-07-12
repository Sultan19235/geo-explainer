"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { GRADES } from "@/lib/grades";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_GRADES = new Set<number>(GRADES);
const LABEL_MAX = 200;
const MONTHS_MAX = 36;

export type EnrollmentActionResult = { ok: true } | { ok: false; error: string };

// How long the sold access lasts. "date" is the admin's calendar pick,
// inclusive: it becomes end-of-day Almaty time.
export type EnrollmentPeriodInput =
  | { kind: "months"; months: number }
  | { kind: "date"; date: string }
  | { kind: "unlimited" };

// Returns the expiry as ISO, null for unlimited, or undefined when invalid.
function resolveExpiry(period: EnrollmentPeriodInput): string | null | undefined {
  if (period.kind === "unlimited") return null;

  if (period.kind === "months") {
    const months = Number(period.months);
    if (!Number.isInteger(months) || months < 1 || months > MONTHS_MAX) {
      return undefined;
    }
    const expires = new Date();
    const dayOfMonth = expires.getDate();
    expires.setMonth(expires.getMonth() + months);
    // setMonth overflows short months (Jan 31 + 1 → Mar 3); clamp back to the
    // last day of the intended month so "1 month" never over-grants days.
    if (expires.getDate() !== dayOfMonth) expires.setDate(0);
    return expires.toISOString();
  }

  if (period.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period.date)) return undefined;
    // Inclusive day in the app's time zone (Asia/Almaty, UTC+5, no DST).
    const expires = new Date(`${period.date}T23:59:59+05:00`);
    const ts = expires.getTime();
    if (!Number.isFinite(ts) || ts <= Date.now()) return undefined;
    return expires.toISOString();
  }

  return undefined;
}

export async function enrollTeacherAction(input: {
  teacherId: string;
  gradeIds: number[];
  period: EnrollmentPeriodInput;
  packageLabel?: string;
}): Promise<EnrollmentActionResult> {
  const adminUser = await requireAdmin();

  if (!UUID_RE.test(input.teacherId)) {
    return { ok: false, error: "invalid teacher id" };
  }
  const gradeIds = [...new Set((input.gradeIds ?? []).map(Number))];
  if (gradeIds.length === 0 || !gradeIds.every((g) => VALID_GRADES.has(g))) {
    return { ok: false, error: "invalid grades" };
  }
  const expiresAt = resolveExpiry(input.period);
  if (expiresAt === undefined) {
    return { ok: false, error: "invalid period" };
  }
  const label = (input.packageLabel ?? "").trim().slice(0, LABEL_MAX) || null;

  const admin = createAdminClient();
  // One row per grade from the same sale, sharing the same label — the
  // admin can see (and revoke) the whole package as a unit.
  const { error } = await admin.from("teacher_grade_enrollments").insert(
    gradeIds.map((gradeId) => ({
      teacher_id: input.teacherId,
      grade_id: gradeId,
      expires_at: expiresAt,
      package_label: label,
      created_by: adminUser.id,
    })),
  );
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/teachers/${input.teacherId}`);
  revalidatePath("/admin/teachers");
  return { ok: true };
}

export async function revokeEnrollmentAction(input: {
  enrollmentId: string;
  teacherId: string;
}): Promise<EnrollmentActionResult> {
  await requireAdmin();

  if (!UUID_RE.test(input.enrollmentId) || !UUID_RE.test(input.teacherId)) {
    return { ok: false, error: "invalid id" };
  }

  const admin = createAdminClient();
  // Soft revoke keeps the row as the audit trail; already-revoked rows are
  // left untouched so the original revocation time survives double clicks.
  const { error } = await admin
    .from("teacher_grade_enrollments")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.enrollmentId)
    .eq("teacher_id", input.teacherId)
    .is("revoked_at", null);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/teachers/${input.teacherId}`);
  revalidatePath("/admin/teachers");
  return { ok: true };
}
