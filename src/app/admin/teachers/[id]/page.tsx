import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { almatyDayKey } from "@/lib/analytics/format";
import { fetchAllPages } from "@/lib/analytics/paged";
import type {
  ActivityRow,
  DailyActivityPoint,
  QuizSessionRow,
  SessionRow,
  UserSummaryRow,
} from "@/lib/analytics/types";
import { UserDetailClient } from "./user-detail-client";

const DAY_MS = 86_400_000;
const SPARKLINE_DAYS = 30;

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const now = Date.now();

  const [summaryRes, sessionsRes, eventsRes, quizRes, quizAggRes, sparkRes] =
    await Promise.all([
    admin
      .from("user_analytics_summary")
      .select(
        "user_id, full_name, email, is_admin, session_count, last_seen_at, first_seen_at, device_count, ip_count, grades, lesson_count, quiz_count",
      )
      .eq("user_id", id)
      .maybeSingle<UserSummaryRow>(),
    admin
      .from("login_sessions")
      .select(
        "id, started_at, last_seen_at, ended_at, end_reason, login_method, ip, browser, os, device_type, fingerprint",
      )
      .eq("user_id", id)
      .order("started_at", { ascending: false })
      .limit(100)
      .returns<SessionRow[]>(),
    admin
      .from("user_activity_detail")
      .select(
        "id, type, occurred_at, grade_id, topic_id, quiz_id, topic_name_kz, topic_name_ru, topic_slug, quiz_title_kz, quiz_title_ru, path",
      )
      .eq("user_id", id)
      .order("occurred_at", { ascending: false })
      .limit(200)
      .returns<ActivityRow[]>(),
    // select("*"): started_at may be missing on older deploys, so never list
    // columns explicitly here.
    admin
      .from("quiz_results")
      .select("*")
      .eq("teacher_id", id)
      .order("ended_at", { ascending: false })
      .limit(50)
      .returns<QuizSessionRow[]>(),
    // Separate light aggregate over ALL of the teacher's rows (autosave prunes
    // past 500) — the table above is capped at 50, which must not cap the
    // "quiz runs / students reached" stat tiles.
    admin
      .from("quiz_results")
      .select("student_count")
      .eq("teacher_id", id)
      .limit(500)
      .returns<Array<{ student_count: number | null }>>(),
    // Paged + ordered: PostgREST clamps single responses to ~1000 rows, and a
    // busy teacher can log more than that in 30 days.
    fetchAllPages<{ occurred_at: string }>(
      (from, to) =>
        admin
          .from("activity_events")
          .select("occurred_at")
          .eq("user_id", id)
          .gte(
            "occurred_at",
            new Date(now - SPARKLINE_DAYS * DAY_MS).toISOString(),
          )
          .order("occurred_at", { ascending: false })
          .range(from, to),
      5,
    ),
  ]);

  if (!summaryRes.data) {
    notFound();
  }

  // quiz_results may not exist yet (migration pending) — null tells the client
  // to say "unavailable" instead of "no quizzes run". Students are re-built
  // from known fields only: select("*") drags each student's per-question
  // answers map along, which the admin UI never reads — dropping it here keeps
  // multi-KB-per-student jsonb out of the RSC payload.
  const quizSessions = quizRes.error
    ? null
    : (quizRes.data ?? []).map((row) => ({
        ...row,
        students: (Array.isArray(row.students) ? row.students : []).map(
          (s) => ({
            name: s.name,
            score: s.score,
            total: s.total,
            finished: s.finished,
            tabSwitches: s.tabSwitches,
            awaySeconds: s.awaySeconds,
          }),
        ),
      }));
  const quizTotals =
    quizRes.error || quizAggRes.error
      ? null
      : (quizAggRes.data ?? []).reduce(
          (acc, row) => ({
            runs: acc.runs + 1,
            students: acc.students + (row.student_count ?? 0),
          }),
          { runs: 0, students: 0 },
        );

  // Dense 30-day series, oldest → newest ending today (Almaty days), so the
  // sparkline's accent bar is always "today" even when today is quiet.
  const countsByDay = new Map<string, number>();
  for (const e of sparkRes.error ? [] : sparkRes.rows) {
    const key = almatyDayKey(e.occurred_at);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }
  const dailyActivity: DailyActivityPoint[] = [];
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    const day = almatyDayKey(new Date(now - i * DAY_MS));
    dailyActivity.push({ day, count: countsByDay.get(day) ?? 0 });
  }

  return (
    <UserDetailClient
      summary={summaryRes.data}
      sessions={sessionsRes.data ?? []}
      events={eventsRes.data ?? []}
      quizSessions={quizSessions}
      quizTotals={quizTotals}
      dailyActivity={dailyActivity}
      serverNow={now}
    />
  );
}
