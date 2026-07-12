"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActivitySparkline } from "@/components/admin/activity-sparkline";
import { useT } from "@/lib/i18n/context";
import {
  almatyDayKey,
  formatDateTime,
  formatDayLabel,
  formatDuration,
  formatLastSeen,
  formatTime,
  sessionStatus,
  SHARING_DEVICE_THRESHOLD,
} from "@/lib/analytics/format";
import type {
  ActivityRow,
  DailyActivityPoint,
  QuizSessionRow,
  SessionRow,
  UserSummaryRow,
} from "@/lib/analytics/types";
import { cn } from "@/lib/utils";
import { AccessPanel, type AdminEnrollmentRow } from "./access-panel";

type EventFilter = "all" | ActivityRow["type"];

// One rendered activity entry: a run of consecutive identical events folded
// together. `event` is the newest of the run (events arrive newest-first).
type CollapsedEntry = {
  event: ActivityRow;
  count: number;
  newestAt: string;
  oldestAt: string;
};

export function UserDetailClient({
  summary,
  sessions,
  events,
  quizSessions,
  quizTotals,
  dailyActivity,
  enrollments,
  serverNow,
}: {
  summary: UserSummaryRow;
  sessions: SessionRow[];
  events: ActivityRow[];
  quizSessions: QuizSessionRow[] | null;
  quizTotals: { runs: number; students: number } | null;
  dailyActivity: DailyActivityPoint[];
  enrollments: AdminEnrollmentRow[] | null;
  serverNow: number;
}) {
  const { t, lang } = useT();

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Status/day decisions must match between SSR and hydration, so they never
  // read Date.now() directly — the server page supplies the first "now".
  const nowMs = now ?? serverNow;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [filter, setFilter] = useState<EventFilter>("all");

  const shared = summary.device_count >= SHARING_DEVICE_THRESHOLD;
  const grades = (summary.grades ?? []).slice().sort((a, b) => a - b);
  const name =
    summary.full_name || summary.email || summary.user_id.slice(0, 8);

  const methodLabel = (m: SessionRow["login_method"]) =>
    m === "password"
      ? t("ua_method_password")
      : m === "oauth"
        ? t("ua_method_oauth")
        : m === "signup"
          ? t("ua_method_signup")
          : "—";

  const deviceLabel = (s: SessionRow) =>
    [s.browser, s.os, s.device_type].filter(Boolean).join(" · ") || "—";

  const eventLabel = (e: ActivityRow) => {
    if (e.type === "view_grade") {
      return t("ua_event_view_grade")(e.grade_id ?? 0);
    }
    if (e.type === "view_lesson") {
      const topic =
        lang === "ru" ? e.topic_name_ru ?? e.topic_name_kz : e.topic_name_kz;
      return topic
        ? `${t("ua_event_view_lesson")}: ${topic}`
        : t("ua_event_view_lesson");
    }
    const quiz =
      lang === "ru" ? e.quiz_title_ru ?? e.quiz_title_kz : e.quiz_title_kz;
    return quiz ? `${t("ua_event_open_quiz")}: ${quiz}` : t("ua_event_open_quiz");
  };

  const stats: Array<{ label: string; value: string | number }> = [
    { label: t("ua_col_sessions"), value: summary.session_count },
    {
      label: t("ua_col_grades"),
      value: grades.length ? grades.join(", ") : "—",
    },
    { label: t("ua_col_lessons"), value: summary.lesson_count },
    { label: t("ua_col_quizzes"), value: summary.quiz_count },
    { label: t("ua_col_devices"), value: summary.device_count },
    ...(quizTotals
      ? [
          { label: t("ua_col_quiz_runs"), value: quizTotals.runs },
          {
            label: t("ua_col_students_reached"),
            value: quizTotals.students,
          },
        ]
      : []),
    {
      label: t("ua_rollup_first_seen"),
      value: summary.first_seen_at
        ? formatDateTime(summary.first_seen_at, lang)
        : t("ua_never"),
    },
    {
      label: t("ua_rollup_last_seen"),
      value: formatLastSeen(summary.last_seen_at, t, lang, now),
    },
  ];

  // Mean of each student's own percentage, not total points — a 2-question
  // quiz and a 20-question quiz weigh the same per student.
  const avgPercent = (q: QuizSessionRow): number | null => {
    const scored = (Array.isArray(q.students) ? q.students : []).filter(
      (st) => st.total > 0,
    );
    if (scored.length === 0) return null;
    return Math.round(
      (scored.reduce((sum, st) => sum + st.score / st.total, 0) /
        scored.length) *
        100,
    );
  };

  const filters: Array<{ key: EventFilter; label: string }> = [
    { key: "all", label: t("ua_filter_all") },
    { key: "view_grade", label: t("ua_filter_grades") },
    { key: "view_lesson", label: t("ua_filter_lessons") },
    { key: "open_quiz", label: t("ua_filter_quizzes") },
  ];

  const filteredEvents =
    filter === "all" ? events : events.filter((e) => e.type === filter);

  const collapsed: CollapsedEntry[] = [];
  for (const e of filteredEvents) {
    const last = collapsed[collapsed.length - 1];
    if (
      last &&
      last.event.type === e.type &&
      last.event.grade_id === e.grade_id &&
      last.event.topic_id === e.topic_id &&
      last.event.quiz_id === e.quiz_id &&
      // A run must not straddle midnight — day groups are keyed off the run's
      // newest event, which would silently pull yesterday's tail into today.
      almatyDayKey(e.occurred_at) === almatyDayKey(last.newestAt)
    ) {
      last.count += 1;
      last.oldestAt = e.occurred_at; // newest-first: each next event is older
    } else {
      collapsed.push({
        event: e,
        count: 1,
        newestAt: e.occurred_at,
        oldestAt: e.occurred_at,
      });
    }
  }

  const dayGroups: Array<{ day: string; entries: CollapsedEntry[] }> = [];
  for (const entry of collapsed) {
    const day = almatyDayKey(entry.newestAt);
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else dayGroups.push({ day, entries: [entry] });
  }

  const todayKey = almatyDayKey(new Date(nowMs));
  const yesterdayKey = almatyDayKey(new Date(nowMs - 86_400_000));
  const dayHeader = (day: string) =>
    day === todayKey
      ? t("ua_today")
      : day === yesterdayKey
        ? t("ua_yesterday")
        : formatDayLabel(day, lang);

  const timeLabel = (entry: CollapsedEntry) => {
    const newest = formatTime(entry.newestAt, lang);
    const oldest = formatTime(entry.oldestAt, lang);
    return oldest === newest ? newest : `${oldest}–${newest}`;
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/teachers"
          className="text-sm text-muted-foreground hover:underline"
        >
          {t("ua_back")}
        </Link>
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{name}</h1>
        {summary.is_admin && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
            {t("ua_admin_badge")}
          </span>
        )}
      </div>
      {summary.full_name && summary.email && (
        <p className="mb-6 text-sm text-muted-foreground">{summary.email}</p>
      )}

      {shared && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ {t("ua_sharing_warning")(summary.device_count)}
        </div>
      )}

      <h2 className="mb-3 text-lg font-medium">{t("ua_access_title")}</h2>
      <AccessPanel
        teacherId={summary.user_id}
        enrollments={enrollments}
        serverNow={serverNow}
      />

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-lg border p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("ua_activity_30d")}
        </div>
        <ActivitySparkline points={dailyActivity} className="mt-2" />
      </div>

      <h2 className="mb-3 text-lg font-medium">{t("ua_quiz_sessions_title")}</h2>
      {quizSessions === null ? (
        <p className="mb-8 text-muted-foreground">{t("ua_qs_unavailable")}</p>
      ) : quizSessions.length === 0 ? (
        <p className="mb-8 text-muted-foreground">{t("ua_qs_none")}</p>
      ) : (
        <div className="mb-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ua_sess_started")}</TableHead>
                <TableHead>{t("ua_qs_col_quiz")}</TableHead>
                <TableHead>{t("ua_sess_duration")}</TableHead>
                <TableHead>{t("ua_qs_col_students")}</TableHead>
                <TableHead>{t("ua_qs_col_avg")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quizSessions.map((q) => {
                const students = Array.isArray(q.students) ? q.students : [];
                const avg = avgPercent(q);
                const open = expanded.has(q.id);
                return (
                  <Fragment key={q.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(q.started_at ?? q.ended_at, lang)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{q.title}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {t("ua_room_code")}: {q.room_code}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {q.started_at
                          ? formatDuration(q.started_at, q.ended_at, t)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {q.student_count}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {avg === null ? "—" : `${avg}%`}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="whitespace-nowrap text-xs text-blue-600 hover:underline"
                          onClick={() => toggleExpanded(q.id)}
                        >
                          {open
                            ? t("ua_qs_hide_students")
                            : t("ua_qs_show_students")}
                        </button>
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          {students.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {t("ua_none")}
                            </p>
                          ) : (
                            <ol className="space-y-1">
                              {students.map((st, i) => (
                                <li
                                  key={`${q.id}-${i}`}
                                  className="flex items-baseline gap-3 text-sm"
                                >
                                  <span className="w-48 truncate">
                                    {st.name}
                                  </span>
                                  <span className="tabular-nums">
                                    {st.score}/{st.total}
                                  </span>
                                  <span className="tabular-nums text-muted-foreground">
                                    {st.total > 0
                                      ? `${Math.round((st.score / st.total) * 100)}%`
                                      : "—"}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-3 text-lg font-medium">{t("ua_sessions_title")}</h2>
      {sessions.length === 0 ? (
        <p className="mb-8 text-muted-foreground">{t("ua_none")}</p>
      ) : (
        <div className="mb-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ua_sess_started")}</TableHead>
                <TableHead>{t("ua_sess_duration")}</TableHead>
                <TableHead>{t("ua_sess_method")}</TableHead>
                <TableHead>{t("ua_sess_device")}</TableHead>
                <TableHead>{t("ua_sess_ip")}</TableHead>
                <TableHead>{t("ua_sess_status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => {
                const status = sessionStatus(s, nowMs);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateTime(s.started_at, lang)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDuration(
                        s.started_at,
                        s.ended_at ?? s.last_seen_at,
                        t,
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {methodLabel(s.login_method)}
                    </TableCell>
                    <TableCell className="text-sm">{deviceLabel(s)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.ip ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs",
                          status === "active"
                            ? "text-green-600"
                            : status === "dropped"
                              ? "text-amber-600"
                              : "text-muted-foreground",
                        )}
                      >
                        {status === "active"
                          ? t("ua_status_active")
                          : status === "dropped"
                            ? t("ua_status_dropped")
                            : t("ua_status_ended")}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-3 text-lg font-medium">{t("ua_activity_title")}</h2>
      {events.length === 0 ? (
        <p className="text-muted-foreground">{t("ua_none")}</p>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  filter === f.key
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {dayGroups.length === 0 ? (
            <p className="mt-4 text-muted-foreground">{t("ua_none")}</p>
          ) : (
            dayGroups.map((g) => (
              <div key={g.day}>
                <div className="mt-4 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {dayHeader(g.day)}
                </div>
                <ol className="space-y-1.5">
                  {g.entries.map((entry) => (
                    <li
                      key={entry.event.id}
                      className="flex items-baseline gap-3 text-sm"
                    >
                      <span className="w-32 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {timeLabel(entry)}
                      </span>
                      <span>
                        {eventLabel(entry.event)}
                        {entry.count > 1 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {t("ua_times")(entry.count)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
