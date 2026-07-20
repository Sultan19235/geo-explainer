"use client";

// The tournament-mode (Турнир) projector board — replaces LiveScreen while a
// tournament room is live. The server owns the bracket, the clocks and the
// grading (docs/TOURNAMENT_MODE_SPEC.md §2-3); this component only renders
// the TourneyView the teacher hook assembled from /live events and fires the
// advance actions. Names come from the wire bracket's `players` map, so the
// board renders without a roster join; live duel scores come from
// TourneyView.liveScores ('tourney_score' events), settled scores from the
// bracket itself.
//
// Projector-first sizing, same doctrine as race-board.tsx: the biggest thing
// on screen is the one thing the class reads from the back row (the draw, the
// countdown, the champion) — while staying usable inside the embedded lesson
// frame (min-h-[640px]), so nothing here assumes a full viewport.

import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Crown,
  Dices,
  Expand,
  EyeOff,
  Play,
  QrCode as QrCodeIcon,
  Square,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/quiz/confetti";
import { MathText } from "@/components/quiz/math-text";
import { TimerPill } from "@/components/quiz/timer-pill";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { engineT } from "@/lib/quiz/engine-strings";
import type {
  TourneyBracket,
  TourneyBracketPair,
} from "@/lib/quiz/live-client";
import type { LiveStudent, TourneyView } from "@/lib/quiz/use-teacher-session";

// Same palette/medals as pack-console-client.tsx and race-board.tsx.
// Duplicated on purpose: importing them back from the console would make the
// files circular (the console renders <TourneyBoard>), and they are three
// lines of constants.
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

function avatarColor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Forces a re-render every `ms` while `active` — how the countdown ticks.
// The clock itself is a pure function of TourneyView.anchorNow and
// performance.now(), so a dropped tick can never accumulate drift.
function useTick(active: boolean, ms = 200) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

// Milliseconds left on the current round, anchored to the moment the state
// landed (TourneyView.anchorNow) — NEVER to the deadline epoch, which would
// trust this machine's wall clock (spec §1).
function roundRemainingMs(tourney: TourneyView): number | null {
  if (tourney.remainingMs == null) return null;
  return Math.max(
    0,
    tourney.remainingMs - (performance.now() - tourney.anchorNow),
  );
}

// The board's presence verdict for one player. The live student card is the
// primary source (it ticks with heartbeats); a kicked student's card is gone,
// so the bracket's own flags are the fallback for their historical rows.
type Presence = "away" | "left" | null;
function presenceOf(
  id: string,
  students: Map<string, LiveStudent>,
  bracket: TourneyBracket,
): Presence {
  const s = students.get(id);
  if (s) {
    if (s.connected === false) return "left";
    if (!s.focused) return "away";
    return null;
  }
  const p = bracket.players[id];
  if (p && (p.kicked || p.connected === false)) return "left";
  return null;
}

// One drawn round of the bracket history — the wire shape of a history entry.
type BracketRound = TourneyBracket["history"][number];

// A player's score in one pair row. Settled rows carry their own scores; the
// CURRENT round streams live scores via 'tourney_score' instead (spec §2.7).
function scoreOf(
  pair: TourneyBracketPair,
  slot: "a" | "b" | "c",
  settled: boolean,
  isCurrentRound: boolean,
  liveScores: TourneyView["liveScores"],
  phase: TourneyView["phase"],
): number | null {
  if (settled) {
    const v =
      slot === "a" ? pair.scoreA : slot === "b" ? pair.scoreB : pair.scoreC;
    return v ?? null;
  }
  // Unsettled: only the current round while it plays (or just closed) has
  // meaningful numbers — the draw reveal shows names only, scores appear
  // when the duel opens.
  if (!isCurrentRound || (phase !== "duel" && phase !== "result")) return null;
  const id = slot === "a" ? pair.a : slot === "b" ? pair.b : pair.c;
  if (!id) return null;
  // liveScores (tourney_score accumulator) is freshest between transitions;
  // the wire row's live score fills the gap after a mid-duel console reload,
  // when the accumulator starts empty until each player's next answer.
  const wire =
    slot === "a" ? pair.scoreA : slot === "b" ? pair.scoreB : pair.scoreC;
  return liveScores[id]?.correct ?? wire ?? 0;
}

