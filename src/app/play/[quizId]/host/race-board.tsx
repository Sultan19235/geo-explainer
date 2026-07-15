"use client";

// The race-mode (Жарыс) projector board — replaces LiveScreen while a race
// room is live. The server owns the phase machine (docs/RACE_MODE_SPEC.md §2);
// this component only renders the RaceView the teacher hook assembled from
// /live events and fires the advance actions. Full question content (text,
// options, worked solutions) comes from the LOCAL pack via questionById — the
// wire only carries ids, clocks, counts and leaderboards.
//
// Projector-first sizing: the biggest thing on screen is always the one thing
// the class must read from the back row (the countdown, the correct answer,
// the podium) — while staying usable inside the embedded lesson frame
// (min-h-[640px]), so nothing here assumes a full viewport.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Expand,
  Eye,
  EyeOff,
  Flame,
  Lightbulb,
  Play,
  QrCode as QrCodeIcon,
  Square,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/quiz/confetti";
import { MathText } from "@/components/quiz/math-text";
import { TimerPill } from "@/components/quiz/timer-pill";
import { LessonBlocks } from "@/components/lesson/blocks";
import { PenOverlay } from "@/components/lesson/pen-overlay";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { engineT } from "@/lib/quiz/engine-strings";
import {
  hasExplainContent,
  loc,
  type PackQuestion,
} from "@/lib/quiz/pack";
import type { RaceBoardRow, RaceCorrect, RaceDist } from "@/lib/quiz/live-client";
import type { LiveStudent, RaceView } from "@/lib/quiz/use-teacher-session";

// Same palette/medals as pack-console-client.tsx. Duplicated on purpose:
// importing them back from the console would make the two files circular
// (the console renders <RaceBoard>), and they are three lines of constants.
const AVATAR_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#7c3aed",
  "#ec4899",
  "#f97316",
];
const MEDALS = ["🥇", "🥈", "🥉"];
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

// doReveal arms the server's auto-advance timer for 8s (spec §2.4) — the
// badge's dwell countdown mirrors that from the reveal event's local receipt.
const AUTO_DWELL_MS = 8_000;

function avatarColor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Forces a re-render every `ms` while `active` — how every countdown on this
// board ticks. The clocks themselves are pure functions of RaceView.anchorNow
// and performance.now(), so a dropped tick can never accumulate drift.
function useTick(active: boolean, ms = 200) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

// Milliseconds left on the current question, anchored to the moment the
// state landed (RaceView.anchorNow) — NEVER to the deadline epoch, which
// would trust this machine's wall clock.
function questionRemainingMs(race: RaceView): number | null {
  if (race.remainingMs == null) return null;
  return Math.max(0, race.remainingMs - (performance.now() - race.anchorNow));
}

