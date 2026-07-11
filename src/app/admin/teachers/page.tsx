import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { almatyDayKey } from "@/lib/analytics/format";
import { fetchAllPages } from "@/lib/analytics/paged";
import type { DailyActivityPoint, UserSummaryRow } from "@/lib/analytics/types";
import { UsersListClient } from "./users-list-client";

const SPARKLINE_DAYS = 14;
const WEEK_MS = 7 * 86_400_000;

export default async function TeachersAnalyticsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const now = Date.now();

  const [summaryRes, quizRes, eventsRes] = await Promise.all([
    // Most-recently-active teachers first; those who never logged in sort last.
    admin
      .from("user_analytics_summary")
      .select(
        "user_id, full_name, email, is_admin, session_count, last_seen_at, first_seen_at, device_count, ip_count, grades, lesson_count, quiz_count",
      )
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .returns<UserSummaryRow[]>(),
    // quiz_results may not exist yet (migration pending) — on error the quiz
    // columns render as unavailable instead of breaking the page. Paged +
    // ordered: a plain select is silently clamped to ~1000 rows by PostgREST,
    // which would corrupt these aggregates without any error.
    fetchAllPages<{
      teacher_id: string;
      student_count: number | null;
      ended_at: string | null;
    }>((from, to) =>
      admin
        .from("quiz_results")
        .select("teacher_id, student_count, ended_at")
        .order("ended_at", { ascending: false })
        .range(from, to),
    ),
    fetchAllPages<{ user_id: string; occurred_at: string }>((from, to) =>
      admin
        .from("activity_events")
        .select("user_id, occurred_at")
        .gte(
          "occurred_at",
          new Date(now - SPARKLINE_DAYS * 86_400_000).toISOString(),
        )
        .order("occurred_at", { ascending: false })
        .range(from, to),
    ),
  ]);
  if (quizRes.truncated || eventsRes.truncated) {
    // Aggregates below are lower bounds now; at that volume they belong in a
    // SQL view — this warning is the tripwire to build it.
    console.warn(
      "[admin/teachers] analytics read hit its page budget — counts are lower bounds",
    );
  }

  const rows = summaryRes.data ?? [];

  // Per-teacher lifetime quiz aggregates + this-week totals in one pass.
  let quizAgg: Record<string, { runs: number; students: number }> | null = null;
  let quizzesWeek: number | null = null;
  let studentsWeek: number | null = null;
  if (!quizRes.error) {
    quizAgg = {};
    quizzesWeek = 0;
    studentsWeek = 0;
    for (const q of quizRes.rows) {
      const agg = (quizAgg[q.teacher_id] ??= { runs: 0, students: 0 });
      agg.runs += 1;
      agg.students += q.student_count ?? 0;
      if (q.ended_at && now - new Date(q.ended_at).getTime() <= WEEK_MS) {
        quizzesWeek += 1;
        studentsWeek += q.student_count ?? 0;
      }
    }
  }

  // Dense 14-day axis (Almaty days, oldest → today). Every sparkline shares it
  // so bars line up across rows; teachers with no events fall back client-side
  // to a shared all-zero row built from `days`.
  const days: string[] = [];
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    days.push(almatyDayKey(new Date(now - i * 86_400_000)));
  }
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const sparklines: Record<string, DailyActivityPoint[]> = {};
  for (const ev of eventsRes.error ? [] : eventsRes.rows) {
    const idx = dayIndex.get(almatyDayKey(ev.occurred_at));
    if (idx === undefined) continue;
    const points = (sparklines[ev.user_id] ??= days.map((day) => ({
      day,
      count: 0,
    })));
    points[idx].count += 1;
  }

  const todayKey = almatyDayKey(new Date(now));
  let activeToday = 0;
  let activeWeek = 0;
  for (const r of rows) {
    if (!r.last_seen_at) continue;
    if (almatyDayKey(r.last_seen_at) === todayKey) activeToday += 1;
    if (now - new Date(r.last_seen_at).getTime() <= WEEK_MS) activeWeek += 1;
  }

  return (
    <UsersListClient
      rows={rows}
      errorMessage={summaryRes.error?.message ?? null}
      quizAgg={quizAgg}
      sparklines={sparklines}
      days={days}
      totals={{ activeToday, activeWeek, quizzesWeek, studentsWeek }}
      serverNow={now}
    />
  );
}