export function TourneyBoard({
  quizTitle,
  code,
  students,
  timeLeft,
  tourney,
  onEnd,
  onOpenQr,
  onFullscreen,
  onKick,
  onPair,
  onStartRound,
  onPodium,
  onFinish,
}: {
  quizTitle: string;
  code: string;
  students: Map<string, LiveStudent>;
  timeLeft: number;
  // null only for the ~1 RTT until the /live snapshot lands after a resume —
  // rendered as idle (the draw button's 'pair' would 409 harmlessly anyway).
  tourney: TourneyView | null;
  onEnd: () => void;
  onOpenQr: () => void;
  onFullscreen: () => void;
  onKick: (s: LiveStudent) => void;
  onPair: () => void;
  onStartRound: () => void;
  onPodium: () => void;
  onFinish: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);

  const phase = tourney?.phase ?? "idle";
  const bracket = tourney?.bracket;
  const list = Array.from(students.values());
  const connectedCount = list.filter((s) => s.connected !== false).length;

  // One ticking clock for the whole board (duel countdown + get-ready).
  useTick(phase === "duel");

  // Champion decided OR pre-generated rounds exhausted → the only legal move
  // from result is podium (spec §2.4).
  const mustPodium =
    bracket !== undefined &&
    (bracket.champion !== null || bracket.round >= bracket.roundCount);

  return (
    <div className="flex min-h-[inherit] w-full flex-col px-3 py-3 sm:px-4">
      {/* ── header: identical furniture to LiveScreen/RaceBoard so teachers
             never re-learn where "end room" lives, plus the round pill ── */}
      <header className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="hidden min-w-0 truncate text-sm font-bold sm:block sm:text-base">
            <MathText text={quizTitle} />
          </h1>
          <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs font-bold tracking-widest">
            {code}
          </span>
          {tourney !== null && tourney.round >= 1 && bracket && (
            <span className="shrink-0 rounded-full border border-primary/30 bg-accent px-2.5 py-1 text-xs font-bold tabular-nums text-primary">
              {t("tourney_round_n").replace("{n}", String(tourney.round))}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums">
            <Users className="size-3.5 text-primary" aria-hidden />
            {list.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          tooFew={connectedCount < 2}
          onPair={onPair}
        />
      )}

      {(phase === "pairing" || phase === "duel" || phase === "result") &&
        tourney !== null &&
        bracket !== undefined && (
          <div className="flex flex-1 flex-col items-center gap-4 py-2">
            {/* duel clock above everything — the back row reads it first */}
            {phase === "duel" && <DuelClock tourney={tourney} />}

            {/* lucky loser returns to the bracket — announce it while the
                draw is on screen */}
            {phase === "pairing" && <LuckyLoserBanner bracket={bracket} />}

            {/* champion emerged at the final settle */}
            {phase === "result" && bracket.champion !== null && (
              <ChampionBanner
                name={bracket.players[bracket.champion]?.name ?? "?"}
              />
            )}

            <BracketColumns
              bracket={bracket}
              liveScores={tourney.liveScores}
              students={students}
              phase={phase}
            />

            <LosersPanel
              bracket={bracket}
              liveScores={tourney.liveScores}
              students={students}
              phase={phase}
            />

            {/* teacher pacing: draw → start → (clock runs out) → result →
                next draw / podium. NO early-close button on purpose — a
                round always runs its full clock (spec §11). */}
            {phase === "pairing" && (
              <Button
                onClick={onStartRound}
                className="h-14 px-10 text-lg font-bold sm:h-16 sm:px-12 sm:text-xl"
              >
                <Play className="size-5" aria-hidden />
                {t("tourney_start_round")}
              </Button>
            )}
            {phase === "result" && (
              <Button
                onClick={mustPodium ? onPodium : onPair}
                className="h-14 px-10 text-lg font-bold sm:h-16 sm:px-12 sm:text-xl"
              >
                {mustPodium ? (
                  <>
                    <Trophy className="size-5" aria-hidden />
                    {t("tourney_podium_btn")}
                  </>
                ) : (
                  <>
                    <Dices className="size-5" aria-hidden />
                    {t("tourney_next_draw")}
                  </>
                )}
              </Button>
            )}
          </div>
        )}

      {phase === "podium" && bracket !== undefined && (
        <PodiumScreen bracket={bracket} onFinish={onFinish} />
      )}

      {/* the presence strip stays reachable in every non-podium phase — a
          teacher must be able to see who left / kick a troll mid-duel
          without leaving the tournament board */}
      {phase !== "podium" && <PresenceStrip students={list} onKick={onKick} />}
    </div>
  );
}

// ═══ IDLE (armed room, no draw yet) ═══════════════════════════════════════

function IdleScreen({
  studentCount,
  tooFew,
  onPair,
}: {
  studentCount: number;
  tooFew: boolean;
  onPair: () => void;
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
        onClick={onPair}
        disabled={tooFew}
        className="h-16 px-10 text-xl font-bold sm:h-20 sm:px-14 sm:text-2xl"
      >
        <Dices className="size-6" aria-hidden />
        {t("tourney_draw_btn")}
      </Button>
      {/* the server 409s a too-small first draw ({error:'too_few'}) and the
          hook swallows it — explain the dead button instead */}
      {tooFew && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
          {t("tourney_too_few")}
        </p>
      )}
    </div>
  );
}

