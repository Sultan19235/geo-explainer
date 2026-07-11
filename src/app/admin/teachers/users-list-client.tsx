"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  formatLastSeen,
  isOnline,
  SHARING_DEVICE_THRESHOLD,
} from "@/lib/analytics/format";
import type { DailyActivityPoint, UserSummaryRow } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

// null when quiz_results is unavailable (migration not applied yet); teachers
// absent from the record simply have no finished quiz runs.
type QuizAgg = Record<string, { runs: number; students: number }>;

type Totals = {
  activeToday: number;
  activeWeek: number;
  quizzesWeek: number | null;
  studentsWeek: number | null;
};

type SortKey =
  | "last_seen"
  | "sessions"
  | "lessons"
  | "quizzes"
  | "quiz_runs"
  | "students_reached"
  | "devices";

function sortValue(
  r: UserSummaryRow,
  key: SortKey,
  quizAgg: QuizAgg | null,
): number | null {
  switch (key) {
    case "last_seen":
      return r.last_seen_at ? new Date(r.last_seen_at).getTime() : null;
    case "sessions":
      return r.session_count;
    case "lessons":
      return r.lesson_count;
    case "quizzes":
      return r.quiz_count;
    case "quiz_runs":
      return quizAgg ? (quizAgg[r.user_id]?.runs ?? 0) : null;
    case "students_reached":
      return quizAgg ? (quizAgg[r.user_id]?.students ?? 0) : null;
    case "devices":
      return r.device_count;
  }
}

export function UsersListClient({
  rows,
  errorMessage,
  quizAgg,
  sparklines,
  days,
  totals,
  serverNow,
}: {
  rows: UserSummaryRow[];
  errorMessage: string | null;
  quizAgg: QuizAgg | null;
  sparklines: Record<string, DailyActivityPoint[]>;
  days: string[];
  totals: Totals;
  serverNow: number;
}) {
  const { t, lang } = useT();

  // null until mounted so SSR and first client render agree; then ticks so
  // "last active" relative labels stay fresh.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Status decisions (online dot) must not flip between SSR and hydration, so
  // they lean on the server-supplied timestamp until the mount tick lands.
  const nowMs = now ?? serverNow;

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "last_seen",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sort.key, quizAgg);
      const vb = sortValue(b, sort.key, quizAgg);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // nulls last regardless of direction
      if (vb === null) return -1;
      return (va - vb) * factor;
    });
  }, [rows, sort, quizAgg]);

  // Shared all-zero fallback for teachers with no events in the window.
  const zeroPoints = useMemo<DailyActivityPoint[]>(
    () => days.map((day) => ({ day, count: 0 })),
    [days],
  );

  if (errorMessage) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">{t("ua_title")}</h1>
        <p className="text-sm text-red-600">
          {t("error_prefix")}: {errorMessage}
        </p>
      </div>
    );
  }

  const tiles: Array<{ label: string; value: string }> = [
    { label: t("ua_totals_active_today"), value: String(totals.activeToday) },
    { label: t("ua_totals_active_week"), value: String(totals.activeWeek) },
    {
      label: t("ua_totals_quizzes_week"),
      value: totals.quizzesWeek === null ? "—" : String(totals.quizzesWeek),
    },
    {
      label: t("ua_totals_students_week"),
      value: totals.studentsWeek === null ? "—" : String(totals.studentsWeek),
    },
  ];

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" },
    );

  const sortableHead = (key: SortKey, label: string, alignRight = false) => {
    const active = sort.key === key;
    return (
      <TableHead
        className={cn("cursor-pointer select-none", alignRight && "text-right")}
        aria-sort={
          active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
        }
        onClick={() => toggleSort(key)}
      >
        {label}
        {active && (
          <span className="ml-1 text-muted-foreground">
            {sort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </TableHead>
    );
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("ua_title")}</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((s) => (
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

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("ua_none")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ua_col_user")}</TableHead>
              {sortableHead("last_seen", t("ua_col_last_seen"))}
              {sortableHead("sessions", t("ua_col_sessions"), true)}
              <TableHead>{t("ua_col_grades")}</TableHead>
              {sortableHead("lessons", t("ua_col_lessons"), true)}
              {sortableHead("quizzes", t("ua_col_quizzes"), true)}
              {sortableHead("quiz_runs", t("ua_col_quiz_runs"), true)}
              {sortableHead(
                "students_reached",
                t("ua_col_students_reached"),
                true,
              )}
              <TableHead>{t("ua_col_trend")}</TableHead>
              {sortableHead("devices", t("ua_col_devices"), true)}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              const shared = r.device_count >= SHARING_DEVICE_THRESHOLD;
              const grades = (r.grades ?? []).slice().sort((a, b) => a - b);
              const online = isOnline(r.last_seen_at, nowMs);
              const agg = quizAgg?.[r.user_id];
              return (
                <TableRow key={r.user_id}>
                  <TableCell>
                    <div className="font-medium">
                      {online && (
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-500"
                          aria-hidden
                        />
                      )}
                      {r.full_name || r.email || r.user_id.slice(0, 8)}
                    </div>
                    {r.full_name && r.email && (
                      <div className="text-xs text-muted-foreground">
                        {r.email}
                      </div>
                    )}
                    {r.is_admin && (
                      <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {t("ua_admin_badge")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {online ? (
                      <span className="font-medium text-green-600">
                        {t("ua_online_now")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {formatLastSeen(r.last_seen_at, t, lang, now)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.session_count}
                  </TableCell>
                  <TableCell className="text-sm">
                    {grades.length ? grades.join(", ") : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.lesson_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.quiz_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quizAgg === null ? "—" : (agg?.runs ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quizAgg === null ? "—" : (agg?.students ?? 0)}
                  </TableCell>
                  <TableCell>
                    <ActivitySparkline
                      points={sparklines[r.user_id] ?? zeroPoints}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      shared && "font-semibold text-amber-600",
                    )}
                  >
                    {shared ? `⚠ ${r.device_count}` : r.device_count}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/teachers/${r.user_id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {t("ua_view")}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
