"use client";

// Student live-quiz page: join → wait for teacher → answer → results.
// Kazakh-only on purpose — students open this by QR with no account and no
// language toggle, same as the uploaded HTML page this replaces.

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, Flame, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Confetti } from "@/components/quiz/confetti";
import { GraphCanvas } from "@/components/quiz/graph-canvas";
import { MathFormula } from "@/components/quiz/math-formula";
import { ParabolaMark } from "@/components/quiz/parabola-mark";
import { TimerPill } from "@/components/quiz/timer-pill";
import { cn } from "@/lib/utils";
import {
  generateQuestion,
  isSectionId,
  SECTION_IDS,
  type Question,
  type SectionId,
} from "@/lib/quiz/quadratic";
import {
  useLiveSession,
  type JoinError,
  type QuizStats,
} from "@/lib/quiz/use-live-session";

const JOIN_ERRORS: Record<JoinError, string> = {
  name: "Атыңызды жазыңыз",
  code: "Бөлме кодын енгізіңіз",
  not_found: "Бөлме табылмады. Кодты тексеріңіз.",
  ended: "Бұл сабақ аяқталған.",
  network: "Серверге қосылу мүмкін болмады. Қайталап көріңіз.",
};

export function QuizClient() {
  const searchParams = useSearchParams();
  const urlCode = (searchParams.get("code") ?? "").toUpperCase();
  const urlSections = useMemo<SectionId[]>(() => {
    const parsed = (searchParams.get("sec") ?? "")
      .split(",")
      .filter(isSectionId);
    return parsed.length ? parsed : [...SECTION_IDS];
  }, [searchParams]);

  const session = useLiveSession(urlCode, {
    // Same key + top-level `sections` field as the old uploaded page, so a
    // student mid-session keeps their score across the old→new page swap.
    storagePrefix: "ms_graph_",
    defaultExtra: { sections: urlSections },
    sanitizeExtra: (raw) => {
      const sections = Array.isArray(raw.sections)
        ? raw.sections.filter(isSectionId)
        : [];
      return sections.length ? { sections } : null;
    },
  });

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      {session.phase === "checking" && (
        <CenterFrame>
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">Қосылуда…</p>
        </CenterFrame>
      )}
      {session.phase === "join" && (
        <JoinScreen
          onJoin={session.join}
          error={session.joinError}
          pending={session.joinPending}
          needsCode={session.needsCodeInput}
        />
      )}
      {session.phase === "waiting" && (
        <WaitScreen name={session.studentName} />
      )}
      {session.phase === "active" && (
        <QuizScreen
          sections={session.extra.sections}
          stats={session.stats}
          timeLeft={session.timeLeft}
          onAnswer={session.recordAnswer}
        />
      )}
      {session.phase === "ended" && <ResultsScreen stats={session.stats} />}
    </main>
  );
}

function CenterFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      {children}
    </div>
  );
}

// ═══ JOIN ═══════════════════════════════════════════════════════════════

function JoinScreen({
  onJoin,
  error,
  pending,
  needsCode,
}: {
  onJoin: (name: string, code: string) => void;
  error: JoinError | null;
  pending: boolean;
  needsCode: boolean;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <CenterFrame>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-lg shadow-blue-950/5">
        <div className="mb-6 text-center">
          <ParabolaMark className="mx-auto mb-3 size-12 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">
            Квадраттық функция
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Формула бойынша графикті табу
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onJoin(name, code);
          }}
          noValidate
        >
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
            >
              {JOIN_ERRORS[error]}
            </p>
          )}
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="quiz-name">Аты-жөні</Label>
            <Input
              id="quiz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Атыңызды жазыңыз"
              maxLength={20}
              autoComplete="off"
              autoCorrect="off"
              className="h-12 text-base"
            />
          </div>
          {needsCode && (
            <div className="mb-4 flex flex-col gap-2">
              <Label htmlFor="quiz-code">Бөлме коды</Label>
              <Input
                id="quiz-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="——————"
                maxLength={6}
                autoComplete="off"
                className="h-12 text-center font-mono text-xl tracking-[0.4em] uppercase"
              />
            </div>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="mt-1 h-12 w-full text-base font-semibold"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Қосылуда…
              </>
            ) : (
              <>
                Кіру
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </div>
    </CenterFrame>
  );
}

// ═══ WAIT ═══════════════════════════════════════════════════════════════

function WaitScreen({ name }: { name: string }) {
  return (
    <CenterFrame>
      <svg viewBox="0 0 240 150" className="w-56 text-primary" aria-hidden>
        <line
          x1="8"
          y1="118"
          x2="232"
          y2="118"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1.5"
        />
        <line
          x1="120"
          y1="8"
          x2="120"
          y2="144"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1.5"
        />
        <path
          className="quiz-parabola-path"
          d="M 22 20 Q 120 216 218 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
        />
        <circle cx="120" cy="118" r="4.5" fill="currentColor" />
      </svg>
      <h1 className="mt-5 text-xl font-bold tracking-tight">Қосылдыңыз!</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Мұғалім сабақты бастағанша күтіңіз
      </p>
      <span className="mt-5 rounded-full border border-primary/20 bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
        {name}
      </span>
    </CenterFrame>
  );
}

// ═══ QUIZ ═══════════════════════════════════════════════════════════════

const OPTION_LABELS = ["A", "B", "C", "D"];