// ═══ DUEL CLOCK (countdown ring + get-ready) ══════════════════════════════

function DuelClock({ tourney }: { tourney: TourneyView }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const remaining = roundRemainingMs(tourney);
  const totalMs = (tourney.roundSec ?? 90) * 1000;
  // The server bakes a 3s get-ready gap into remainingMs (openAt = now + 3s,
  // spec §2.4): anything above the pure round time IS the get-ready phase.
  const getReadyMs = remaining !== null ? remaining - totalMs : null;

  if (getReadyMs !== null && getReadyMs > 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <p className="text-2xl font-bold text-primary sm:text-3xl">
          {t("tourney_get_ready")}
        </p>
        <p className="font-mono text-8xl font-bold tabular-nums text-primary sm:text-9xl">
          {Math.ceil(getReadyMs / 1000)}
        </p>
      </div>
    );
  }
  if (remaining === null) return null;
  return <CountdownRing remainingMs={remaining} totalMs={totalMs} />;
}

// Same ring as race-board's — duplicated (not imported) so neither board's
// visual tuning can silently change the other's.
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
  const color = frac > 0.5 ? "#059669" : frac > 0.25 ? "#d97706" : "#dc2626";
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

// ═══ BANNERS ══════════════════════════════════════════════════════════════

function LuckyLoserBanner({ bracket }: { bracket: TourneyBracket }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const entry = bracket.history.find((h) => h.round === bracket.round);
  if (!entry?.luckyLoserId) return null;
  const name = bracket.players[entry.luckyLoserId]?.name ?? "?";
  // §7's key list has only the student-facing lucky-loser line, so the board
  // quotes it after the name (announcer style) rather than minting a string.
  return (
    <p className="flex items-center gap-2 rounded-xl border-[1.5px] border-amber-300 bg-amber-50 px-4 py-2.5 text-base font-bold text-amber-800 sm:text-lg">
      <Dices className="size-5 shrink-0" aria-hidden />
      {name}: {t("tourney_lucky_loser")}
    </p>
  );
}

function ChampionBanner({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-amber-400 bg-amber-50 px-6 py-3 text-2xl font-bold text-amber-800 sm:text-3xl">
      <Crown className="size-7 shrink-0 text-amber-500" aria-hidden />
      {name}
      <Trophy className="size-7 shrink-0 text-amber-500" aria-hidden />
    </p>
  );
}

