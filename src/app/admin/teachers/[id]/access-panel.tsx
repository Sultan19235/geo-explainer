"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/context";
import { formatDate } from "@/lib/analytics/format";
import { GRADES } from "@/lib/grades";
import {
  enrollmentIsActive,
  summarizeEnrollments,
  type EnrollmentRow,
} from "@/lib/teacher-access";
import { cn } from "@/lib/utils";
import {
  enrollTeacherAction,
  revokeEnrollmentAction,
  type EnrollmentPeriodInput,
} from "../actions";

// The admin view of one enrollment — the pure access fields plus identity and
// audit metadata for the history table.
export type AdminEnrollmentRow = EnrollmentRow & {
  id: string;
  package_label: string | null;
  created_at: string;
};

type PeriodChoice = "m1" | "m3" | "y1" | "unlimited" | "date";

const PERIODS: PeriodChoice[] = ["m1", "m3", "y1", "unlimited", "date"];

function toPeriodInput(
  choice: PeriodChoice,
  customDate: string,
): EnrollmentPeriodInput {
  if (choice === "m1") return { kind: "months", months: 1 };
  if (choice === "m3") return { kind: "months", months: 3 };
  if (choice === "y1") return { kind: "months", months: 12 };
  if (choice === "date") return { kind: "date", date: customDate };
  return { kind: "unlimited" };
}

export function AccessPanel({
  teacherId,
  enrollments,
  serverNow,
}: {
  teacherId: string;
  // null = the enrollments table doesn't exist yet (migration not applied).
  enrollments: AdminEnrollmentRow[] | null;
  serverNow: number;
}) {
  const { t, lang } = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [period, setPeriod] = useState<PeriodChoice>("y1");
  const [customDate, setCustomDate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (enrollments === null) {
    return (
      <p className="mb-8 text-muted-foreground">{t("ua_access_unavailable")}</p>
    );
  }

  // The server timestamp keeps SSR and hydration agreeing on what is expired;
  // an admin keeping the tab open for hours is fine — actions re-check anyway.
  const now = new Date(serverNow);
  const summaries = summarizeEnrollments(enrollments, now);

  const periodLabel = (key: PeriodChoice) => {
    if (key === "m1") return t("ua_enroll_month")(1);
    if (key === "m3") return t("ua_enroll_month")(3);
    if (key === "y1") return t("ua_enroll_year");
    if (key === "unlimited") return t("ua_enroll_unlimited");
    return t("ua_enroll_until_date");
  };

  const toggleGrade = (grade: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });

  const submit = () => {
    setError(null);
    if (selected.size === 0) {
      setError(t("ua_enroll_pick_grades"));
      return;
    }
    if (period === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      setError(t("ua_enroll_pick_date"));
      return;
    }
    startTransition(async () => {
      const result = await enrollTeacherAction({
        teacherId,
        gradeIds: [...selected].sort((a, b) => a - b),
        period: toPeriodInput(period, customDate),
        packageLabel: label,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      setLabel("");
      router.refresh();
    });
  };

  const revoke = (enrollmentId: string) => {
    if (!window.confirm(t("ua_revoke_confirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeEnrollmentAction({ enrollmentId, teacherId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const statusOf = (e: AdminEnrollmentRow) => {
    if (e.revoked_at) {
      return {
        label: t("ua_enr_status_revoked"),
        className: "text-muted-foreground",
      };
    }
    if (enrollmentIsActive(e, now)) {
      return { label: t("ua_enr_status_active"), className: "text-green-600" };
    }
    return { label: t("ua_enr_status_expired"), className: "text-amber-600" };
  };

  return (
    <div className="mb-8 space-y-4">
      {/* Current per-grade state */}
      {summaries.length === 0 ? (
        <p className="text-muted-foreground">{t("ua_access_none")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {summaries.map((s) => (
            <span
              key={s.gradeId}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                s.active
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-border text-muted-foreground",
              )}
            >
              {t("grade_badge")(s.gradeId)}
              {" · "}
              {s.active
                ? s.expiresAt
                  ? t("ua_access_until")(formatDate(s.expiresAt, lang))
                  : t("ua_access_unlimited")
                : t("ua_access_ended")(
                    s.expiresAt ? formatDate(s.expiresAt, lang) : "—",
                  )}
            </span>
          ))}
        </div>
      )}

      {/* Enroll form */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-medium">{t("ua_enroll_title")}</h3>

        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              {t("ua_enroll_grades")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {GRADES.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => toggleGrade(grade)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    selected.has(grade)
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t("grade_badge")(grade)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected(new Set(GRADES))}
                className="text-xs text-blue-600 hover:underline"
              >
                {t("ua_enroll_all_grades")}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {t("ua_enroll_clear")}
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              {t("ua_enroll_period")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {PERIODS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    period === key
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {periodLabel(key)}
                </button>
              ))}
              {period === "date" && (
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-40"
                />
              )}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              {t("ua_enroll_label")}
            </div>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
              placeholder={t("ua_enroll_label_hint")}
              className="max-w-md"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? t("ua_enroll_saving") : t("ua_enroll_submit")}
            </Button>
            {error && (
              <p className="whitespace-pre-wrap text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <h3 className="mb-2 text-sm font-medium">{t("ua_history_title")}</h3>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ua_history_none")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ua_history_col_grade")}</TableHead>
                <TableHead>{t("ua_history_col_period")}</TableHead>
                <TableHead>{t("ua_history_col_status")}</TableHead>
                <TableHead>{t("ua_history_col_label")}</TableHead>
                <TableHead>{t("ua_history_col_created")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map((e) => {
                const status = statusOf(e);
                const canRevoke = !e.revoked_at && enrollmentIsActive(e, now);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm tabular-nums">
                      {t("grade_badge")(e.grade_id)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(e.starts_at, lang)}
                      {" – "}
                      {e.expires_at
                        ? formatDate(e.expires_at, lang)
                        : t("ua_access_unlimited")}
                    </TableCell>
                    <TableCell
                      className={cn("text-sm font-medium", status.className)}
                    >
                      {status.label}
                      {e.revoked_at && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({formatDate(e.revoked_at, lang)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                      {e.package_label ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(e.created_at, lang)}
                    </TableCell>
                    <TableCell>
                      {canRevoke && (
                        <button
                          type="button"
                          onClick={() => revoke(e.id)}
                          disabled={isPending}
                          className="whitespace-nowrap text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          {t("ua_revoke")}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
