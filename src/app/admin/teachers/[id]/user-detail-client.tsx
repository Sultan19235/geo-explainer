"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/context";
import {
  formatDateTime,
  formatDuration,
  formatLastSeen,
  SHARING_DEVICE_THRESHOLD,
} from "@/lib/analytics/format";
import type {
  ActivityRow,
  SessionRow,
  UserSummaryRow,
} from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

export function UserDetailClient({
  summary,
  sessions,
  events,
}: {
  summary: UserSummaryRow;
  sessions: SessionRow[];
  events: ActivityRow[];
}) {
  const { t, lang } = useT();

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(s.started_at, lang)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDuration(s.started_at, s.ended_at ?? s.last_seen_at, t)}
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
                        s.ended_at ? "text-muted-foreground" : "text-green-600",
                      )}
                    >
                      {s.ended_at ? t("ua_status_ended") : t("ua_status_active")}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-3 text-lg font-medium">{t("ua_activity_title")}</h2>
      {events.length === 0 ? (
        <p className="text-muted-foreground">{t("ua_none")}</p>
      ) : (
        <ol className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 text-sm">
              <span className="w-32 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(e.occurred_at, lang)}
              </span>
              <span>{eventLabel(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