// ═══ BRACKET (FIFA playoff sheet: wings converging on a center final) ═════
//
// The one random жеребе is round 1 — after it the bracket is a fixed FIFA
// tree (spec §3: later draws pair the previous round's winners in pair
// order), so the connectors are real lineage: the winner of pair 2i meets
// the winner of pair 2i+1, and a left-wing pair's road stays on the left
// wing. Only a lucky loser / bye (appended at the end of an odd round) or a
// kicked winner bends the lines. Round 1 sits on the outer edges (its pairs
// split half left / half right), later rounds move inward, and rounds that
// are not drawn yet render as dashed placeholder cards so the class sees
// the whole road to the final from the first draw.

// One column of the sheet: a drawn round (entry) or a projected future round
// (entry: null). `count` = main-pair count, real or projected.
type Stage = {
  round: number;
  entry: BracketRound | null;
  count: number;
};

// history rounds + projected future rounds. Winners halve each round
// (odd → lucky loser or bye keeps pairs at ceil(n/2), spec §3), so the
// projection is exact until a champion emerges; it is re-derived from the
// latest real draw on every render, so an early podium or kicks can never
// leave a stale tail. Bounded by roundCount — if the pre-generated rounds
// run out first, the sheet honestly stops short of a 1-pair final.
function buildStages(bracket: TourneyBracket): Stage[] {
  const stages: Stage[] = bracket.history.map((h) => ({
    round: h.round,
    entry: h,
    count: h.main.length,
  }));
  if (stages.length === 0 || bracket.champion !== null) return stages;
  let { round, count } = stages[stages.length - 1];
  while (count > 1 && round < bracket.roundCount) {
    count = Math.ceil(count / 2);
    round += 1;
    stages.push({ round, entry: null, count });
  }
  return stages;
}

function stageLabel(stage: Stage, t: ReturnType<typeof engineT>): string {
  if (stage.count === 1) return t("tourney_final");
  if (stage.count === 2) return t("tourney_semifinal");
  return t("tourney_round_n").replace("{n}", String(stage.round));
}

// Which sides of a pair slot carry connector lines. Wings emit a stub toward
// the center; every non-outermost column also receives an elbow (vertical
// joiner + stub) from the column behind it. Columns are spaced by gap-6
// (24px): the emitter covers its 12px half, the receiver the other half, so
// the lines meet mid-gap.
type SlotLines = {
  emit: "left" | "right" | null;
  recv: "left" | "right" | "both" | null;
};

function PairSlot({
  lines,
  children,
}: {
  lines: SlotLines;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col justify-center py-1">
      {lines.emit !== null && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 h-px w-3 bg-border",
            lines.emit === "right" ? "-right-3" : "-left-3",
          )}
        />
      )}
      {(lines.recv === "left" || lines.recv === "both") && (
        <>
          <span
            aria-hidden
            className="absolute -left-3 top-1/4 h-1/2 w-px bg-border"
          />
          <span
            aria-hidden
            className="absolute -left-3 top-1/2 h-px w-3 bg-border"
          />
        </>
      )}
      {(lines.recv === "right" || lines.recv === "both") && (
        <>
          <span
            aria-hidden
            className="absolute -right-3 top-1/4 h-1/2 w-px bg-border"
          />
          <span
            aria-hidden
            className="absolute -right-3 top-1/2 h-px w-3 bg-border"
          />
        </>
      )}
      {children}
    </div>
  );
}

// A future round's slot: dashed shell, two empty seats.
function PlaceholderCard({ compact }: { compact: boolean }) {
  const row = cn(
    "flex items-center px-3 font-bold text-muted-foreground/40",
    compact ? "h-8 text-xs" : "h-9 text-sm",
  );
  return (
    <div className="rounded-xl border-[1.5px] border-dashed border-border bg-card/40">
      <div className={row}>—</div>
      <div className={cn(row, "border-t border-dashed border-border")}>—</div>
    </div>
  );
}

