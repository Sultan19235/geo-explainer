"use client";

// Drill loop: setup (tick-tile options) → endless problems → keypad answer →
// instant exact check → feedback (wrong shows the right answer + one-line
// why, and the SAME problem is re-queued a few positions later) → next.
// Problems come from the topic's seeded generator, so a missed problem
// reappears verbatim — that re-queue is what makes this practice, not a test.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Flame, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/quiz/math-text";
import { DrillKeypad } from "@/components/quiz/drill-keypad";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n/context";
import { getDrillTopic } from "@/lib/drill/registry";
import { defaultConfig, type DrillConfig, type DrillProblem } from "@/lib/drill/types";
import { mulberry32 } from "@/lib/drill/rng";
import { equalsExact, parseExact, toKatex } from "@/lib/drill/exact";
import { drillT, locDrill } from "@/lib/drill/strings";

const RETRY_GAP = 3; // a missed problem comes back after this many others

type Current = { problem: DrillProblem; isRetry: boolean };
type PendingRetry = { problem: DrillProblem; dueIn: number };

export function DrillClient({ topicId }: { topicId: string }) {
  const topic = getDrillTopic(topicId);
  const { lang } = useLanguage();
  const t = drillT(lang);

  const [config, setConfig] = useState<DrillConfig>(() =>
    topic ? defaultConfig(topic) : {},
  );
  const [seed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const [seq, setSeq] = useState(0);
  const [retries, setRetries] = useState<PendingRetry[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean } | null>(null);
  const [stats, setStats] = useState({ done: 0, correct: 0, streak: 0 });

  if (!topic) return null;

  const fresh = (seqNum: number): DrillProblem => {
    const rng = mulberry32((seed + seqNum * 2654435761) >>> 0);
    return topic.generate(rng, config);
  };

  const serve = (next: Current) => {
    setCurrent(next);
    setInput("");
    setInvalid(false);
    setFeedback(null);
  };

  const start = () => {
    setStats({ done: 0, correct: 0, streak: 0 });
    setRetries([]);
    setSeq(1);
    serve({ problem: fresh(1), isRetry: false });
  };

  const advance = () => {
    const ticked = retries.map((r) => ({ ...r, dueIn: r.dueIn - 1 }));
    const dueIndex = ticked.findIndex((r) => r.dueIn <= 0);
    if (dueIndex >= 0) {
      const due = ticked[dueIndex];
      setRetries(ticked.filter((_, i) => i !== dueIndex));
      serve({ problem: due.problem, isRetry: true });
      return;
    }
    setRetries(ticked);
    const nextSeq = seq + 1;
    setSeq(nextSeq);
    serve({ problem: fresh(nextSeq), isRetry: false });
  };

  const submit = () => {
    if (!current) return;
    if (feedback) {
      advance();
      return;
    }
    const parsed = parseExact(input);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    const correct = equalsExact(parsed, current.problem.answer);
    setFeedback({ correct });
    setStats((s) => ({
      done: s.done + 1,
      correct: s.correct + (correct ? 1 : 0),
      streak: correct ? s.streak + 1 : 0,
    }));
    if (!correct) {
      setRetries((r) => [...r, { problem: current.problem, dueIn: RETRY_GAP }]);
    }
  };

  const toggleChoice = (groupId: string, choiceId: string) => {
    setConfig((cur) => {
      const selected = cur[groupId] ?? [];
      if (selected.includes(choiceId)) {
        if (selected.length === 1) return cur; // keep at least one ticked
        return { ...cur, [groupId]: selected.filter((id) => id !== choiceId) };
      }
      return { ...cur, [groupId]: [...selected, choiceId] };
    });
  };

  const inSetup = current === null;

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      <div className="mx-auto max-w-lg px-4 py-6">
        {/* header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link
            href="/labs/drill"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent"
            aria-label="←"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">
            {locDrill(topic.title, lang)}
          </h1>
          <LanguageToggle />
          {!inSetup && (
            <button
              type="button"
              onClick={() => setCurrent(null)}
              aria-label={t("settings_button")}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent"
            >
              <Settings2 className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {inSetup ? (
          /* ─── setup ─── */
          <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
            <h2 className="text-lg font-bold">{t("setup_title")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {locDrill(topic.subtitle, lang)}
            </p>

            {topic.options.map((group) => (
              <div key={group.id} className="mt-4">
                <div className="mb-1.5 text-sm font-semibold">
                  {locDrill(group.label, lang)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.choices.map((choice) => {
                    const active = (config[group.id] ?? []).includes(choice.id);
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => toggleChoice(group.id, choice.id)}
                        className={cn(
                          "relative rounded-xl border-[1.5px] px-3 py-2.5 text-left text-sm font-medium transition-colors",
                          active
                            ? "border-primary bg-accent text-primary"
                            : "border-border bg-background text-foreground hover:bg-accent",
                        )}
                      >
                        {locDrill(choice.label, lang)}
                        {active && (
                          <Check
                            className="absolute right-2 top-2 size-3.5"
                            aria-hidden
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={start}
              className="quiz-pop mt-5 h-12 w-full rounded-xl bg-primary text-base font-bold text-white active:bg-primary/85"
            >
              {t("setup_start")}
            </button>
          </div>
        ) : (
          /* ─── drill ─── */
          <>
            {/* stats */}
            <div className="mb-3 flex items-center gap-1.5 text-xs font-bold tabular-nums">
              <span className="rounded-full border border-border bg-card px-3 py-1">
                {t("stat_done")}: {stats.done}
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1 text-emerald-700">
                {t("stat_correct")}: {stats.correct}
              </span>
              {stats.streak >= 2 && (
                <span className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-700">
                  <Flame className="size-3.5" aria-hidden />
                  {stats.streak}
                </span>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
              {current.isRetry && (
                <span className="mb-2 inline-block rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                  {t("retry_badge")}
                </span>
              )}

              <div className="text-lg leading-relaxed">
                <MathText text={locDrill(current.problem.prompt, lang)} />
              </div>

              {/* answer display */}
              <div
                className={cn(
                  "mt-4 rounded-xl border-[1.5px] bg-background px-4 py-3 text-center",
                  invalid
                    ? "border-red-400 bg-red-50"
                    : feedback
                      ? feedback.correct
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-red-400 bg-red-50"
                      : "border-border",
                )}
              >
                <div
                  className={cn(
                    "min-h-9 font-math text-3xl tabular-nums",
                    input === "" && "text-muted-foreground/50",
                  )}
                >
                  {input === "" ? t("input_empty") : input}
                </div>
              </div>
              {invalid && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {t("invalid_input")}
                </p>
              )}

              {/* feedback */}
              {feedback &&
                (feedback.correct ? (
                  <div className="quiz-pop mt-3 rounded-xl border border-emerald-500 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700">
                    {t("correct")} ✅
                  </div>
                ) : (
                  <div className="quiz-pop mt-3 rounded-xl border border-red-400 bg-red-50 px-4 py-3 text-sm">
                    <div className="font-bold text-red-600">{t("wrong")}</div>
                    <div className="mt-1 text-foreground">
                      {t("right_answer")}{" "}
                      <MathText
                        className="text-base font-semibold"
                        text={`$${toKatex(current.problem.answer, current.problem.answerStyle)}$`}
                      />
                    </div>
                    {current.problem.solution && (
                      <div className="mt-1.5 text-muted-foreground">
                        <MathText
                          text={locDrill(current.problem.solution, lang)}
                        />
                      </div>
                    )}
                  </div>
                ))}

              <div className="mt-4">
                <DrillKeypad
                  keys={current.problem.keys}
                  value={input}
                  onChange={(next) => {
                    setInput(next);
                    setInvalid(false);
                  }}
                  onSubmit={submit}
                  submitLabel={feedback ? t("next_button") : t("check_button")}
                  submitMode={feedback ? "next" : "check"}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
