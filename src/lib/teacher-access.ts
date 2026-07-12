import type { SupabaseClient } from "@supabase/supabase-js";

// A teacher's access to a grade's paid content is a set of enrollment rows
// (teacher_grade_enrollments): each row grants one grade for one period, and
// every sale/extension adds a row. The legacy model — teachers.granted_grades
// + one shared teachers.access_expires_at — is kept only as a fallback for a
// database where migration 20260712090000 hasn't been applied yet; the
// migration backfills it into enrollments.

// Legacy shape, kept module-private so nothing new wires against it —
// hasGradeAccess/loadTeacherAccess are the supported entry points.
type TeacherAccessRow = {
  granted_grades: unknown;
  access_expires_at: string | null;
};

export type EnrollmentRow = {
  grade_id: number;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export type TeacherAccess = {
  isAdmin: boolean;
  // null = the enrollments table doesn't exist yet (legacy database); the
  // access check then falls back to the legacy columns below.
  enrollments: EnrollmentRow[] | null;
  legacy: TeacherAccessRow;
};

// Per-grade rollup for display (dashboard cards, admin panel chips).
export type GradeAccessSummary = {
  gradeId: number;
  active: boolean;
  // Active: null = unlimited, else the latest expiry among active rows.
  // Inactive: when the access ended (latest expiry/revocation), for "expired
  // on …" labels; null only in degenerate cases.
  expiresAt: string | null;
};

function teacherHasGradeAccess(
  teacher: TeacherAccessRow | null | undefined,
  gradeId: number,
  now = new Date(),
) {
  if (!teacher) return false;

  if (teacher.access_expires_at) {
    const expiresAt = Date.parse(teacher.access_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      return false;
    }
  }

  if (!Array.isArray(teacher.granted_grades)) {
    return false;
  }

  return teacher.granted_grades.some((grade) => Number(grade) === gradeId);
}

export function enrollmentIsActive(e: EnrollmentRow, now = new Date()) {
  if (e.revoked_at) return false;

  const startsAt = Date.parse(e.starts_at);
  if (Number.isFinite(startsAt) && startsAt > now.getTime()) return false;

  if (e.expires_at) {
    const expiresAt = Date.parse(e.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      return false;
    }
  }

  return true;
}

export function hasGradeAccess(
  access: TeacherAccess | null | undefined,
  gradeId: number,
  now = new Date(),
) {
  if (!access) return false;

  if (access.enrollments) {
    return access.enrollments.some(
      (e) => Number(e.grade_id) === gradeId && enrollmentIsActive(e, now),
    );
  }

  return teacherHasGradeAccess(access.legacy, gradeId, now);
}

// Latest of a row's "end" moments — expiry for expired rows, revocation for
// revoked ones — used for the "expired on …" label of inactive grades.
function enrollmentEndedAt(e: EnrollmentRow): string | null {
  return e.revoked_at ?? e.expires_at;
}

export function summarizeGradeAccess(
  access: TeacherAccess | null | undefined,
  now = new Date(),
): GradeAccessSummary[] {
  if (!access) return [];

  if (!access.enrollments) {
    // Legacy database: every granted grade shares the one expiry date.
    const legacy = access.legacy;
    const grades = Array.isArray(legacy.granted_grades)
      ? [...new Set(legacy.granted_grades.map(Number))].filter(Number.isFinite)
      : [];
    return grades
      .sort((a, b) => a - b)
      .map((gradeId) => ({
        gradeId,
        active: teacherHasGradeAccess(legacy, gradeId, now),
        expiresAt: legacy.access_expires_at,
      }));
  }

  return summarizeEnrollments(access.enrollments, now);
}

// Per-grade rollup straight from enrollment rows — what the admin panel uses,
// where no legacy envelope exists.
export function summarizeEnrollments(
  enrollments: EnrollmentRow[],
  now = new Date(),
): GradeAccessSummary[] {
  const byGrade = new Map<number, EnrollmentRow[]>();
  for (const e of enrollments) {
    const gradeId = Number(e.grade_id);
    if (!Number.isFinite(gradeId)) continue;
    const rows = byGrade.get(gradeId) ?? [];
    rows.push(e);
    byGrade.set(gradeId, rows);
  }

  const summaries: GradeAccessSummary[] = [];
  for (const [gradeId, rows] of byGrade) {
    const active = rows.filter((e) => enrollmentIsActive(e, now));
    if (active.length > 0) {
      const unlimited = active.some((e) => !e.expires_at);
      const latest = active
        .map((e) => e.expires_at)
        .filter((v): v is string => !!v)
        .sort()
        .pop();
      summaries.push({
        gradeId,
        active: true,
        expiresAt: unlimited ? null : (latest ?? null),
      });
    } else {
      const endedAt = rows
        .map(enrollmentEndedAt)
        .filter((v): v is string => !!v)
        .sort()
        .pop();
      summaries.push({ gradeId, active: false, expiresAt: endedAt ?? null });
    }
  }

  return summaries.sort((a, b) => a.gradeId - b.gradeId);
}

// The !teacher_id hint is load-bearing: the table has TWO foreign keys to
// teachers (teacher_id and created_by), and an unhinted embed makes PostgREST
// fail the whole select as ambiguous (PGRST201).
const ACCESS_SELECT =
  "is_admin, granted_grades, access_expires_at, teacher_grade_enrollments!teacher_id (grade_id, starts_at, expires_at, revoked_at)";

// PostgREST errors that mean "the enrollments migration isn't applied here":
// PGRST200 = unknown embedded relationship, 42P01 = relation does not exist.
// Only these may trigger the legacy fallback — any other failure fails closed
// (null → no access), matching the old behavior; falling back on arbitrary
// errors would grade against the frozen legacy columns (stale after revokes).
const MISSING_ENROLLMENTS_CODES = new Set(["PGRST200", "42P01"]);

type TeacherAccessQueryRow = {
  is_admin: boolean | null;
  granted_grades: unknown;
  access_expires_at: string | null;
  teacher_grade_enrollments: EnrollmentRow[] | null;
};

/**
 * Loads everything the access gates need about one teacher in a single query:
 * is_admin, the active enrollments (embedded via the FK), and the legacy
 * columns. Works with the anon server client (RLS limits it to the caller's
 * own row) and with the service-role client alike. Returns null when the
 * teacher row doesn't exist.
 */
export async function loadTeacherAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeacherAccess | null> {
  const { data, error } = await supabase
    .from("teachers")
    .select(ACCESS_SELECT)
    .eq("id", userId)
    .maybeSingle<TeacherAccessQueryRow>();

  if (!error) {
    if (!data) return null;
    return {
      isAdmin: !!data.is_admin,
      enrollments: Array.isArray(data.teacher_grade_enrollments)
        ? data.teacher_grade_enrollments
        : [],
      legacy: {
        granted_grades: data.granted_grades,
        access_expires_at: data.access_expires_at,
      },
    };
  }

  if (!MISSING_ENROLLMENTS_CODES.has(error.code)) {
    return null;
  }

  // Legacy fallback for a database without the enrollments migration yet —
  // the embed makes the whole select fail there. Same pattern as
  // topic-access's lesson_topic_id fallback.
  const legacy = await supabase
    .from("teachers")
    .select("is_admin, granted_grades, access_expires_at")
    .eq("id", userId)
    .maybeSingle<Omit<TeacherAccessQueryRow, "teacher_grade_enrollments">>();

  if (!legacy.data) return null;
  return {
    isAdmin: !!legacy.data.is_admin,
    enrollments: null,
    legacy: {
      granted_grades: legacy.data.granted_grades,
      access_expires_at: legacy.data.access_expires_at,
    },
  };
}