function StageColumnHeader({
  stage,
  isCurrent,
  t,
}: {
  stage: Stage;
  isCurrent: boolean;
  t: ReturnType<typeof engineT>;
}) {
  return (
    <p
      className={cn(
        "h-6 truncate text-center text-xs font-bold uppercase tracking-[0.14em]",
        isCurrent ? "text-primary" : "text-muted-foreground",
      )}
    >
      {stageLabel(stage, t)}
    </p>
  );
}

// One wing column: the given half of a stage's pairs (drawn or placeholder).
// `outermost` columns have nothing feeding into them, so no receive elbow.
function WingColumn({
  stage,
  side,
  outermost,
  bracket,
  liveScores,
  students,
  phase,
}: {
  stage: Stage;
  side: "left" | "right";
  outermost: boolean;
  bracket: TourneyBracket;
  liveScores: TourneyView["liveScores"];
  students: Map<string, LiveStudent>;
  phase: TourneyView["phase"];
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const isCurrent = stage.entry !== null && stage.round === bracket.round;
  const compact = !isCurrent;
  const leftCount = Math.ceil(stage.count / 2);
  const from = side === "left" ? 0 : leftCount;
  const to = side === "left" ? leftCount : stage.count;
  const lines: SlotLines = {
    emit: side === "left" ? "right" : "left",
    recv: outermost ? null : side === "left" ? "left" : "right",
  };
  const slots = [];
  for (let i = from; i < to; i++) {
    slots.push(
      <PairSlot key={i} lines={lines}>
        {stage.entry !== null ? (
          <PairCard
            pair={stage.entry.main[i]}
            bracket={bracket}
            settled={stage.entry.settled}
            isCurrentRound={isCurrent}
            liveScores={liveScores}
            students={students}
            phase={phase}
            highlight={isCurrent && phase === "pairing"}
            compact={compact}
          />
        ) : (
          <PlaceholderCard compact />
        )}
      </PairSlot>,
    );
  }
  if (slots.length === 0) return null;
  return (
    <div className={cn("flex flex-col", compact ? "w-40" : "w-52")}>
      <StageColumnHeader stage={stage} isCurrent={isCurrent} t={t} />
      {slots}
    </div>
  );
}

// The center column: the last stage of the sheet — normally the final (one
// pair, trophy on top), or the last reachable round if the pre-generated
// rounds run out before a champion (then it may hold several cards).
function CenterColumn({
  stage,
  hasWings,
  bracket,
  liveScores,
  students,
  phase,
}: {
  stage: Stage;
  hasWings: boolean;
  bracket: TourneyBracket;
  liveScores: TourneyView["liveScores"];
  students: Map<string, LiveStudent>;
  phase: TourneyView["phase"];
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const isCurrent = stage.entry !== null && stage.round === bracket.round;
  const lines: SlotLines = { emit: null, recv: hasWings ? "both" : null };
  return (
    <div className="flex w-52 flex-col">
      <StageColumnHeader stage={stage} isCurrent={isCurrent} t={t} />
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-1 flex justify-center">
          <Trophy
            className={cn(
              "size-8",
              bracket.champion !== null
                ? "text-amber-500"
                : "text-muted-foreground/40",
            )}
            aria-hidden
          />
        </div>
        {Array.from({ length: stage.count }, (_, i) => (
          <PairSlot key={i} lines={lines}>
            {stage.entry !== null ? (
              <PairCard
                pair={stage.entry.main[i]}
                bracket={bracket}
                settled={stage.entry.settled}
                isCurrentRound={isCurrent}
                liveScores={liveScores}
                students={students}
                phase={phase}
                highlight={isCurrent && phase === "pairing"}
                compact={false}
              />
            ) : (
              <PlaceholderCard compact={false} />
            )}
          </PairSlot>
        ))}
      </div>
    </div>
  );
}

function BracketColumns({
  bracket,
  liveScores,
  students,
  phase,
}: {
  bracket: TourneyBracket;
  liveScores: TourneyView["liveScores"];
  students: Map<string, LiveStudent>;
  phase: TourneyView["phase"];
}) {
  const stages = buildStages(bracket);
  if (stages.length === 0) return null;
  // Wings hold every stage except the last; the last stage is the center.
  // items-stretch + equal flex-1 slots per column keep all columns the same
  // height, so a round with half the pairs naturally interleaves between the
  // feeders beside it, like a printed playoff sheet.
  const wings = stages.slice(0, -1);
  const center = stages[stages.length - 1];
  const shared = { bracket, liveScores, students, phase };
  return (
    <div className="w-full overflow-x-auto">
      <div className="mx-auto flex w-max items-stretch gap-6 px-2 py-1">
        {wings.map((stage, i) => (
          <WingColumn
            key={stage.round}
            stage={stage}
            side="left"
            outermost={i === 0}
            {...shared}
          />
        ))}
        <CenterColumn stage={center} hasWings={wings.length > 0} {...shared} />
        {[...wings].reverse().map((stage, i) => (
          <WingColumn
            key={stage.round}
            stage={stage}
            side="right"
            outermost={i === wings.length - 1}
            {...shared}
          />
        ))}
      </div>
    </div>
  );
}

function PairCard({
  pair,
  bracket,
  settled,
  isCurrentRound,
  liveScores,
  students,
  phase,
  highlight,
  compact,
}: {
  pair: TourneyBracketPair;
  bracket: TourneyBracket;
  settled: boolean;
  isCurrentRound: boolean;
  liveScores: TourneyView["liveScores"];
  students: Map<string, LiveStudent>;
  phase: TourneyView["phase"];
  highlight: boolean;
  // Slimmer rows for settled/older wing columns — the current round keeps
  // full size so live scores stay readable from the back row.
  compact: boolean;
}) {
  const slots: Array<{ id: string | null; slot: "a" | "b" | "c" }> = [
    { id: pair.a, slot: "a" },
    { id: pair.b, slot: "b" },
  ];
  if (pair.c !== undefined) slots.push({ id: pair.c, slot: "c" });
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-[1.5px] bg-card",
        highlight
          ? "border-primary shadow-[0_0_0_3px_rgba(37,99,235,0.15)]"
          : "border-border",
      )}
    >
      {slots.map(({ id, slot }, i) => (
        <PlayerRow
          key={slot}
          id={id}
          bracket={bracket}
          score={scoreOf(pair, slot, settled, isCurrentRound, liveScores, phase)}
          winner={settled && id !== null && pair.winner === id}
          students={students}
          divider={i > 0}
          compact={compact}
        />
      ))}
    </div>
  );
}