export function RaceBoard({
  quizTitle,
  code,
  students,
  timeLeft,
  race,
  questionById,
  onEnd,
  onOpenQr,
  onFullscreen,
  onKick,
  onNext,
  onReveal,
  onExplain,
  onPodium,
  onSetAuto,
  onFinish,
}: {
  quizTitle: string;
  code: string;
  students: Map<string, LiveStudent>;
  timeLeft: number;
  // null only for the ~1 RTT until the /live snapshot lands after a resume —
  // rendered as idle (the start button's 'next' would 409 harmlessly anyway).
  race: RaceView | null;
  questionById: Map<string, PackQuestion>;
  onEnd: () => void;
  onOpenQr: () => void;
  onFullscreen: () => void;
  onKick: (s: LiveStudent) => void;
  onNext: () => void;
  onReveal: () => void;
  onExplain: () => void;
  onPodium: () => void;
  onSetAuto: (value: boolean) => void;
  onFinish: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);

  const phase = race?.phase ?? "idle";
  const question =
    race?.qId !== undefined ? questionById.get(race.qId) : undefined;
  const isLast = race !== null && race.qIndex + 1 >= race.qCount;

  // One ticking clock for the whole board: the question countdown and the
  // reveal phase's auto-dwell badge both derive from anchorNow.
  useTick(
    phase === "question" || (phase === "reveal" && race?.auto === true),
  );

  const list = Array.from(students.values());
  const activeCount =
    race?.activeCount ?? list.filter((s) => s.connected !== false).length;

  return (
    <div className="flex min-h-[inherit] w-full flex-col px-3 py-3 sm:px-4">
      {/* ── header: identical furniture to LiveScreen so teachers never
             re-learn where "end room" lives, plus the race progress pill ── */}
      <header className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="hidden min-w-0 truncate text-sm font-bold sm:block sm:text-base">
            <MathText text={quizTitle} />
          </h1>
          <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs font-bold tracking-widest">
            {code}
          </span>
          {race !== null && race.qIndex >= 0 && (
            <span className="shrink-0 rounded-full border border-primary/30 bg-accent px-2.5 py-1 text-xs font-bold tabular-nums text-primary">
              {Math.min(race.qIndex + 1, race.qCount)} / {race.qCount}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums">
            <Users className="size-3.5 text-primary" aria-hidden />
            {list.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* auto-advance switch: mirrored optimistically in the hook; the
              server is the authority (spec 'auto' action works in any phase) */}
          <button
            type="button"
            onClick={() => onSetAuto(!(race?.auto === true))}
            aria-pressed={race?.auto === true}
            title={t("race_auto")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold",
              race?.auto === true
                ? "border-primary bg-accent text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Zap className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{t("race_auto")}</span>
          </button>
          <TimerPill seconds={timeLeft} />
          <button
            type="button"
            onClick={onOpenQr}
            title={t("c_show_qr")}
            className="grid size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <QrCodeIcon className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onFullscreen}
            title={t("c_fullscreen")}
            className="hidden size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground sm:grid"
          >
            <Expand className="size-4" aria-hidden />
          </button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onEnd}
            className="h-8 font-semibold"
          >
            <Square className="size-3.5" aria-hidden />
            {t("c_end")}
          </Button>
        </div>
      </header>

      {/* ── phase body ── */}
      {phase === "idle" && (
        <IdleScreen
          studentCount={list.length}
          startLabel={t("race_first_question")}
          onNext={onNext}
        />
      )}

      {phase === "question" && race !== null && (
        <QuestionScreen
          race={race}
          question={question}
          lang={lang}
          activeCount={activeCount}
          answeredLabel={t("race_answered_count")
            .replace("{n}", String(race.answeredCount ?? 0))
            .replace("{of}", String(activeCount))}
          getReadyLabel={t("race_get_ready")}
          revealLabel={t("race_reveal_now")}
          onReveal={onReveal}
        />
      )}

      {phase === "reveal" && race !== null && (
        <RevealScreen
          race={race}
          question={question}
          lang={lang}
          isLast={isLast}
          onNext={onNext}
          onExplain={onExplain}
          onPodium={onPodium}
        />
      )}

      {phase === "explain" && race !== null && (
        <ExplainScreen
          question={question}
          lang={lang}
          isLast={isLast}
          onNext={onNext}
          onPodium={onPodium}
        />
      )}

      {phase === "podium" && race !== null && (
        <PodiumScreen
          board={race.board ?? []}
          students={students}
          onFinish={onFinish}
        />
      )}

      {/* the presence strip stays reachable in every non-podium phase — a
          teacher must be able to see who left / kick a troll mid-question
          without leaving the race board */}
      {phase !== "podium" && (
        <PresenceStrip students={list} onKick={onKick} />
      )}
    </div>
  );
}

// ═══ IDLE (armed room, nothing opened yet) ════════════════════════════════

function IdleScreen({
  studentCount,
  startLabel,
  onNext,
}: {
  studentCount: number;
  startLabel: string;
  onNext: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12">
      <p className="flex items-center gap-2 text-lg font-bold text-muted-foreground">
        <Users className="size-5 text-primary" aria-hidden />
        {t("c_students")}: {studentCount}
      </p>
      <Button
        onClick={onNext}
        className="h-16 px-10 text-xl font-bold sm:h-20 sm:px-14 sm:text-2xl"
      >
        <Play className="size-6" aria-hidden />
        {startLabel}
      </Button>
    </div>
  );
}

// ═══ QUESTION (countdown + live answered counter) ═════════════════════════

function QuestionScreen({
  race,
  question,
  lang,
  activeCount,
  answeredLabel,
  getReadyLabel,
  revealLabel,
  onReveal,
}: {
  race: RaceView;
  question: PackQuestion | undefined;
  lang: "kz" | "ru";
  activeCount: number;
  answeredLabel: string;
  getReadyLabel: string;
  revealLabel: string;
  onReveal: () => void;
}) {
  const remaining = questionRemainingMs(race);
  const totalMs = (race.timeSec ?? 30) * 1000;
  // The server bakes a 3s get-ready gap into remainingMs (openAt = now + 3s,
  // spec §2.4): anything above the pure question time IS the get-ready phase.
  const getReadyMs = remaining !== null ? remaining - totalMs : null;

  return (
    <div className="flex flex-1 flex-col items-center gap-5 py-4">
      {getReadyMs !== null && getReadyMs > 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-2xl font-bold text-primary sm:text-3xl">
            {getReadyLabel}
          </p>
          <p className="font-mono text-8xl font-bold tabular-nums text-primary sm:text-9xl">
            {Math.ceil(getReadyMs / 1000)}
          </p>
        </div>
      ) : (
        <>
          {question && (
            <div className="w-full max-w-4xl text-center text-2xl font-bold leading-snug sm:text-3xl md:text-4xl">
              <MathText text={loc(question.text, lang)} />
            </div>
          )}
          {remaining !== null && (
            <CountdownRing remainingMs={remaining} totalMs={totalMs} />
          )}
          <p className="text-xl font-bold tabular-nums text-muted-foreground sm:text-2xl">
            {answeredLabel}
          </p>
          <AnsweredBar
            answered={race.answeredCount ?? 0}
            active={activeCount}
          />
          <Button
            variant="outline"
            onClick={onReveal}
            className="h-12 px-6 text-base font-semibold"
          >
            <Eye className="size-4" aria-hidden />
            {revealLabel}
          </Button>
        </>
      )}
    </div>
  );
}

function CountdownRing({
  remainingMs,
  totalMs,
}: {
  remainingMs: number;
  totalMs: number;
}) {
  const frac = Math.max(0, Math.min(1, remainingMs / Math.max(1, totalMs)));
  const R = 56;
  const C = 2 * Math.PI * R;
  const secs = Math.ceil(remainingMs / 1000);
  const color =
    frac > 0.5 ? "#059669" : frac > 0.25 ? "#d97706" : "#dc2626";
  return (
    <div className="relative">
      <svg viewBox="0 0 128 128" className="size-36 -rotate-90 sm:size-44">
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="10"
          className="stroke-secondary"
        />
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
        />
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-mono text-5xl font-bold tabular-nums sm:text-6xl"
        style={{ color }}
      >
        {secs}
      </span>
    </div>
  );
}

function AnsweredBar({ answered, active }: { answered: number; active: number }) {
  const pct = active > 0 ? Math.min(100, Math.round((answered / active) * 100)) : 0;
  return (
    <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ═══ REVEAL (correct answer + distribution + top-5) ═══════════════════════

function RevealScreen({
  race,
  question,
  lang,
  isLast,
  onNext,
  onExplain,
  onPodium,
}: {
  race: RaceView;
  question: PackQuestion | undefined;
  lang: "kz" | "ru";
  isLast: boolean;
  onNext: () => void;
  onExplain: () => void;
  onPodium: () => void;
}) {
  const t = engineT(lang);
  // Auto-dwell badge: the server advances ~8s after doReveal; anchorNow is
  // the reveal event's local receipt so the countdown matches within SSE
  // latency. After a snapshot resume the anchor is the snapshot's receipt —
  // worst case the badge just reads a little long.
  const dwellMs = race.auto
    ? Math.max(0, AUTO_DWELL_MS - (performance.now() - race.anchorNow))
    : null;

  return (
    <div className="flex flex-1 flex-col items-center gap-4 py-2">
      {question && (
        <div className="w-full max-w-4xl text-center text-lg font-bold leading-snug sm:text-xl">
          <MathText text={loc(question.text, lang)} />
        </div>
      )}

      <CorrectAnswerPanel
        correct={race.correct}
        question={question}
        lang={lang}
        label={t("race_correct_answer")}
      />

      <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-2">
        <DistributionPanel
          dist={race.dist}
          correct={race.correct}
          question={question}
          lang={lang}
        />
        <LeaderboardPanel
          board={race.board ?? []}
          title={t("race_leaderboard")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {question && hasExplainContent(question) && (
          <Button
            variant="outline"
            onClick={onExplain}
            className="h-12 px-6 text-base font-semibold"
          >
            <Lightbulb className="size-4" aria-hidden />
            {t("race_explain")}
          </Button>
        )}
        <Button
          onClick={isLast ? onPodium : onNext}
          className="h-12 px-8 text-base font-bold"
        >
          {isLast ? (
            <>
              <Trophy className="size-4" aria-hidden />
              {t("race_podium")}
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden />
              {t("race_next")}
            </>
          )}
        </Button>
        {dwellMs !== null && (
          <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent px-3 py-1.5 text-sm font-bold tabular-nums text-primary">
            <Zap className="size-3.5" aria-hidden />
            {t("race_auto_badge")} · {Math.ceil(dwellMs / 1000)}
          </span>
        )}
      </div>
    </div>
  );
}

function CorrectAnswerPanel({
  correct,
  question,
  lang,
  label,
}: {
  correct: RaceCorrect | undefined;
  question: PackQuestion | undefined;
  lang: "kz" | "ru";
  label: string;
}) {
  // Server truth first (race.correct), local pack as fallback — they can only
  // disagree if the pack was re-uploaded mid-room, and then the server copy
  // is what the students were actually graded against.
  let text: string | null = null;
  let letter: string | null = null;
  if (correct && "pick" in correct) {
    letter = OPTION_LABELS[correct.pick] ?? null;
    text = question?.options ? loc(question.options[correct.pick], lang) : null;
  } else if (correct && "answer" in correct) {
    text = correct.answer;
  } else if (question?.type === "mcq" && question.correct !== undefined) {
    letter = OPTION_LABELS[question.correct] ?? null;
    text = question.options ? loc(question.options[question.correct], lang) : null;
  } else if (question?.type === "input") {
    text = question.answer ?? null;
  }
  if (text === null && letter === null) return null;
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-1 rounded-2xl border-[1.5px] border-emerald-500 bg-emerald-50 px-6 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
        {label}
      </p>
      <p className="flex items-center gap-3 text-2xl font-bold text-emerald-800 sm:text-3xl">
        {letter && (
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-500 text-xl text-white">
            {letter}
          </span>
        )}
        {text && <MathText text={text} />}
      </p>
    </div>
  );
}

function DistributionPanel({
  dist,
  correct,
  question,
  lang,
}: {
  dist: RaceDist | undefined;
  correct: RaceCorrect | undefined;
  question: PackQuestion | undefined;
  lang: "kz" | "ru";
}) {
  const t = engineT(lang);
  if (dist === undefined) return null;

  // mcq: counts per canonical option index (race forces canonical option
  // order, so the board's letters match every phone).
  if (Array.isArray(dist)) {
    const max = Math.max(1, ...dist);
    const correctPick =
      correct && "pick" in correct ? correct.pick : question?.correct;
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2.5">
          {dist.map((count, i) => (
            <DistBar
              key={i}
              label={OPTION_LABELS[i] ?? String(i + 1)}
              count={count}
              frac={count / max}
              tone={i === correctPick ? "correct" : "neutral"}
            />
          ))}
        </div>
      </div>
    );
  }

  // input: correct / wrong / no-answer buckets. "No answer" == the clock ran
  // out on them, hence the race_time_up label.
  const max = Math.max(1, dist.ok, dist.wrong, dist.none);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2.5">
        <DistBar
          label={t("c_stat_correct")}
          count={dist.ok}
          frac={dist.ok / max}
          tone="correct"
        />
        <DistBar
          label={t("c_stat_wrong")}
          count={dist.wrong}
          frac={dist.wrong / max}
          tone="wrong"
        />
        <DistBar
          label={t("race_time_up")}
          count={dist.none}
          frac={dist.none / max}
          tone="none"
        />
      </div>
    </div>
  );
}

function DistBar({
  label,
  count,
  frac,
  tone,
}: {
  label: string;
  count: number;
  frac: number;
  tone: "correct" | "wrong" | "neutral" | "none";
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "w-16 shrink-0 truncate text-right text-sm font-bold",
          tone === "correct"
            ? "text-emerald-700"
            : tone === "wrong"
              ? "text-red-600"
              : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <div className="h-7 flex-1 overflow-hidden rounded-lg bg-secondary">
        <div
          className={cn(
            "h-full rounded-lg transition-all duration-500",
            tone === "correct"
              ? "bg-emerald-500"
              : tone === "wrong"
                ? "bg-red-400"
                : tone === "none"
                  ? "bg-slate-300"
                  : "bg-blue-400",
          )}
          style={{ width: `${Math.round(frac * 100)}%` }}
        />
      </div>
      <span className="w-8 shrink-0 font-mono text-base font-bold tabular-nums">
        {count}
      </span>
    </div>
  );
}

function LeaderboardPanel({
  board,
  title,
}: {
  board: RaceBoardRow[];
  title: string;
}) {
  const top = board.slice(0, 5);
  if (top.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Trophy className="size-4 text-amber-500" aria-hidden />
        {title}
      </p>
      <div className="flex flex-col">
        {top.map((row) => (
          <div
            key={row.studentId}
            className="flex items-center gap-2.5 border-b border-border py-2 text-base last:border-b-0"
          >
            <span className="w-7 shrink-0 text-center text-lg font-bold">
              {MEDALS[row.rank - 1] ?? row.rank}
            </span>
            <RankArrow rank={row.rank} prevRank={row.prevRank} />
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
              style={{ background: avatarColor(row.name) }}
            >
              {row.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{row.name}</span>
            {row.streak >= 2 && (
              <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-orange-500">
                <Flame className="size-4" aria-hidden />
                {row.streak}
              </span>
            )}
            {row.delta > 0 && (
              <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-600">
                +{row.delta}
              </span>
            )}
            <span className="w-16 shrink-0 text-right font-mono text-lg font-bold tabular-nums text-primary">
              {row.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ▲2 climbed two places, ▼1 dropped one, dot = unchanged. The server sends
// prevRank === rank for a row's first appearance (first reveal, or a
// mid-race joiner's first scored reveal); a null from an older payload also
// reads as "no movement" — never fabricate a drop from missing history.
function RankArrow({ rank, prevRank }: { rank: number; prevRank: number | null }) {
  const diff = prevRank === null ? 0 : prevRank - rank;
  if (diff > 0) {
    return (
      <span className="flex w-9 shrink-0 items-center text-xs font-bold tabular-nums text-emerald-600">
        <ArrowUp className="size-3.5" aria-hidden />
        {diff}
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="flex w-9 shrink-0 items-center text-xs font-bold tabular-nums text-red-500">
        <ArrowDown className="size-3.5" aria-hidden />
        {-diff}
      </span>
    );
  }
  return (
    <span className="w-9 shrink-0 text-center text-xs text-muted-foreground">
      ·
    </span>
  );
}

// ═══ EXPLAIN (worked solution + teacher pen) ══════════════════════════════

function ExplainScreen({
  question,
  lang,
  isLast,
  onNext,
  onPodium,
}: {
  question: PackQuestion | undefined;
  lang: "kz" | "ru";
  isLast: boolean;
  onNext: () => void;
  onPodium: () => void;
}) {
  const t = engineT(lang);
  return (
    <div className="flex flex-1 flex-col items-center gap-4 py-2">
      {/* position:relative wrapper — the PenOverlay canvas covers exactly this
          panel. The advance buttons live OUTSIDE it on purpose: an active pen
          captures the pointer over the whole overlay region, and «Келесі»
          must stay clickable under a board full of ink. */}
      <div className="relative w-full max-w-4xl rounded-2xl border border-border bg-card p-5 sm:p-7">
        {question && (
          <div className="mb-4 border-b border-border pb-3 text-lg font-bold leading-snug">
            <MathText text={loc(question.text, lang)} />
          </div>
        )}
        <SolutionContent question={question} lang={lang} />
        <PenOverlay lang={lang} controlsClassName="right-3 top-3" />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={isLast ? onPodium : onNext}
          className="h-12 px-8 text-base font-bold"
        >
          {isLast ? (
            <>
              <Trophy className="size-4" aria-hidden />
              {t("race_podium")}
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden />
              {t("race_next")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Explain-phase precedence (spec §4): solutionSteps → flat `solution` →
// nothing (but then the Түсіндіру button never rendered, so the empty case
// only appears if the pack changed under an open console).
function SolutionContent({
  question,
  lang,
}: {
  question: PackQuestion | undefined;
  lang: "kz" | "ru";
}) {
  if (!question) return null;
  if (question.solutionSteps && question.solutionSteps.length > 0) {
    return (
      <div className="flex flex-col gap-5">
        {question.solutionSteps.map((step, i) => (
          <div key={i}>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              {loc(step.name, lang)}
            </p>
            <LessonBlocks blocks={step.blocks} lang={lang} />
          </div>
        ))}
      </div>
    );
  }
  if (question.solution && question.solution.length > 0) {
    // Flat fallback, rendered as the numbered steps the self-paced reveal
    // uses — no lesson blocks to hand to LessonBlocks here.
    return (
      <ol className="flex flex-col gap-2.5">
        {question.solution.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-[17px] leading-relaxed">
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-primary">
              {i + 1}.
            </span>
            <MathText text={loc(step, lang)} />
          </li>
        ))}
      </ol>
    );
  }
  return null;
}

// ═══ PODIUM (final standings) ═════════════════════════════════════════════

function PodiumScreen({
  board,
  students,
  onFinish,
}: {
  board: RaceBoardRow[];
  students: Map<string, LiveStudent>;
  onFinish: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);

  // The podium event's board is the truth; if it never landed (podium reached
  // through a snapshot on a reconnect race), fall back to the points stamped
  // on the student cards so the screen is never blank.
  const rows = useMemo<RaceBoardRow[]>(() => {
    if (board.length > 0) return board;
    return Array.from(students.values())
      .filter((s) => s.racePoints !== undefined)
      .sort((a, b) => (b.racePoints ?? 0) - (a.racePoints ?? 0))
      .map((s, i) => ({
        studentId: s.studentId,
        name: s.name,
        points: s.racePoints ?? 0,
        delta: 0,
        ok: false,
        streak: 0,
        rank: i + 1,
        prevRank: i + 1,
      }));
  }, [board, students]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center py-4">
      {rows.length > 0 && <Confetti />}
      <h2 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
        <Trophy className="size-7 text-amber-500" aria-hidden />
        {t("race_podium")}
      </h2>

      {/* top-3 pedestal — same composition as ResultsScreen's, points-sized */}
      <div className="mt-7 flex items-end justify-center gap-3">
        {rows.slice(0, 3).map((row, i) => (
          <div
            key={row.studentId}
            className={cn(
              "flex w-36 flex-col items-center rounded-2xl border border-border bg-card p-4 shadow-lg shadow-blue-950/5 sm:w-44",
              i === 0 && "order-2 -translate-y-4 border-amber-300",
              i === 1 && "order-1",
              i === 2 && "order-3",
            )}
          >
            <span className="text-4xl">{MEDALS[i]}</span>
            <span className="mt-1.5 w-full truncate text-center text-base font-bold">
              {row.name}
            </span>
            <span className="font-mono text-2xl font-bold tabular-nums text-primary">
              {row.points}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("race_points")}
            </span>
          </div>
        ))}
      </div>

      {rows.length > 3 && (
        <div className="mt-5 w-full overflow-hidden rounded-xl border border-border bg-card">
          {rows.slice(3).map((row) => (
            <div
              key={row.studentId}
              className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
            >
              <span className="w-6 text-right font-bold tabular-nums text-muted-foreground">
                {row.rank}
              </span>
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                style={{ background: avatarColor(row.name) }}
              >
                {row.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate font-semibold">{row.name}</span>
              <span className="ml-auto font-mono font-bold tabular-nums text-primary">
                {row.points}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* end() → the existing ResultsScreen, whose autosave freezes the
          scoreboard (score/total = correct/asked + racePoints per row) */}
      <Button
        onClick={onFinish}
        className="mt-7 h-13 w-full max-w-sm text-base font-bold"
      >
        <Check className="size-5" aria-hidden />
        {t("race_finish")}
      </Button>
    </div>
  );
}

// ═══ PRESENCE STRIP (compact roster, collapsible) ═════════════════════════

function PresenceStrip({
  students,
  onKick,
}: {
  students: LiveStudent[];
  onKick: (s: LiveStudent) => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [open, setOpen] = useState(false);
  const away = students.filter(
    (s) => s.connected !== false && !s.focused,
  ).length;
  const left = students.filter((s) => s.connected === false).length;
  const out = away + left;

  return (
    <div className="mt-auto w-full pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mx-auto flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        <Users className="size-3.5 text-primary" aria-hidden />
        {t("c_students")}: {students.length}
        {out > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <EyeOff className="size-3.5" aria-hidden />
            {out} {t("c_out_count")}
          </span>
        )}
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronUp className="size-3.5" aria-hidden />
        )}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {students.map((s) => {
            const isLeft = s.connected === false;
            const isAway = !isLeft && !s.focused;
            return (
              <span
                key={s.studentId}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-1 text-xs font-semibold",
                  isLeft
                    ? "border-border bg-background opacity-50"
                    : isAway
                      ? "border-red-200 bg-red-50"
                      : "border-border bg-card",
                )}
              >
                <span
                  className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: avatarColor(s.name) }}
                >
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                {s.name}
                {isLeft && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    {t("c_away_tag")}
                  </span>
                )}
                {isAway && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-red-600">
                    {t("c_off_screen")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onKick(s)}
                  title={t("c_kick")}
                  aria-label={t("c_kick")}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
