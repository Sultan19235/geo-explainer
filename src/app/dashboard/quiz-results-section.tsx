"use client";

// Profile "Результаты тестов": the auto-saved outcomes of finished live
// rooms. Each row expands into the frozen scoreboard plus a per-question
// breakdown (when the room had stable question ids), and can be deleted —
// the counterweight to auto-saving everything.

import { useState, useTransition } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { deleteQuizResultAction } from "@/lib/quiz/quiz-result-actions";
import type { QuizResultSummary, ResultStudent } from "@/lib/quiz/quiz-result";

const MEDALS = ["🥇", "🥈", "🥉"];

function pctOf(s: ResultStudent) {
  return s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
}

function pctColor(pct: number) {
  return pct >= 70
    ? "text-emerald-600"
    : pct >= 40
      ? "text-amber-600"
      : "text-red-600";
}

function classAverage(students: ResultStudent[]) {
  const scored = students.filter((s) => s.total > 0);
  if (scored.length === 0) return null;
  return Math.round(
    scored.reduce((sum, s) => sum + pctOf(s), 0) / scored.length,
  );
}

export function QuizResultsSection({
  results,
}: {
  results: QuizResultSummary[];
}) {
  const { t, lang } = useT();
  const locale = lang === "ru" ? "ru-RU" : "kk-KZ";

  // Pinned to Kazakhstan time for the same server/browser hydration reason as
  // the profile dates above.
  const formatDateTime = (value: string) => {
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return "";
    return new Date(ts).toLocaleString(locale, {
      timeZone: "Asia/Almaty",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("profile_results")}
      </h2>
      {results.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="px-6 py-8 text-center">
            <p className="font-medium">{t("results_empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("results_empty_hint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/80">
          <CardContent className="divide-y divide-border/70 p-0">
            {results.map((result) => (
              <ResultRow
                key={result.id}
                result={result}
                dateLabel={formatDateTime(result.endedAt)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function ResultRow({
  result,
  dateLabel,
}: {
  result: QuizResultSummary;
  dateLabel: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const average = classAverage(result.students);

  const remove = () => {
    if (!window.confirm(t("results_delete_confirm")(result.title))) return;
    startTransition(async () => {
      const res = await deleteQuizResultAction({ id: result.id });
      if (!res.ok) window.alert(t("my_quizzes_error"));
    });
  };

  return (
    <div className={pending ? "opacity-50" : undefined}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-sm font-semibold">{result.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">{dateLabel}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">
              {t("results_students")(result.studentCount)}
            </span>
            {average !== null && (
              <>
                <span aria-hidden>·</span>
                <span
                  className={cn("shrink-0 font-semibold", pctColor(average))}
                >
                  {t("results_average")(average)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => setOpen((v) => !v)}
            className="flex h-8 items-center gap-1 rounded-md border border-transparent px-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground disabled:opacity-40"
          >
            {open ? t("results_hide") : t("results_details")}
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
          <button
            type="button"
            title={t("results_delete")}
            aria-label={t("results_delete")}
            disabled={pending}
            onClick={remove}
            className="grid size-8 place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-destructive disabled:opacity-40"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {open && <ResultDetail result={result} />}
    </div>
  );
}

function ResultDetail({ result }: { result: QuizResultSummary }) {
  const { t } = useT();

  // Per-question difficulty across the class — only pack rooms carry stable
  // question ids, and only v4+ student clients report the map.
  const questionStats = (result.questionIds ?? []).map((id, i) => {
    let correct = 0;
    let answered = 0;
    for (const s of result.students) {
      const v = s.answers?.[id];
      if (v !== undefined) {
        answered += 1;
        correct += v;
      }
    }
    return { id, n: i + 1, correct, answered };
  });
  const hasQuestionData = questionStats.some((q) => q.answered > 0);

  return (
    <div className="border-t border-dashed border-border/70 bg-muted/30 px-4 py-4">
      {/* frozen scoreboard */}
      <ol className="flex flex-col gap-1">
        {result.students.map((s, i) => {
          const pct = pctOf(s);
          return (
            <li
              key={`${s.name}-${i}`}
              className="flex items-center gap-3 rounded-lg bg-background/80 px-3 py-2 text-sm"
            >
              <span className="w-7 shrink-0 text-center font-bold tabular-nums text-muted-foreground">
                {MEDALS[i] ?? i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {s.name}
              </span>
              {s.tabSwitches > 0 && (
                <span className="shrink-0 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  {t("results_away")(s.tabSwitches)}
                </span>
              )}
              <span className="shrink-0 font-bold tabular-nums">
                {s.score}/{s.total}
              </span>
              <span
                className={cn(
                  "w-11 shrink-0 text-right font-bold tabular-nums",
                  pctColor(pct),
                )}
              >
                {pct}%
              </span>
            </li>
          );
        })}
      </ol>

      {/* per-question breakdown */}
      {hasQuestionData && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("results_by_question")}
          </h3>
          <div className="flex flex-col gap-1.5">
            {questionStats.map((q) => {
              const pct =
                q.answered > 0 ? Math.round((q.correct / q.answered) * 100) : 0;
              return (
                <div key={q.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 font-semibold text-muted-foreground">
                    {t("results_question_label")(q.n)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                    {q.answered > 0 && (
                      <div
                        className={cn(
                          "h-full rounded-full",
                          pct >= 70
                            ? "bg-emerald-500"
                            : pct >= 40
                              ? "bg-amber-500"
                              : "bg-red-500",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                  <span className="w-14 shrink-0 text-right font-bold tabular-nums">
                    {q.answered > 0 ? `${q.correct}/${q.answered}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