function PlayerRow({
  id,
  bracket,
  score,
  winner,
  students,
  divider,
  compact,
}: {
  // null = the empty slot of a solo row (main-bracket bye or a one-person
  // losers pool) — rendered as a muted dash, the auto-advance reads itself.
  id: string | null;
  bracket: TourneyBracket;
  score: number | null;
  winner: boolean;
  students: Map<string, LiveStudent>;
  divider: boolean;
  compact: boolean;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  if (id === null) {
    return (
      <div
        className={cn(
          "flex items-center px-3 font-bold text-muted-foreground/50",
          compact ? "h-8 text-xs" : "h-9 text-sm",
          divider && "border-t border-border",
        )}
      >
        —
      </div>
    );
  }
  const player = bracket.players[id];
  const name = player?.name ?? "?";
  const presence = presenceOf(id, students, bracket);
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2",
        compact ? "h-8" : "h-9",
        divider && "border-t border-border",
        winner && "bg-emerald-50",
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full font-bold text-white",
          compact ? "size-5 text-[9px]" : "size-6 text-[10px]",
        )}
        style={{ background: avatarColor(name) }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          compact ? "text-xs" : "text-sm",
          winner ? "font-bold text-emerald-800" : "font-semibold",
          player?.kicked && "line-through opacity-50",
        )}
      >
        {name}
      </span>
      {/* presence badges only at full size — compact wing rows are history,
          and the badge + check + score would overflow the slim card */}
      {presence !== null && !compact && (
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
            presence === "away"
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-border bg-background text-muted-foreground",
          )}
        >
          {presence === "away" ? t("tourney_away_badge") : t("tourney_left_badge")}
        </span>
      )}
      {winner && (
        <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
      )}
      {score !== null && (
        <span
          className={cn(
            "w-7 shrink-0 text-right font-mono font-bold tabular-nums",
            compact ? "text-sm" : "text-base",
            winner ? "text-emerald-700" : "text-primary",
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
}

// ═══ LOSERS POOL (current round's consolation pairs) ══════════════════════

function LosersPanel({
  bracket,
  liveScores,
  students,
  phase,
}: {
  bracket: TourneyBracket;
  liveScores: TourneyView["liveScores"];
  students: Map<string, LiveStudent>;
  phase: TourneyView["phase"];
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const entry = bracket.history.find((h) => h.round === bracket.round);
  if (!entry || entry.losers.length === 0) return null;
  return (
    <div className="w-full max-w-3xl rounded-2xl border border-border bg-card/70 p-3">
      <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {t("tourney_losers_pool")}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {entry.losers.map((pair, pi) => (
          <div key={pi} className="w-56">
            <PairCard
              pair={pair}
              bracket={bracket}
              settled={entry.settled}
              isCurrentRound
              liveScores={liveScores}
              students={students}
              phase={phase}
              highlight={false}
              compact={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ PODIUM (champion + top-3 + consolation standings) ════════════════════

function PodiumScreen({
  bracket,
  onFinish,
}: {
  bracket: TourneyBracket;
  onFinish: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const nameOf = (id: string) => bracket.players[id]?.name ?? "?";
  const rows = bracket.standings;
  // champion may be null: the pre-generated rounds ran out before the
  // bracket produced one and the teacher podiumed early (spec §2.4) — the
  // standings then speak for themselves, no crown is faked.
  const championName =
    bracket.champion !== null ? nameOf(bracket.champion) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center py-4">
      {rows.length > 0 && <Confetti />}
      <h2 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
        <Trophy className="size-7 text-amber-500" aria-hidden />
        {t("tourney_standings")}
      </h2>
      {championName !== null && (
        <div className="mt-4">
          <ChampionBanner name={championName} />
        </div>
      )}

      {/* top-3 pedestal — same composition as the race podium, wins-sized */}
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
              {nameOf(row.studentId)}
            </span>
            <span className="font-mono text-2xl font-bold tabular-nums text-primary">
              {row.wins}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("tourney_wins")}
            </span>
            <span className="mt-0.5 text-xs font-bold tabular-nums text-emerald-600">
              {t("c_stat_correct")}: {row.correct}
            </span>
          </div>
        ))}
      </div>

      {/* full consolation standings — every participant, total order */}
      {rows.length > 3 && (
        <div className="mt-5 w-full overflow-hidden rounded-xl border border-border bg-card">
          {rows.slice(3).map((row, i) => (
            <div
              key={row.studentId}
              className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
            >
              <span className="w-6 text-right font-bold tabular-nums text-muted-foreground">
                {i + 4}
              </span>
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                style={{ background: avatarColor(nameOf(row.studentId)) }}
              >
                {nameOf(row.studentId).slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate font-semibold">
                {nameOf(row.studentId)}
              </span>
              <span className="ml-auto shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                {t("tourney_wins")}: {row.wins}
              </span>
              <span className="w-14 shrink-0 text-right font-mono font-bold tabular-nums text-emerald-600">
                {row.correct}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* end() → the existing ResultsScreen, whose autosave freezes the
          scoreboard (score/total were kept in sync at every settle) */}
      <Button
        onClick={onFinish}
        className="mt-7 h-13 w-full max-w-sm text-base font-bold"
      >
        <Check className="size-5" aria-hidden />
        {t("tourney_finish")}
      </Button>
    </div>
  );
}

// ═══ PRESENCE STRIP (compact roster, collapsible) ═════════════════════════
// Same strip as race-board's — duplicated (not imported) for the same
// non-circularity reason as the constants above.

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