function QuizScreen({
  sections,
  stats,
  timeLeft,
  onAnswer,
}: {
  sections: SectionId[];
  stats: QuizStats;
  timeLeft: number | null;
  onAnswer: (isCorrect: boolean) => void;
}) {
  const [question, setQuestion] = useState<Question>(() =>
    generateQuestion(sections),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const questionNumber = stats.correct + stats.wrong + (answered ? 0 : 1);
  const wasCorrect =
    answered && selected !== null && question.options[selected].isCorrect;

  const check = () => {
    if (selected === null || answered) return;
    setAnswered(true);
    onAnswer(question.options[selected].isCorrect);
  };

  const next = () => {
    setQuestion(generateQuestion(sections));
    setSelected(null);
    setAnswered(false);
  };

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 border-b border-primary/10 bg-[#f6f8fc]/85 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-2.5">
          {timeLeft !== null ? (
            <TimerPill seconds={timeLeft} />
          ) : (
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Тікелей
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <StatPill
              icon={<Check className="size-3.5" aria-hidden />}
              value={stats.correct}
              label="дұрыс"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            />
            <StatPill
              icon={<X className="size-3.5" aria-hidden />}
              value={stats.wrong}
              label="қате"
              className="border-red-200 bg-red-50 text-red-700"
            />
            <StatPill
              key={stats.streak}
              icon={<Flame className="size-3.5" aria-hidden />}
              value={stats.streak}
              label="қатарынан"
              className={cn(
                "border-amber-200 bg-amber-50 text-amber-700",
                stats.streak >= 2 && "quiz-pop",
                stats.streak === 0 && "opacity-45",
              )}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <p className="mb-2.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {questionNumber}-сұрақ · графикті таңдаңыз
          </p>
          <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-5 text-center [background-size:18px_18px]">
            <MathFormula
              formula={question.formula}
              className="text-2xl font-medium text-blue-950 sm:text-3xl"
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2.5">
            {question.options.map((opt, i) => {
              const isSelected = selected === i;
              const showCorrect = answered && opt.isCorrect;
              const showWrong = answered && isSelected && !opt.isCorrect;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={answered ? -1 : 0}
                  aria-pressed={isSelected}
                  aria-label={`${OPTION_LABELS[i]} нұсқасы`}
                  onClick={() => !answered && setSelected(i)}
                  onKeyDown={(e) => {
                    if (!answered && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setSelected(i);
                    }
                  }}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-xl border-2 bg-white transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    !answered && "cursor-pointer",
                    showCorrect
                      ? "border-emerald-600 ring-4 ring-emerald-600/15"
                      : showWrong
                        ? "border-red-600 ring-4 ring-red-600/15"
                        : isSelected
                          ? "border-primary ring-4 ring-primary/15"
                          : "border-border",
                    answered && !showCorrect && !showWrong && "opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1.5 left-1.5 z-10 flex size-6 items-center justify-center rounded-md text-xs font-bold text-white",
                      showCorrect
                        ? "bg-emerald-600"
                        : showWrong
                          ? "bg-red-600"
                          : "bg-primary",
                    )}
                  >
                    {OPTION_LABELS[i]}
                  </span>
                  <GraphCanvas params={opt.params} />
                </div>
              );
            })}
          </div>

          {answered && (
            <p
              role="status"
              className={cn(
                "mb-4 flex items-center justify-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-semibold",
                wasCorrect
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              {wasCorrect ? (
                <>
                  <Check className="size-4" aria-hidden />
                  Дұрыс!
                </>
              ) : (
                <>
                  <X className="size-4" aria-hidden />
                  Қате — дұрыс жауап жасылмен белгіленді
                </>
              )}
            </p>
          )}

          {answered ? (
            <Button
              onClick={next}
              className="h-12 w-full text-base font-semibold"
            >
              Келесі сұрақ
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              onClick={check}
              disabled={selected === null}
              className="h-12 w-full text-base font-semibold"
            >
              Тексеру
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({
  icon,
  value,
  label,
  className,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
        className,
      )}
      aria-label={`${value} ${label}`}
    >
      {icon}
      <span className="font-mono">{value}</span>
    </span>
  );
}

// ═══ RESULTS ════════════════════════════════════════════════════════════

function ResultsScreen({ stats }: { stats: QuizStats }) {
  const total = stats.correct + stats.wrong;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  const tone =
    pct >= 70
      ? { color: "text-emerald-600", message: "Тамаша нәтиже!" }
      : pct >= 40
        ? { color: "text-amber-600", message: "Жақсы! Жаттығуды жалғастырыңыз." }
        : { color: "text-red-600", message: "Келесіде міндетті түрде шығады!" };

  return (
    <CenterFrame>
      {pct >= 70 && <Confetti />}
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <h1 className="text-xl font-bold tracking-tight">Тест аяқталды!</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tone.message}</p>

        <ScoreRing pct={pct} colorClass={tone.color} />

        <div className="mb-5 grid grid-cols-3 gap-2">
          <ResultStat value={stats.correct} label="Дұрыс" className="text-emerald-600" />
          <ResultStat value={stats.wrong} label="Қате" className="text-red-600" />
          <ResultStat value={total} label="Барлығы" className="text-foreground" />
        </div>

        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <Send className="size-3.5" aria-hidden />
          Нәтижелер мұғалімге жіберілді
        </p>
      </div>
    </CenterFrame>
  );
}

function ScoreRing({ pct, colorClass }: { pct: number; colorClass: string }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto my-6 size-36">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-secondary"
        />
        {pct > 0 && (
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            className={colorClass}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-mono text-3xl font-bold", colorClass)}>
          {pct}%
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          нәтиже
        </span>
      </div>
    </div>
  );
}

function ResultStat({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl bg-secondary px-2 py-3">
      <div className={cn("font-mono text-xl font-bold", className)}>
        {value}
      </div>
      <div className="mt-0.5 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

