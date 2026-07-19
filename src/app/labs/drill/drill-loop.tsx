"use client";

// The shared drill experience: setup tick-tiles → endless problems → keypad →
// exact check → feedback (+ number-line reveal) → re-queue of misses. Problem
// SOURCE is abstracted: the registry client passes a sync generate closure,
// the file previewer pre-generates a batch in the sandbox worker via
// `prepare` and serves from it — the loop itself can stay fully synchronous.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Flame, Loader2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/quiz/math-text";
import { DrillKeypad } from "@/components/quiz/drill-keypad";
import { DrillVisualView } from "@/components/quiz/drill-visual";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n/context";
import type {
  DrillConfig,
  DrillOptionGroup,
  DrillProblem,
  DrillText,
} from "@/lib/drill/types";
import { equalsExact, parseExact, toKatex } from "@/lib/drill/exact";
import { drillT, locDrill } from "@/lib/drill/strings";

const RETRY_GAP = 3; // a missed problem comes back after this many others

type Current = { problem: DrillProblem; isRetry: boolean };
type PendingRetry = { problem: DrillProblem; dueIn: number };

function configFromDefaults(options: DrillOptionGroup[]): DrillConfig {
  const config: DrillConfig = {};
  for (const group of options) config[group.id] = [...group.defaults];
  return config;
}

export function DrillLoop({
  title,
  subtitle,
  options,
  backHref,
  makeProblem,
  prepare,
}: {
  title: DrillText;
  subtitle: DrillText;
  options: DrillOptionGroup[];
  backHref: string;
  /** Sync problem for a sequence number — called only after `prepare` resolved. */
  makeProblem: (seq: number, config: DrillConfig, seed: number) => DrillProblem;
  /** Optional async step on Бастау (e.g. batch-generate in the worker);
   * resolves to error strings to show, or null on success. */
  prepare?: (config: DrillConfig, seed: number) => Promise<string[] | null>;
}) {
  const { lang } = useLanguage();
  const t = drillT(lang);

  const [config, setConfig] = useState<DrillConfig>(() => configFromDefaults(options));
  const [seed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const [seq, setSeq] = useState(0);
  const [retries, setRetries] = useState<PendingRetry[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean } | null>(null);
  const [stats, setStats] = useState({ done: 0, correct: 0, streak: 0 });
  const [preparing, setPreparing] = useState(false);
  const [prepareErrors, setPrepareErrors] = useState<string[]>([]);

  const serve = (next: Current) => {
    setCurrent(next);
    setInput("");
    setInvalid(false);
    setFeedback(null);
  };

  const start = async () => {
    setPrepareErrors([]);
    if (prepare) {
      setPreparing(true);
      const errors = await prepare(config, seed);
      setPreparing(false);
      if (errors && errors.length > 0) {
        setPrepareErrors(errors);
        return;
      }
    }
    setStats({ done: 0, correct: 0, streak: 0 });
    setRetries([]);
    setSeq(1);
    serve({ problem: makeProblem(1, config, seed), isRetry: false });
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
    serve({ problem: makeProblem(nextSeq, config, seed), isRetry: false });
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
            href={backHref}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent"
            aria-label="←"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">
            {locDrill(title, lang)}
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
              {locDrill(subtitle, lang)}
            </p>

            {options.map((group) => (
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

            {prepareErrors.length > 0 && (
              <div className="mt-4 space-y-1 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {prepareErrors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => void start()}
              disabled={preparing}
              className="quiz-pop mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white active:bg-primary/85 disabled:opacity-60"
            >
              {preparing && <Loader2 className="size-4 animate-spin" aria-hidden />}
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

              {current.problem.visual && (
                <div className="mt-3 rounded-xl border border-border bg-background px-2 py-2">
                  <DrillVisualView
                    visual={current.problem.visual}
                    revealed={feedback !== null}
                  />
                </div>
              )}

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
