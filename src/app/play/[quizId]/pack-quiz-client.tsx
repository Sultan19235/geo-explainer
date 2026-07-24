"use client";

// Student side of the quiz engine: renders any quiz pack through the shared
// live-session machine. Self-paced — each student walks the question list at
// their own speed while the teacher watches the live scoreboard.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Hourglass,
  Lightbulb,
  Loader2,
  Shapes,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Confetti } from "@/components/quiz/confetti";
import { DragParabola } from "@/components/quiz/drag-parabola";
import { GeoGebraFigure } from "@/components/quiz/geogebra-figure";
import { GraphCanvas } from "@/components/quiz/graph-canvas";
import { MathFormula } from "@/components/quiz/math-formula";
import { MathText } from "@/components/quiz/math-text";
import { TimerPill } from "@/components/quiz/timer-pill";
import {
  formatFunc,
  generateGraphPackQuestion,
  gradeDrag,
  graphPropertyChoiceCount,
  graphPropertyChoices,
  isGraphMode,
  isSectionId,
  toVertexForm,
  type QuadParams,
  type VertexTriple,
} from "@/lib/quiz/quadratic";
import { LanguageToggle } from "@/components/language-toggle";
import { DrillKeypad } from "@/components/quiz/drill-keypad";
import { DrillVisualView } from "@/components/quiz/drill-visual";
import { parseExact, toKatex, toPlain } from "@/lib/drill/exact";
import { mulberry32 as drillRng } from "@/lib/drill/rng";
import { getDrillTopic } from "@/lib/drill/registry";
import { UploadedDrillSource } from "@/lib/drill/uploaded/source";
import {
  decodeDrillConfig,
  decodeLevelSettings,
  defaultConfig,
  levelPassCount,
  resolveLevelConfig,
  type DrillConfig,
  type DrillLevel,
  type DrillLevelSettings,
  type DrillOptionGroup,
  type DrillProblem,
  type DrillTopic,
} from "@/lib/drill/types";
// Race explain phase renders lesson-format solution steps with the SAME
// component the lesson player uses — pure presentational ({blocks, lang}),
// so the quiz bundle gains no lesson runtime beyond it.
import { LessonBlocks } from "@/components/lesson/blocks";
import { CalculatorPanel } from "@/components/quiz/quiz-calculator";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  checkInputAnswer,
  loc,
  seededOrder,
  type Localized,
  type PackGenerator,
  type PackQuestion,
  type QuizPack,
  type SolutionStep,
} from "@/lib/quiz/pack";
import { engineT } from "@/lib/quiz/engine-strings";
import {
  ALL_FEATURES,
  raceAnswer,
  tourneyAnswer,
  type QuizFeatures,
  type RaceCorrect,
  type TourneyOpponent,
  type TourneyPodiumView,
  type TourneyResultView,
} from "@/lib/quiz/live-client";
import { useRaceSession, type RaceState } from "@/lib/quiz/use-race-session";
import {
  useTourneySession,
  type TourneyState,
} from "@/lib/quiz/use-tourney-session";
import {
  useLiveSession,
  type QuizStats,
} from "@/lib/quiz/use-live-session";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

type AnswerRecord = { ok: boolean; pick?: number; given?: string };

// A race answer as it went to the server — no `ok`: grading is server-side
// and the verdict only arrives with the reveal event.
type RaceAnswerRecord = { pick?: number; given?: string };

// Race answers are capped like the server caps race questions (spec §2.2) —
// a saved blob can never grow past one entry per possible question.
const MAX_RACE_ANS_ENTRIES = 200;

type PackExtra = {
  seed: number;
  idx: number;
  done: boolean;
  answered: Record<string, AnswerRecord>;
  // Race mode only: what THIS student submitted, keyed by question id. Kept
  // in the saved blob so a mid-question reload restores the "answered — wait"
  // screen instead of offering a second (server-rejected) attempt. Spreads at
  // the TOP level of the saved JSON next to the SavedBase keys — `raceAns` is
  // the one new key the spec reserves there (§1), collision-checked.
  raceAns: Record<string, RaceAnswerRecord>;
  // Level-mode drill rooms only: the 1-based ladder rung being played, so a
  // reload resumes at the same level (the batch restarts — mid-batch progress
  // is deliberately not restored; a fresh attempt is fairer than a guess).
  lvl?: number;
};

function identityOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

// How many selectable choices a question shows — options for mcq, or the
// choices for a graph-quadratic question (graphs/formulas for A & C, generated
// property values for B).
function choiceCount(q: PackQuestion): number {
  if (q.type === "graph-quadratic" && q.graph) {
    const g = q.graph;
    if (g.mode === "B") return graphPropertyChoiceCount(g.ask);
    if (g.mode === "D") return 0; // drag-to-build has no options
    return 1 + g.distractors.length;
  }
  return q.options?.length ?? 0;
}

export function PackQuizClient({
  quizId,
  pack,
  preview,
  generatorCode = null,
}: {
  quizId: string;
  pack: QuizPack;
  preview: boolean;
  // Uploaded drill-generator source (drill file packs) — executed only in
  // the sandbox worker.
  generatorCode?: string | null;
}) {
  if (preview) return <PreviewMode pack={pack} generatorCode={generatorCode} />;
  return <LiveMode quizId={quizId} pack={pack} generatorCode={generatorCode} />;
}

// ═══ LIVE (the real classroom flow) ══════════════════════════════════════

function LiveMode({
  quizId,
  pack: fullPack,
  generatorCode,
}: {
  quizId: string;
  pack: QuizPack;
  generatorCode: string | null;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const searchParams = useSearchParams();
  const urlCode = (searchParams.get("code") ?? "").toUpperCase();

  // The teacher may open a room with only a subset of questions; those ids
  // ride along on the join link as `?q=id1,id2,...` — in the teacher's chosen
  // order, which we preserve. Absent → the whole pack in pack order.
  // `?shuffle=1` (room-level choice) deals every student their own question
  // and option order on top of whatever the pack defaults say.
  const qParam = searchParams.get("q");
  const shuffleParam = searchParams.get("shuffle") === "1";
  const pack = useMemo<QuizPack>(() => {
    let questions = fullPack.questions;
    if (qParam) {
      const byId = new Map(fullPack.questions.map((q) => [q.id, q]));
      const seen = new Set<string>();
      const picked = qParam
        .split(",")
        .map((s) => s.trim())
        .filter((id) => {
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return byId.has(id);
        })
        .map((id) => byId.get(id)!);
      if (picked.length > 0) questions = picked;
    }
    return {
      ...fullPack,
      questions,
      shuffleQuestions: shuffleParam || fullPack.shuffleQuestions,
      shuffleOptions: shuffleParam || fullPack.shuffleOptions,
    };
  }, [fullPack, qParam, shuffleParam]);

  // Generator quiz: the teacher's ticks arrive on the join link —
  // `?sec=...&modes=...` for graph-quadratic, `?dopt=...` for drill (chosen
  // on the console at room start). A link without them — e.g. an old QR —
  // falls back to the pack's own settings.
  const secParam = searchParams.get("sec");
  const modesParam = searchParams.get("modes");
  const doptParam = searchParams.get("dopt");
  const generator = useMemo<PackGenerator | null>(() => {
    const base = fullPack.generator;
    if (!base) return null;
    if (base.type === "drill") {
      const config = decodeDrillConfig(doptParam);
      return config ? { ...base, config } : base;
    }
    const sections = (secParam ?? "").split(",").filter(isSectionId);
    const modes = (modesParam ?? "").split(",").filter(isGraphMode);
    return {
      ...base,
      sections: sections.length > 0 ? sections : base.sections,
      modes: modes.length > 0 ? modes : base.modes,
    };
  }, [fullPack.generator, secParam, modesParam, doptParam]);

  const questionCount = pack.questions.length;
  const defaultExtra = useMemo<PackExtra>(
    () => ({
      seed: Math.floor(Math.random() * 2 ** 31),
      idx: 0,
      done: false,
      answered: {},
      raceAns: {},
    }),
    [],
  );


  const session = useLiveSession<PackExtra>(urlCode, {
    storagePrefix: `ms_pack_${quizId}_`,
    defaultExtra,
    sanitizeExtra: (raw) => {
      if (typeof raw.seed !== "number" || !Number.isFinite(raw.seed)) {
        return null;
      }
      const idx =
        typeof raw.idx === "number" && Number.isInteger(raw.idx)
          ? Math.min(Math.max(raw.idx, 0), Math.max(questionCount - 1, 0))
          : 0;
      const answered: Record<string, AnswerRecord> = {};
      if (typeof raw.answered === "object" && raw.answered !== null) {
        for (const [id, value] of Object.entries(
          raw.answered as Record<string, unknown>,
        )) {
          if (typeof value === "object" && value !== null && "ok" in value) {
            const v = value as AnswerRecord;
            answered[id] = {
              ok: Boolean(v.ok),
              pick: typeof v.pick === "number" ? v.pick : undefined,
              given: typeof v.given === "string" ? v.given : undefined,
            };
          }
        }
      }
      // Race answers: restore only well-formed entries — saves from before
      // race mode simply have no raceAns key.
      const raceAns: Record<string, RaceAnswerRecord> = {};
      if (
        typeof raw.raceAns === "object" &&
        raw.raceAns !== null &&
        !Array.isArray(raw.raceAns)
      ) {
        for (const [id, value] of Object.entries(
          raw.raceAns as Record<string, unknown>,
        )) {
          if (Object.keys(raceAns).length >= MAX_RACE_ANS_ENTRIES) break;
          if (id.length === 0 || id.length > 64) continue;
          if (typeof value !== "object" || value === null) continue;
          const v = value as RaceAnswerRecord;
          if (typeof v.pick === "number" && Number.isInteger(v.pick)) {
            raceAns[id] = { pick: v.pick };
          } else if (typeof v.given === "string") {
            // 200 chars mirrors the server's accept-entry cap (spec §2.2).
            raceAns[id] = { given: v.given.slice(0, 200) };
          }
        }
      }
      // Level-mode rung: restore only a sane 1-based integer (the flow clamps
      // it to the ladder's actual height on mount).
      const lvl =
        typeof raw.lvl === "number" &&
        Number.isInteger(raw.lvl) &&
        raw.lvl >= 1 &&
        raw.lvl <= 99
          ? raw.lvl
          : undefined;
      return {
        seed: raw.seed,
        idx,
        done: raw.done === true,
        answered,
        raceAns,
        ...(lvl !== undefined ? { lvl } : {}),
      };
    },
  });

  const qOrder = useMemo(
    () =>
      pack.shuffleQuestions
        ? seededOrder(questionCount, session.extra.seed)
        : identityOrder(questionCount),
    [pack.shuffleQuestions, questionCount, session.extra.seed],
  );

  // Race mode (docs/RACE_MODE_SPEC.md §6). The join link says race (?race=1
  // — that's also what made page.tsx strip the answers) OR the server's race
  // summary shows up on /status//submit — server truth wins: if the server
  // runs a race, a student who trimmed ?race=1 off the link still races (and
  // still can't self-grade: the server ignores client scores in race rooms).
  // `?shuffle=1` is deliberately not consulted here — race forces canonical
  // option order (board bars and phone letters must agree) and the question
  // order comes only from server events, so RaceFlow ignores both shuffles.
  const raceParam = searchParams.get("race") === "1";
  const isRace = raceParam || session.raceSummary !== null;

  // Tournament mode (docs/TOURNAMENT_MODE_SPEC.md §5). Same detection
  // contract as race: the join link says tournament (?tourney=1) OR the
  // server's tourney summary shows up on /status //submit — server truth
  // wins. v1 tournaments exist only on drill generator packs, so anything
  // else keeps the normal flows even if a stray flag rides the link (the
  // console can't create such a room; this is defense, not a feature). Race
  // takes precedence on a conflict — the server 400s a room claiming both
  // modes, so only one summary can ever be real.
  const tourneyParam = searchParams.get("tourney") === "1";
  const isTourney =
    !isRace &&
    (tourneyParam || session.tourneySummary !== null) &&
    generator?.type === "drill";

  // Level mode (drill ladders): active only when the join link carries the
  // teacher's `lvl=` settings AND the topic actually ships a ladder. Same
  // channel as the drill ticks (`dopt=`) — the server never stores it. Race
  // and tournament rooms ignore the flag entirely.
  const lvlParam = searchParams.get("lvl");
  const levelMode = useMemo<{
    settings: DrillLevelSettings;
    levels: DrillLevel[];
    options: DrillOptionGroup[];
  } | null>(() => {
    if (!generator || generator.type !== "drill") return null;
    const settings = decodeLevelSettings(lvlParam);
    if (!settings) return null;
    const topic = generator.file ? null : getDrillTopic(generator.topic);
    const levels = generator.file ? generator.fileLevels : topic?.levels;
    if (!levels || levels.length < 2) return null;
    const options = generator.file
      ? (generator.fileOptions ?? [])
      : (topic?.options ?? []);
    return { settings, levels, options };
  }, [generator, lvlParam]);

  // Which student aids the teacher allowed for this room. The server's word
  // (v7, tamper-proof) wins; the join link's `off=` param covers rooms on
  // older servers; no signal at all → everything on.
  const offParam = searchParams.get("off");
  const features = useMemo<QuizFeatures>(() => {
    if (session.features) return session.features;
    if (!offParam) return ALL_FEATURES;
    const off = new Set(offParam.split(","));
    return {
      figure: !off.has("figure"),
      theory: !off.has("theory"),
      hints: !off.has("hints"),
      calculator: !off.has("calculator"),
    };
  }, [session.features, offParam]);

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      {session.phase === "checking" && (
        <CenterFrame>
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("join_pending")}
          </p>
        </CenterFrame>
      )}
      {session.phase === "join" && (
        <JoinScreen pack={pack} session={session} />
      )}
      {session.phase === "waiting" && (
        <WaitScreen name={session.studentName} />
      )}
      {/* Race: the server owns question order and pacing; this branch lives
          INSIDE the same session tree as the others so the live session
          (heartbeats, beacons, presence) never remounts. It deliberately
          spans BOTH active and ended in ONE JSX slot: race grading is
          server-side and session.stats stays at zero, so the final screen
          must come from the race state this very instance accumulated — an
          active→ended remount would wipe it and show a rank-1 student
          "0 / 0 · 0%". */}
      {isRace &&
        (session.phase === "active" || session.phase === "ended") && (
          <RaceFlow
            pack={fullPack}
            session={session}
            features={features}
            roomEnded={session.phase === "ended"}
          />
        )}
      {/* Tournament: the server owns the bracket, the round clock and the
          grading; this branch lives INSIDE the same session tree so the live
          session (heartbeats, beacons, presence) never remounts. Room `ended`
          deliberately falls through to the shared EndedScreen below (spec §5)
          — the podium, shown while the room is still active, is the real
          final screen. */}
      {isTourney &&
        (session.phase === "active" || session.phase === "ended") &&
        generator?.type === "drill" && (
          <TournamentFlow
            generator={generator}
            generatorCode={generatorCode}
            session={session}
            roomEnded={session.phase === "ended"}
          />
        )}
      {!isRace &&
        !isTourney &&
        session.phase === "active" &&
        (generator && levelMode && generator.type === "drill" ? (
          // Level mode: the ladder machine owns batches, pass/fail screens
          // and per-level configs (uploaded files run in its own worker).
          <LevelFlow
            generator={generator}
            levelMode={levelMode}
            session={session}
            pack={fullPack}
            features={features}
            generatorCode={generatorCode}
          />
        ) : generator ? (
          // Generator quiz: endless machine-made questions, no "done" — the
          // stream runs until the teacher ends the room. Uploaded drill
          // generators pre-generate their batch in the sandbox worker first.
          generator.type === "drill" && generator.file && generatorCode ? (
            <UploadedDrillLoader code={generatorCode} config={generator.config}>
              {(questionAt) => (
                <GeneratedFlow
                  generator={generator}
                  session={session}
                  pack={fullPack}
                  features={features}
                  questionAt={questionAt}
                />
              )}
            </UploadedDrillLoader>
          ) : (
            <GeneratedFlow
              generator={generator}
              session={session}
              pack={fullPack}
              features={features}
            />
          )
        ) : session.extra.done ? (
          <DoneScreen stats={session.stats} timeLeft={session.timeLeft} />
        ) : (
          <QuestionFlow
            pack={pack}
            session={session}
            qOrder={qOrder}
            features={features}
          />
        ))}
      {!isRace && !isTourney && session.phase === "ended" && (
        <EndedScreen stats={session.stats} />
      )}
      {session.phase === "kicked" && (
        <KickedScreen onRejoin={session.rejoin} />
      )}
    </main>
  );
}

type Session = ReturnType<typeof useLiveSession<PackExtra>>;

function CenterFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      {children}
    </div>
  );
}

// ═══ JOIN ═══════════════════════════════════════════════════════════════

function JoinScreen({ pack, session }: { pack: QuizPack; session: Session }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  // Pre-filled after a kick→rejoin round-trip, empty on a fresh visit.
  const [name, setName] = useState(session.studentName);
  const [code, setCode] = useState("");

  return (
    <CenterFrame>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-lg shadow-blue-950/5">
        <div className="mb-3 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-2xl">
            🧮
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {loc(pack.title, lang)}
          </h1>
          {pack.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {loc(pack.description, lang)}
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void session.join(name, code);
          }}
          noValidate
        >
          {session.joinError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
            >
              {t(`err_${session.joinError}`)}
            </p>
          )}
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="quiz-name">{t("join_name_label")}</Label>
            <Input
              id="quiz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("join_name_placeholder")}
              maxLength={20}
              autoComplete="off"
              autoCorrect="off"
              className="h-12 text-base"
            />
          </div>
          {session.needsCodeInput && (
            <div className="mb-4 flex flex-col gap-2">
              <Label htmlFor="quiz-code">{t("join_code_label")}</Label>
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
            disabled={session.joinPending}
            className="mt-1 h-12 w-full text-base font-semibold"
          >
            {session.joinPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("join_pending")}
              </>
            ) : (
              <>
                {t("join_button")}
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
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <CenterFrame>
      <div className="grid size-16 animate-pulse place-items-center rounded-2xl bg-accent text-3xl">
        ⏳
      </div>
      <h1 className="mt-5 text-xl font-bold tracking-tight">
        {t("waiting_title")}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {t("waiting_desc")}
      </p>
      <span className="mt-5 rounded-full border border-primary/20 bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
        {name}
      </span>
    </CenterFrame>
  );
}

// ═══ QUESTION FLOW ═══════════════════════════════════════════════════════

function QuestionFlow({
  pack,
  session,
  qOrder,
  features,
}: {
  pack: QuizPack;
  session: Session;
  qOrder: number[];
  features: QuizFeatures;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [inputValue, setInputValue] = useState("");
  const [calcOpen, setCalcOpen] = useState(false);

  const { extra } = session;
  const total = pack.questions.length;
  const position = Math.min(extra.idx, total - 1);
  const question = pack.questions[qOrder[position]];
  const prior = extra.answered[question.id];
  const isLast = position >= total - 1;

  const optOrder = useMemo(() => {
    const count = choiceCount(question);
    if (count === 0) return [];
    return pack.shuffleOptions
      ? seededOrder(count, (extra.seed ^ ((qOrder[position] + 1) * 7919)) >>> 0)
      : identityOrder(count);
  }, [pack.shuffleOptions, question, extra.seed, qOrder, position]);

  const answer = (record: AnswerRecord) => {
    if (prior) return;
    session.recordAnswer(record.ok, question.id);
    session.updateExtra({
      answered: { ...extra.answered, [question.id]: record },
    });
  };

  const next = () => {
    setInputValue("");
    if (isLast) {
      session.updateExtra({ done: true });
      session.markFinished();
    } else {
      session.updateExtra({ idx: position + 1 });
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      {/* header */}
      <header className="mb-3 flex items-center gap-2">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold tabular-nums">
          {t("question_label")} {position + 1}/{total}
        </span>
        <ScorePill stats={session.stats} />
        {session.stats.streak >= 3 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Flame className="size-3.5" aria-hidden />
            {session.stats.streak}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.timeLeft !== null && <TimerPill seconds={session.timeLeft} />}
        </div>
      </header>

      {/* progress */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${Math.round((Object.keys(extra.answered).length / total) * 100)}%`,
          }}
        />
      </div>

      <QuestionCard
        key={question.id}
        question={question}
        lang={lang}
        optOrder={optOrder}
        record={prior ?? null}
        features={features}
        packFormulas={pack.formulas}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onPick={(displayIndex) => {
          const pick = optOrder[displayIndex];
          // Graph choices are [equation, ...distractors], so index 0 is correct.
          const correctIndex =
            question.type === "graph-quadratic" ? 0 : question.correct;
          answer({ ok: pick === correctIndex, pick });
        }}
        onCheckInput={() => {
          if (!inputValue.trim()) return;
          answer({
            ok: checkInputAnswer(inputValue, question),
            given: inputValue,
          });
        }}
        onCheckDrag={(ok, given) => answer({ ok, given })}
      />

      {/* after-answer bar */}
      {prior && (
        <Button
          onClick={next}
          className="mt-4 h-12 w-full text-base font-semibold"
        >
          {isLast ? (
            <>
              {t("finish_button")}
              <Flag className="size-4" aria-hidden />
            </>
          ) : (
            <>
              {t("next_button")}
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      )}

      {/* calculator (panel stays mounted so the expression survives) */}
      {features.calculator && (
        <>
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-lg shadow-blue-950/10"
          >
            <Calculator className="size-4" aria-hidden />
            {t("calc_button")}
          </button>
          <CalculatorPanel
            open={calcOpen}
            title={t("calc_button")}
            closeLabel={t("close_button")}
            onClose={() => setCalcOpen(false)}
          />
        </>
      )}
    </div>
  );
}

// ═══ GENERATED FLOW (endless machine-made questions) ═════════════════════

function randomOrder(count: number): number[] {
  const order = identityOrder(count);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// A drill problem wrapped as a pack question so QuestionCard and the grading
// path treat it exactly like an authored drill question — shared by the
// registry generator and the uploaded-file path.
function drillProblemToPackQuestion(problem: DrillProblem, id: string): PackQuestion {
  return {
    id,
    type: "drill",
    text: problem.prompt,
    answer: toPlain(problem.answer, problem.answerStyle),
    keys: problem.keys,
    solution: problem.solution ? [problem.solution] : undefined,
    visual: problem.visual,
  };
}

// One drill problem from a registry topic. The seed stream makes a student's
// sequence reproducible per mount.
function generateDrillPackQuestion(
  topic: DrillTopic,
  config: DrillConfig | undefined,
  seed: number,
  seq: number,
): PackQuestion {
  const problem = topic.generate(
    drillRng((seed + seq * 2654435761) >>> 0),
    config ?? defaultConfig(topic),
  );
  return drillProblemToPackQuestion(problem, `gen-${seq}`);
}

// A pack that names a drill topic this build doesn't know (stale deployed
// client, newer pack) degrades to a visible notice instead of a crash.
const UNKNOWN_TOPIC_QUESTION = (seq: number): PackQuestion => ({
  id: `gen-${seq}`,
  type: "input",
  text: {
    kz: "Бұл тақырып қолжетімсіз — бетті жаңартып көріңіз.",
    ru: "Эта тема недоступна — обновите страницу.",
  },
  answer: "",
});

function generateAnyPackQuestion(
  generator: PackGenerator,
  drillSeed: number,
  seq: number,
): PackQuestion {
  if (generator.type === "drill") {
    const topic = getDrillTopic(generator.topic);
    if (!topic) return UNKNOWN_TOPIC_QUESTION(seq);
    return generateDrillPackQuestion(topic, generator.config, drillSeed, seq);
  }
  return generateGraphPackQuestion(
    generator.sections,
    generator.modes,
    seq,
  ) as PackQuestion;
}

// The correct answer of a drill question, rendered properly for feedback
// ("2π/3" → KaTeX fraction; the author's comma form keeps decimal style).
function drillAnswerKatex(answer: string): string {
  const parsed = parseExact(answer);
  if (!parsed) return answer;
  return `$${toKatex(parsed, answer.includes(",") ? "decimal" : "fraction")}$`;
}

// ═══ UPLOADED DRILL GENERATOR (sandbox worker) ═══════════════════════════
// The .js file runs in a Web Worker, never on this page. Problems are pure
// data, so one up-front batch (generated under a random seed with the room's
// config) lets the rest of the flow stay fully synchronous — the students'
// endless stream just wraps around a 200-problem window.

const UPLOADED_BATCH = 200;
// Tournament rounds pre-generate a deeper batch: the console's answer key
// carries 240 entries per round (spec §2.2) and the phone must never wrap
// around before the server-side key ends (the server rejects any seq beyond
// it — and no student reaches 240 answers in one round anyway).
const TOURNEY_BATCH = 240;

function UploadedDrillLoader({
  code,
  config,
  seed,
  children,
}: {
  code: string;
  config: DrillConfig | undefined;
  // Tournament rooms pass the server's ROUND seed so every phone in the
  // round generates the identical sequence (docs/TOURNAMENT_MODE_SPEC.md §5);
  // the batch regenerates whenever it changes. Absent → self-paced behavior,
  // byte-for-byte: one Math.random batch per mount.
  seed?: number;
  children: (questionAt: (seq: number) => PackQuestion) => ReactNode;
}) {
  const { lang } = useLanguage();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; questions: PackQuestion[] }
  >({ status: "loading" });

  useEffect(() => {
    let disposed = false;
    let source: UploadedDrillSource | null = null;
    // Re-runs (a new round seed) must show the spinner again, never a stale
    // batch; on the first run this re-render shows the same screen.
    setState({ status: "loading" });
    void (async () => {
      // validate:false — the harness already ran at upload; failures here
      // still surface via the per-problem spot checks in the worker.
      const load = await UploadedDrillSource.load(code, { validate: false });
      if (disposed) {
        if (load.ok) load.source.dispose();
        return;
      }
      if (!load.ok) {
        setState({ status: "error", message: load.errors.join("; ") });
        return;
      }
      source = load.source;
      const batchSeed = seed ?? Math.floor(Math.random() * 0x7fffffff);
      const result = await source.generate(
        batchSeed,
        config,
        1,
        seed !== undefined ? TOURNEY_BATCH : UPLOADED_BATCH,
      );
      source.dispose();
      source = null;
      if (disposed) return;
      if (!result.ok) {
        setState({ status: "error", message: result.errors.join("; ") });
        return;
      }
      setState({
        status: "ready",
        questions: result.problems.map((p, i) =>
          drillProblemToPackQuestion(p, `gen-${i + 1}`),
        ),
      });
    })();
    return () => {
      disposed = true;
      source?.dispose();
    };
  }, [code, config, seed]);

  if (state.status === "loading") {
    return (
      <CenterFrame>
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </CenterFrame>
    );
  }
  if (state.status === "error") {
    return (
      <CenterFrame>
        <p className="max-w-sm rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
          {lang === "ru"
            ? "Задания не загрузились — обновите страницу."
            : "Есептер жүктелмеді — бетті жаңартыңыз."}
          <span className="mt-1 block font-mono text-[11px] text-red-500">
            {state.message}
          </span>
        </p>
      </CenterFrame>
    );
  }
  const questions = state.questions;
  return <>{children((seq) => questions[(seq - 1) % questions.length])}</>;
}

// Endless stream from the pack's generator settings. Each student's device
// makes its own questions — nothing is stored, matching the old generator
// page. Runs until the room ends (no finish button).
function GeneratedFlow({
  generator,
  session,
  pack,
  features,
  questionAt,
  seed,
}: {
  generator: PackGenerator;
  session: Session;
  pack: QuizPack;
  features: QuizFeatures;
  // Uploaded generators serve from a pre-generated batch (UploadedDrillLoader);
  // absent → the built-in machines generate synchronously per question.
  questionAt?: (seq: number) => PackQuestion;
  // Server-chosen sequence seed (tournament rounds, spec §5): every device
  // given the same seed makes the same drill problems. Absent → today's
  // self-paced behavior, byte-for-byte: a per-mount Math.random stream.
  seed?: number;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [calcOpen, setCalcOpen] = useState(false);
  // Drill topics generate from a seeded stream (reproducible per mount);
  // graph-quadratic keeps its own Math.random internals.
  const [drillSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const makeQ =
    questionAt ??
    ((n: number) => generateAnyPackQuestion(generator, seed ?? drillSeed, n));
  const [seq, setSeq] = useState(1);
  const [question, setQuestion] = useState<PackQuestion>(() => makeQ(1));
  const [optOrder, setOptOrder] = useState<number[]>(() =>
    randomOrder(choiceCount(question)),
  );
  const [record, setRecord] = useState<AnswerRecord | null>(null);
  const [inputValue, setInputValue] = useState("");

  const answer = (rec: AnswerRecord) => {
    if (record) return;
    session.recordAnswer(rec.ok);
    setRecord(rec);
  };

  const next = () => {
    const n = seq + 1;
    const q = makeQ(n);
    setSeq(n);
    setQuestion(q);
    setOptOrder(randomOrder(choiceCount(q)));
    setRecord(null);
    setInputValue("");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold tabular-nums">
          {t("question_label")} {seq}
        </span>
        <ScorePill stats={session.stats} />
        {session.stats.streak >= 3 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Flame className="size-3.5" aria-hidden />
            {session.stats.streak}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.timeLeft !== null && <TimerPill seconds={session.timeLeft} />}
        </div>
      </header>

      <QuestionCard
        key={question.id}
        question={question}
        lang={lang}
        optOrder={optOrder}
        record={record}
        features={features}
        packFormulas={pack.formulas}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onPick={(displayIndex) => {
          const pick = optOrder[displayIndex];
          answer({ ok: pick === 0, pick });
        }}
        onCheckInput={() => {
          if (!inputValue.trim()) return;
          answer({
            ok: checkInputAnswer(inputValue, question),
            given: inputValue,
          });
        }}
        onCheckDrag={(ok, given) => answer({ ok, given })}
      />

      {record && (
        <Button
          onClick={next}
          className="mt-4 h-12 w-full text-base font-semibold"
        >
          {t("next_button")}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}

      {features.calculator && (
        <>
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-lg shadow-blue-950/10"
          >
            <Calculator className="size-4" aria-hidden />
            {t("calc_button")}
          </button>
          <CalculatorPanel
            open={calcOpen}
            title={t("calc_button")}
            closeLabel={t("close_button")}
            onClose={() => setCalcOpen(false)}
          />
        </>
      )}
    </div>
  );
}

// ═══ LEVEL FLOW (drill ladders — Деңгейлер) ════════════════════════════════
// The self-paced ladder machine: play a batch of `settings.size` questions at
// the current rung's difficulty; ≥ pass% correct unlocks the next rung, less
// retries the same rung with FRESH problems (the global seq never rewinds, so
// no student ever sees a repeat). Registry topics generate synchronously; an
// uploaded file keeps ONE sandbox worker alive for the whole room and
// generates each batch on demand. The rung rides every /submit (reportLevel)
// so the teacher's board draws the ladder, and persists in the saved blob so
// a reload resumes at the same level (with a fresh batch).

function LevelFlow({
  generator,
  levelMode,
  session,
  pack,
  features,
  generatorCode,
}: {
  generator: PackGenerator & { type: "drill" };
  levelMode: {
    settings: DrillLevelSettings;
    levels: DrillLevel[];
    options: DrillOptionGroup[];
  };
  session: Session;
  pack: QuizPack;
  features: QuizFeatures;
  generatorCode: string | null;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const { settings, levels, options } = levelMode;
  const height = levels.length;
  const need = levelPassCount(settings);
  const [calcOpen, setCalcOpen] = useState(false);

  // 1-based rung, restored from the saved blob (clamped to this ladder).
  const [rung, setRung] = useState(() => {
    const saved = session.extra.lvl;
    return typeof saved === "number" && saved >= 1
      ? Math.min(Math.floor(saved), height)
      : 1;
  });
  // The top-rung celebration fires once; afterwards the student keeps
  // practicing at the top difficulty, batch after batch.
  const [conquered, setConquered] = useState(false);

  const [drillSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  // Monotonic across every batch and retry — a seq is never reused.
  const seqStart = useRef(1);
  // One worker for the whole room (uploaded files only), loaded lazily.
  const sourceRef = useRef<UploadedDrillSource | null>(null);
  useEffect(() => {
    return () => {
      sourceRef.current?.dispose();
      sourceRef.current = null;
    };
  }, []);

  const [batch, setBatch] = useState<PackQuestion[] | null>(null);
  const [batchErr, setBatchErr] = useState<string | null>(null);
  const [done, setDone] = useState(0); // answered in the current batch
  const [correct, setCorrect] = useState(0);
  const [screen, setScreen] = useState<"play" | "result">("play");
  const [record, setRecord] = useState<AnswerRecord | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [optOrder, setOptOrder] = useState<number[]>([]);

  const loadBatch = useCallback(
    async (forRung: number) => {
      setBatch(null);
      setBatchErr(null);
      setDone(0);
      setCorrect(0);
      setRecord(null);
      setInputValue("");
      setScreen("play");
      const config = resolveLevelConfig({ options }, levels[forRung - 1]);
      const from = seqStart.current;
      seqStart.current += settings.size;
      let questions: PackQuestion[];
      if (generator.file) {
        if (!generatorCode) {
          setBatchErr("generator code missing");
          return;
        }
        if (!sourceRef.current) {
          const load = await UploadedDrillSource.load(generatorCode, {
            validate: false,
          });
          if (!load.ok) {
            setBatchErr(load.errors.join("; "));
            return;
          }
          sourceRef.current = load.source;
        }
        const result = await sourceRef.current.generate(
          drillSeed,
          config,
          from,
          settings.size,
        );
        if (!result.ok) {
          setBatchErr(result.errors.join("; "));
          return;
        }
        questions = result.problems.map((p, i) =>
          drillProblemToPackQuestion(p, `gen-${from + i}`),
        );
      } else {
        const topic = getDrillTopic(generator.topic);
        questions = Array.from({ length: settings.size }, (_, i) =>
          topic
            ? generateDrillPackQuestion(topic, config, drillSeed, from + i)
            : UNKNOWN_TOPIC_QUESTION(from + i),
        );
      }
      setOptOrder(randomOrder(choiceCount(questions[0])));
      setBatch(questions);
    },
    [generator, generatorCode, levels, options, settings.size, drillSeed],
  );

  // Rung entry: tell the board, persist for reload, build the batch.
  useEffect(() => {
    session.reportLevel(rung);
    session.updateExtra({ lvl: rung });
    void loadBatch(rung);
    // session/loadBatch identities are stable enough; this must run per rung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rung]);

  const question = batch && done < batch.length ? batch[done] : null;

  const answer = (rec: AnswerRecord) => {
    if (record || !question) return;
    session.recordAnswer(rec.ok);
    if (rec.ok) setCorrect((c) => c + 1);
    setRecord(rec);
  };

  const next = () => {
    if (!batch) return;
    const n = done + 1;
    setRecord(null);
    setInputValue("");
    setDone(n);
    if (n >= batch.length) {
      setScreen("result");
    } else {
      setOptOrder(randomOrder(choiceCount(batch[n])));
    }
  };

  // Clearing the whole ladder fires once: the sticky finished flag reaches
  // the teacher's board, and later top-level batches celebrate normally.
  const passed = correct >= need;
  const topRun = screen === "result" && passed && rung >= height;
  useEffect(() => {
    if (topRun && !conquered) {
      setConquered(true);
      session.markFinished();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topRun]);

  // ── End-of-batch screen ──────────────────────────────────────────────────
  if (screen === "result") {
    return (
      <CenterFrame>
        {passed && <Confetti />}
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-4xl" aria-hidden>
            {topRun ? "🏆" : passed ? "🎉" : "💪"}
          </p>
          <h2 className="mt-2 text-xl font-bold">
            {topRun
              ? t("lvl_all_done_title")
              : passed
                ? t("lvl_result_title_pass")
                : t("lvl_result_title_fail")}
          </h2>
          <p className="mt-3 text-3xl font-bold tabular-nums">
            {correct}/{settings.size}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lvl_need")
              .replace("{need}", String(need))
              .replace("{size}", String(settings.size))}
          </p>
          {topRun ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("lvl_all_done_desc")}
            </p>
          ) : passed ? (
            <p className="mt-3 text-sm font-semibold text-primary">
              {t("lvl_unlocked").replace("{n}", String(rung + 1))}
            </p>
          ) : null}
          <Button
            onClick={() => {
              if (passed && rung < height) setRung(rung + 1);
              else void loadBatch(rung);
            }}
            className="mt-5 h-12 w-full text-base font-semibold"
          >
            {topRun
              ? t("lvl_practice_more")
              : passed
                ? t("lvl_continue")
                : t("lvl_retry")}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </CenterFrame>
    );
  }

  // ── Batch loading / error ────────────────────────────────────────────────
  if (batchErr) {
    return (
      <CenterFrame>
        <p className="max-w-sm rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
          {lang === "ru"
            ? "Задания не загрузились — обновите страницу."
            : "Есептер жүктелмеді — бетті жаңартыңыз."}
          <span className="mt-1 block font-mono text-[11px] text-red-500">
            {batchErr}
          </span>
        </p>
      </CenterFrame>
    );
  }
  if (!batch || !question) {
    return (
      <CenterFrame>
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="mt-3 text-sm text-muted-foreground">{t("lvl_loading")}</p>
      </CenterFrame>
    );
  }

  // ── Play ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold text-primary tabular-nums">
          <Trophy className="size-3.5" aria-hidden />
          {t("level_label")} {rung}/{height}
        </span>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold tabular-nums">
          {done + 1}/{settings.size}
        </span>
        {session.stats.streak >= 3 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Flame className="size-3.5" aria-hidden />
            {session.stats.streak}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.timeLeft !== null && <TimerPill seconds={session.timeLeft} />}
        </div>
      </header>

      {/* Batch progress: filled = answered (green/red by outcome). */}
      <div className="mb-4 flex gap-1" aria-hidden>
        {Array.from({ length: settings.size }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < done
                ? "bg-primary"
                : i === done && record
                  ? record.ok
                    ? "bg-primary"
                    : "bg-red-400"
                  : "bg-border",
            )}
          />
        ))}
      </div>

      <QuestionCard
        key={question.id}
        question={question}
        lang={lang}
        optOrder={optOrder}
        record={record}
        features={features}
        packFormulas={pack.formulas}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onPick={(displayIndex) => {
          const pick = optOrder[displayIndex];
          answer({ ok: pick === 0, pick });
        }}
        onCheckInput={() => {
          if (!inputValue.trim()) return;
          answer({
            ok: checkInputAnswer(inputValue, question),
            given: inputValue,
          });
        }}
        onCheckDrag={(ok, given) => answer({ ok, given })}
      />

      {record && (
        <Button
          onClick={next}
          className="mt-4 h-12 w-full text-base font-semibold"
        >
          {done + 1 >= settings.size ? t("finish_button") : t("next_button")}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}

      {features.calculator && (
        <>
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-lg shadow-blue-950/10"
          >
            <Calculator className="size-4" aria-hidden />
            {t("calc_button")}
          </button>
          <CalculatorPanel
            open={calcOpen}
            title={t("calc_button")}
            closeLabel={t("close_button")}
            onClose={() => setCalcOpen(false)}
          />
        </>
      )}
    </div>
  );
}

// ═══ RACE FLOW (Kahoot-style lockstep, docs/RACE_MODE_SPEC.md §6) ══════════
// The server owns question order and pacing; the phone renders whichever
// phase the race stream says. Six screens: waiting / get-ready / question /
// reveal / explain / podium. Everything here is additive — self-paced rooms
// never mount this component.

// 200ms ticker on the LOCAL monotonic clock, running only while `active`.
// Race countdowns compare this against the performance.now() anchors from
// use-race-session.ts — the device wall-clock (which students can change)
// never participates. 200ms keeps the bar visually smooth without burning
// the phone's battery on rAF.
function usePerfNow(active: boolean): number {
  const [now, setNow] = useState(() =>
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  useEffect(() => {
    if (!active) return;
    setNow(performance.now()); // catch up immediately on (re)activation
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// Centered full-height screen INSIDE the race layout (the outer wrapper owns
// min-h-dvh; CenterFrame would double it up).
function RaceCenter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      {children}
    </div>
  );
}

// "4-орын / 26" — both placeholders substituted at the call site, same as
// c_kick_confirm / c_saved_missing elsewhere in the engine. Returns null for
// a student the standings haven't ranked yet (the server sends rank:null for
// anyone whose first contact came after the current reveal) — callers hide
// the pill rather than print a literal "null-орын".
function raceRankLine(
  t: ReturnType<typeof engineT>,
  rank: number | null | undefined,
  of: number,
): string | null {
  if (typeof rank !== "number" || !Number.isFinite(rank) || rank < 1) {
    return null;
  }
  return t("race_rank_line")
    .replace("{n}", String(rank))
    .replace("{of}", String(of));
}

// Slim countdown bar + seconds. Turns red for the last quarter.
function RaceCountdown({
  remainingMs,
  totalMs,
}: {
  remainingMs: number | null;
  totalMs: number | null;
}) {
  if (remainingMs === null || totalMs === null || totalMs <= 0) return null;
  const frac = Math.max(0, Math.min(1, remainingMs / totalMs));
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full",
            frac < 0.25 ? "bg-red-500" : "bg-primary",
          )}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <span
        className={cn(
          "w-9 text-right text-sm font-bold tabular-nums",
          frac < 0.25 ? "text-red-600" : "text-primary",
        )}
      >
        {Math.ceil(remainingMs / 1000)}
      </span>
    </div>
  );
}

// Rebuilds the answer fields the server component stripped (page.tsx,
// ?race=1) from what the reveal/explain events carry, so QuestionCard's
// existing answered rendering — green correct option, red wrong pick, the
// "Дұрыс жауап" line, the solution-highlight replay on the figure — works
// untouched. The canonical index maps 1:1 onto the display index because
// race forces canonical option order.
function patchRaceQuestion(
  q: PackQuestion,
  correct: RaceCorrect | undefined,
  solutionGeogebra?: string[],
): PackQuestion {
  const out: PackQuestion = { ...q };
  if (correct) {
    if ("pick" in correct) out.correct = correct.pick;
    else out.answer = correct.answer;
  }
  if (solutionGeogebra && solutionGeogebra.length > 0) {
    out.solutionGeogebra = solutionGeogebra;
  }
  return out;
}

// The reveal-phase result banner: correct/wrong verdict, this question's
// points, streak flame from 2 in a row, and the rank line.
function RaceRevealBanner({ view }: { view: NonNullable<RaceState["reveal"]> }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const ok = view.you.answered && view.you.ok;
  return (
    <section
      className={cn(
        "mb-4 rounded-2xl border p-5 text-center shadow-lg shadow-blue-950/5",
        ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
      )}
    >
      <p
        className={cn(
          "text-2xl font-bold tracking-tight",
          ok ? "text-emerald-700" : "text-red-700",
        )}
      >
        {ok
          ? t("feedback_correct")
          : view.you.answered
            ? t("feedback_wrong")
            : t("race_time_up")}
      </p>
      {ok && (
        <p className="quiz-pop mt-1 text-3xl font-bold tabular-nums text-emerald-600">
          +{view.you.points}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {view.you.streak >= 2 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Flame className="size-3.5" aria-hidden />
            {t("race_streak")}: {view.you.streak}
          </span>
        )}
        {raceRankLine(t, view.you.rank, view.you.of) !== null && (
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums">
            {raceRankLine(t, view.you.rank, view.you.of)}
          </span>
        )}
        <span className="rounded-full border border-primary/20 bg-accent px-2.5 py-1 text-xs font-bold text-primary tabular-nums">
          {t("race_points")}: {view.you.totalPoints}
        </span>
      </div>
    </section>
  );
}

// Explain-phase worked solution. Lesson-format steps win; the flat solution
// list renders as numbered rows (same markup as the self-paced reveal block).
function RaceExplainPanel({
  steps,
  flat,
}: {
  steps: SolutionStep[] | null;
  flat: Localized[] | null;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  if (!steps && (!flat || flat.length === 0)) return null;
  return (
    <div className="mt-4">
      <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t("solution_label")}
      </p>
      {steps ? (
        <div className="space-y-3">
          {steps.map((step, i) => (
            <section
              key={i}
              className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-blue-950/5"
            >
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
                <span className="grid size-5 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-bold tabular-nums">
                  {i + 1}
                </span>
                {loc(step.name, lang)}
              </p>
              <LessonBlocks blocks={step.blocks} lang={lang} />
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-blue-950/5">
          <div className="space-y-2 text-sm leading-relaxed">
            {flat!.map((step, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-bold tabular-nums text-primary">
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1">
                  <MathText text={loc(step, lang)} />
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RaceFlow({
  pack,
  session,
  features,
  roomEnded = false,
}: {
  // The WHOLE pack (answer-stripped server-side on ?race=1 links), not the
  // ?q=-filtered subset: question membership and order are server truth in
  // race mode, and a mangled q= param must not fake a "pack changed" error.
  pack: QuizPack;
  session: Session;
  features: QuizFeatures;
  // The room reached 'ended' (teacher pressed Аяқтау after the podium, or
  // the 45-min clock fired). RaceFlow stays mounted to show the final result
  // it already holds — the self-paced EndedScreen only knows client-local
  // stats, which race mode never writes.
  roomEnded?: boolean;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [calcOpen, setCalcOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Race SSE next to (never instead of) the live session — the session tree
  // above stays mounted, so heartbeats/beacons/presence are untouched.
  const race = useRaceSession({
    code: session.code,
    studentId: session.studentId,
    // Mounted only once the room is active AND a race; a dead room's stream
    // would 404-loop, so stop reconnecting the moment the room ends (the
    // last-received state stays available for the final screen).
    enabled: !roomEnded,
    summary: session.raceSummary,
  });
  const st = race.state;

  const byId = useMemo(
    () => new Map(pack.questions.map((q) => [q.id, q])),
    [pack.questions],
  );

  const now = usePerfNow(st.phase === "question");

  // A new question must never inherit the previous one's half-typed input:
  // in race mode the server advances regardless of whether the student
  // submitted, so an unanswered "12" would otherwise sit pre-filled in the
  // next input question, one accidental Check away from being graded.
  useEffect(() => {
    setInputValue("");
  }, [st.qId]);

  const question = st.qId ? (byId.get(st.qId) ?? null) : null;
  const myAns = st.qId ? session.extra.raceAns[st.qId] : undefined;
  // Server's word OR our own persisted submission — the local record covers
  // the gap between pressing Check and the next server echo (and reloads).
  const answered = myAns !== undefined || st.answered;

  // Header pills: prefer the freshest server-reported numbers.
  const points =
    st.podium?.you.points ?? st.reveal?.you.totalPoints ?? st.you?.points ?? 0;
  const streak = st.reveal?.you.streak ?? st.you?.streak ?? 0;

  // Question clock. totalMs is a server-side difference (skew-free);
  // remainingMs runs off the local monotonic anchor.
  const totalMs =
    st.openAt !== null && st.deadline !== null ? st.deadline - st.openAt : null;
  const remainingMs =
    st.deadlineLocal !== null ? Math.max(0, st.deadlineLocal - now) : null;
  const preOpen =
    st.phase === "question" && st.openLocal !== null && now < st.openLocal;

  // Persist FIRST (a reload during the in-flight POST must restore the
  // "answered — wait" screen; the server keeps only the first answer per
  // question anyway), then fire the POST. raceAnswer's return is ignored on
  // purpose: the reveal event is the source of truth for what counted.
  const submitAnswer = (payload: RaceAnswerRecord) => {
    const qId = st.qId;
    if (!qId || answered || st.phase !== "question") return;
    if (
      qId in session.extra.raceAns ||
      Object.keys(session.extra.raceAns).length < MAX_RACE_ANS_ENTRIES
    ) {
      session.updateExtra({
        raceAns: { ...session.extra.raceAns, [qId]: payload },
      });
    }
    setInputValue("");
    void raceAnswer(session.code, session.studentId, st.qIndex, payload);
  };

  // The current question id isn't in our pack: the pack was re-uploaded while
  // the room ran. Grading would silently disagree with the screen — stop hard
  // and tell the student to re-join (the fresh load fetches the new pack).
  const contentPhase =
    st.phase === "question" || st.phase === "reveal" || st.phase === "explain";
  if (contentPhase && st.qId !== null && question === null) {
    return (
      <CenterFrame>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-amber-50 text-2xl">
            📦
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("race_pack_changed")}
          </h1>
        </div>
      </CenterFrame>
    );
  }

  // ── The six screens ───────────────────────────────────────────────────────
  let body: ReactNode;
  if (roomEnded && !st.podium) {
    // Room ended without this phone ever seeing a podium (teacher ended
    // mid-race, 45-min clock, or a reload lost the race state): a plain
    // final card with whatever server-reported totals we still hold —
    // never the self-paced 0/0 stats.
    const finalCorrect = st.you?.correct ?? 0;
    body = (
      <RaceCenter>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
          <h1 className="text-xl font-bold tracking-tight">
            {t("ended_title")}
          </h1>
          {(points > 0 || finalCorrect > 0) && (
            <p className="mt-3 text-sm font-semibold text-muted-foreground">
              {t("race_points")}:{" "}
              <span className="tabular-nums text-foreground">{points}</span>
              {st.qCount > 0 && (
                <>
                  {" · "}
                  <Check
                    className="inline size-4 text-emerald-600"
                    aria-hidden
                  />{" "}
                  <span className="tabular-nums text-foreground">
                    {finalCorrect}/{st.qCount}
                  </span>
                </>
              )}
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {t("ended_desc")}
          </p>
        </div>
      </RaceCenter>
    );
  } else if (st.phase === "question" && question && preOpen) {
    // 2. get-ready: the server bakes a 3s runway into openAt. Clamped to 3
    // because usePerfNow's first post-event render still holds the tick from
    // BEFORE the (possibly minutes-long) reveal/explain dwell — without the
    // ceiling the circle flashes that whole gap in seconds for one frame.
    const count =
      st.openLocal !== null
        ? Math.min(3, Math.max(1, Math.ceil((st.openLocal - now) / 1000)))
        : 3;
    body = (
      <RaceCenter>
        <p className="text-lg font-bold tracking-tight text-muted-foreground">
          {t("race_get_ready")}
        </p>
        {/* key remounts per second so quiz-pop replays on each count */}
        <div
          key={count}
          className="quiz-pop mt-5 grid size-28 place-items-center rounded-full bg-primary text-6xl font-bold tabular-nums text-white shadow-lg shadow-blue-950/20"
        >
          {count}
        </div>
      </RaceCenter>
    );
  } else if (st.phase === "question" && question) {
    // 3. question — three sub-states share the ticking bar.
    body = (
      <>
        <RaceCountdown remainingMs={remainingMs} totalMs={totalMs} />
        {answered ? (
          <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-lg shadow-blue-950/5">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50">
              <Check className="size-7 text-emerald-600" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-bold tracking-tight">
              {t("race_answered_wait")}
            </h2>
          </section>
        ) : remainingMs !== null && remainingMs <= 0 ? (
          <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-lg shadow-blue-950/5">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-50">
              <Hourglass className="size-7 text-amber-600" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-bold tracking-tight">
              {t("race_time_up")}
            </h2>
          </section>
        ) : (
          <QuestionCard
            key={st.qId}
            question={question}
            lang={lang}
            // Canonical option order, always: the board's distribution bars
            // and every phone must show the same letters (spec §6). The pick
            // we submit IS the display index for the same reason.
            optOrder={identityOrder(choiceCount(question))}
            record={null}
            features={features}
            hintsAfterAnswer
            packFormulas={pack.formulas}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onPick={(displayIndex) => submitAnswer({ pick: displayIndex })}
            onCheckInput={() => {
              if (!inputValue.trim()) return;
              // 200 chars mirrors the server's accept-entry cap — anything
              // longer could never grade correct anyway.
              submitAnswer({ given: inputValue.slice(0, 200) });
            }}
          />
        )}
      </>
    );
  } else if (
    (st.phase === "reveal" || st.phase === "explain") &&
    question
  ) {
    // 4 + 5. reveal / explain. The reveal view individualizes the banner and
    // supplies the correct answer for the card; explain adds the worked
    // solution. A resync can land here before the reopened stream delivered
    // the reveal content — then `revealed` carries the card until it does.
    const rv = st.reveal;
    const ex = st.phase === "explain" ? st.explain : null;
    const patched = patchRaceQuestion(
      question,
      rv?.correct,
      ex?.solutionGeogebra,
    );
    const record: AnswerRecord | null = rv
      ? { ok: rv.you.answered && rv.you.ok, pick: myAns?.pick, given: myAns?.given }
      : null;
    const steps =
      ex && Array.isArray(ex.solutionSteps) && ex.solutionSteps.length > 0
        ? (ex.solutionSteps as SolutionStep[])
        : null;
    body = (
      <>
        {rv && <RaceRevealBanner view={rv} />}
        <QuestionCard
          // Remount between reveal and explain: the figure re-mounts and the
          // auto-open effect replays the fresh solutionGeogebra highlights.
          key={`${st.qId}-${st.phase}`}
          question={patched}
          lang={lang}
          optOrder={identityOrder(choiceCount(patched))}
          record={record}
          revealed={!rv}
          features={features}
          hintsAfterAnswer
          packFormulas={pack.formulas}
        />
        {ex && <RaceExplainPanel steps={steps} flat={ex.solution ?? null} />}
      </>
    );
  } else if (st.phase === "podium" && st.podium) {
    // 6. podium. The room's `ended` still routes to EndedScreen above.
    const pd = st.podium;
    const rankLine = raceRankLine(t, pd.you.rank, pd.you.of);
    const onPodium =
      pd.you.rank !== null && pd.you.rank >= 1 && pd.you.rank <= 3;
    body = (
      <RaceCenter>
        {onPodium && <Confetti />}
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent">
            <Trophy className="size-6 text-primary" aria-hidden />
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("race_your_result")}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {rankLine ?? `${pd.you.points} ${t("race_points").toLowerCase()}`}
          </p>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {t("race_points")}:{" "}
            <span className="tabular-nums text-foreground">{pd.you.points}</span>
            {" · "}
            <Check className="inline size-4 text-emerald-600" aria-hidden />{" "}
            <span className="tabular-nums text-foreground">
              {pd.you.correct}
              {st.qCount > 0 ? `/${st.qCount}` : ""}
            </span>
          </p>
        </div>
        {pd.top.length > 0 && (
          <div className="mt-6 w-full max-w-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("race_leaderboard")}
            </p>
            <div className="space-y-2">
              {pd.top.slice(0, 3).map((row, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left",
                    i === 0 ? "border-amber-300 bg-amber-50" : "border-border",
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {["🥇", "🥈", "🥉"][i]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {row.name}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {row.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </RaceCenter>
    );
  } else {
    // 1. waiting — phase idle, or a phase whose content hasn't streamed in
    // yet (the reopened stream's snapshot fills it within moments).
    body = (
      <RaceCenter>
        <div className="grid size-16 animate-pulse place-items-center rounded-2xl bg-accent text-3xl">
          🏁
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight">
          {t("race_waiting")}
        </h2>
        <span className="mt-4 rounded-full border border-primary/20 bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground tabular-nums">
          {t("race_points")}: {points}
        </span>
      </RaceCenter>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      {/* header — same pill row as self-paced, with race points instead of
          the correct-count (scoring is server-owned here) */}
      <header className="mb-3 flex items-center gap-2">
        {st.qIndex >= 0 && st.qCount > 0 && (
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold tabular-nums">
            {t("question_label")} {Math.min(st.qIndex + 1, st.qCount)}/{st.qCount}
          </span>
        )}
        <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-accent px-2.5 py-1 text-xs font-bold text-primary tabular-nums">
          {points}
          <span className="sr-only">{t("race_points")}</span>
        </span>
        {streak >= 2 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Flame className="size-3.5" aria-hidden />
            {streak}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.timeLeft !== null && <TimerPill seconds={session.timeLeft} />}
        </div>
      </header>

      {body}

      {/* calculator (panel stays mounted so the expression survives phases) */}
      {features.calculator && (
        <>
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-lg shadow-blue-950/10"
          >
            <Calculator className="size-4" aria-hidden />
            {t("calc_button")}
          </button>
          <CalculatorPanel
            open={calcOpen}
            title={t("calc_button")}
            closeLabel={t("close_button")}
            onClose={() => setCalcOpen(false)}
          />
        </>
      )}
    </div>
  );
}

// ═══ TOURNAMENT FLOW (FIFA-playoff duels, docs/TOURNAMENT_MODE_SPEC.md §5) ══
// The server owns the bracket, the round clock and the grading (exact-value
// port); the phone renders whichever phase the tournament stream says. Six
// screens: waiting / pairing / get-ready / duel / result / podium. Everything
// here is additive — self-paced and race rooms never mount this component,
// and the room's `ended` routes to the shared EndedScreen like any other
// mode (the podium, shown while the room is active, is the real finale).

type DrillPackGenerator = Extract<PackGenerator, { type: "drill" }>;

// Answer-verdict dwell times. Green is a quick confirmation; red holds at
// least this long so the verdict registers even when the teacher set the
// lockout to «Жоқ» (0s) — a real lockout extends the dwell to its full span.
const TOURNEY_GREEN_MS = 450;
const TOURNEY_RED_MS = 700;

function TournamentFlow({
  generator,
  generatorCode,
  session,
  roomEnded = false,
}: {
  generator: DrillPackGenerator;
  generatorCode: string | null;
  session: Session;
  // The room reached 'ended'. TournamentFlow stays mounted (race precedent:
  // one JSX slot spanning active AND ended) to keep showing the podium it
  // already holds — the self-paced EndedScreen only knows client-local
  // stats, which tournament mode never writes (the fabricated-0/0 bug).
  roomEnded?: boolean;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);

  // Tournament SSE next to (never instead of) the live session — the session
  // tree above stays mounted, so heartbeats/beacons/presence are untouched.
  const tourney = useTourneySession({
    code: session.code,
    studentId: session.studentId,
    // A dead room's stream would 404-loop; stop reconnecting the moment the
    // room ends (the last-received state stays for the final screen).
    enabled: !roomEnded,
    summary: session.tourneySummary,
  });
  const st = tourney.state;

  // One local monotonic ticker drives the get-ready count, the round bar and
  // the lockout countdown — running only while a duel can be on screen.
  const now = usePerfNow(st.phase === "duel");

  // Round clock. totalMs is a server-side difference (skew-free);
  // remainingMs runs off the local monotonic anchor.
  const totalMs =
    st.openAt !== null && st.deadline !== null ? st.deadline - st.openAt : null;
  const remainingMs =
    st.deadlineLocal !== null ? Math.max(0, st.deadlineLocal - now) : null;
  const preOpen =
    st.phase === "duel" && st.openLocal !== null && now < st.openLocal;

  const wins = st.you?.wins ?? 0;

  // Registry topic for the built-in generators; uploaded files serve through
  // UploadedDrillLoader (worker sandbox) instead.
  const topic = generator.file ? null : (getDrillTopic(generator.topic) ?? null);
  const uploadedCode = generator.file ? generatorCode : null;

  // ── The six screens ───────────────────────────────────────────────────────
  const renderBody = (
    questionAt?: (seq: number) => PackQuestion,
  ): ReactNode => {
    if (st.podium && (st.phase === "podium" || roomEnded)) {
      // 6. podium — kept on screen after the teacher ends the room (Аяқтау
      // follows the podium; the ranking is the tournament's real finale).
      return <TourneyPodiumScreen podium={st.podium} />;
    }
    if (roomEnded) {
      // Room ended without this phone ever seeing a podium (teacher ended
      // mid-tournament, 45-min clock, or a reload lost the state): a plain
      // final card with whatever server-reported totals we still hold —
      // never the self-paced 0/0 stats.
      const finalWins = st.you?.wins ?? 0;
      const finalCorrect = st.you?.totalCorrect ?? 0;
      return (
        <section className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
          <h1 className="text-xl font-bold tracking-tight">
            {t("ended_title")}
          </h1>
          {(finalWins > 0 || finalCorrect > 0) && (
            <p className="mt-3 text-sm font-semibold text-muted-foreground">
              {t("tourney_wins")}:{" "}
              <span className="tabular-nums text-foreground">{finalWins}</span>
              {" · "}
              <Check className="inline size-4 text-emerald-600" aria-hidden />{" "}
              <span className="tabular-nums text-foreground">
                {finalCorrect}
              </span>
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {t("ended_desc")}
          </p>
        </section>
      );
    }
    if (st.role === "waiting" && st.round > 0) {
      // A latecomer sits outside every draw until the teacher's next one —
      // whatever the phase, their screen is the same patient card.
      return (
        <RaceCenter>
          <div className="grid size-16 animate-pulse place-items-center rounded-2xl bg-accent text-3xl">
            ⏳
          </div>
          <h2 className="mt-5 max-w-sm text-lg font-bold tracking-tight">
            {t("tourney_waiting_next")}
          </h2>
        </RaceCenter>
      );
    }
    if (st.phase === "pairing") {
      // 2. the draw reveal.
      return <TourneyPairingScreen st={st} />;
    }
    if (st.phase === "duel" && preOpen) {
      // 3. get-ready: the server bakes a 3s runway into openAt. Clamped to 3
      // for the same first-render reason as the race counterpart (usePerfNow
      // still holds the tick from before the pairing dwell for one frame).
      const count =
        st.openLocal !== null
          ? Math.min(3, Math.max(1, Math.ceil((st.openLocal - now) / 1000)))
          : 3;
      return (
        <RaceCenter>
          <p className="text-lg font-bold tracking-tight text-muted-foreground">
            {t("tourney_get_ready")}
          </p>
          {/* key remounts per second so quiz-pop replays on each count */}
          <div
            key={count}
            className="quiz-pop mt-5 grid size-28 place-items-center rounded-full bg-primary text-6xl font-bold tabular-nums text-white shadow-lg shadow-blue-950/20"
          >
            {count}
          </div>
        </RaceCenter>
      );
    }
    if (st.phase === "duel" && st.seed !== null) {
      // 4. the duel itself. Problems come from the round's SHARED seed —
      // every phone in the round generates the identical sequence.
      const roundSeed = st.seed;
      const makeQ =
        questionAt ??
        ((n: number) =>
          topic
            ? generateDrillPackQuestion(topic, generator.config, roundSeed, n)
            : UNKNOWN_TOPIC_QUESTION(n));
      return (
        <TourneyDuel
          // Every round starts a fresh duel component (clean seq/counts).
          key={`duel-${st.round}`}
          st={st}
          session={session}
          makeQ={makeQ}
          now={now}
          remainingMs={remainingMs}
          totalMs={totalMs}
        />
      );
    }
    if (st.phase === "result" && st.result) {
      // 5. the settle card.
      return <TourneyResultScreen result={st.result} />;
    }
    // 1. waiting — phase idle, or a phase whose content hasn't streamed in
    // yet (the reopened stream's snapshot fills it within moments).
    return (
      <RaceCenter>
        <div className="grid size-16 animate-pulse place-items-center rounded-2xl bg-accent text-3xl">
          🏆
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight">
          {t("tourney_waiting_draw")}
        </h2>
        {wins > 0 && (
          <span className="mt-4 rounded-full border border-primary/20 bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground tabular-nums">
            {t("tourney_wins")}: {wins}
          </span>
        )}
      </RaceCenter>
    );
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      {/* header — round pill + tournament wins instead of the correct-count
          (scoring is server-owned here) */}
      <header className="mb-3 flex items-center gap-2">
        {st.round > 0 && (
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold tabular-nums">
            {t("tourney_round_n").replace("{n}", String(st.round))}
          </span>
        )}
        <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-accent px-2.5 py-1 text-xs font-bold text-primary tabular-nums">
          <Trophy className="size-3.5" aria-hidden />
          {wins}
          <span className="sr-only">{t("tourney_wins")}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {session.timeLeft !== null && <TimerPill seconds={session.timeLeft} />}
        </div>
      </header>

      {uploadedCode !== null && st.seed !== null ? (
        // The batch for the round's shared seed regenerates in the sandbox
        // worker the moment the seed is known (with the `duel` event; earlier
        // when a resync snapshot during pairing already carried it) — the
        // 3s get-ready runway absorbs the worker spin-up.
        <UploadedDrillLoader
          code={uploadedCode}
          config={generator.config}
          seed={st.seed}
        >
          {(questionAt) => <>{renderBody(questionAt)}</>}
        </UploadedDrillLoader>
      ) : (
        renderBody(undefined)
      )}
    </div>
  );
}

// One duel: the drill loop against the round's shared sequence. The SERVER
// grades every answer (spec §2.5) — each accepted answer settles its seq and
// the response carries the authoritative counts, so this component only
// renders verdicts: green flash → next problem; red flash + full-keypad
// lockout overlay with a ticking countdown → next problem. A 409 bad_seq
// silently jumps to the server's expected position; a 429 locked re-anchors
// the freeze. The solution line and the visual's solution reveal stay hidden
// on purpose (speed context, spec §5).
function TourneyDuel({
  st,
  session,
  makeQ,
  now,
  remainingMs,
  totalMs,
}: {
  st: TourneyState;
  session: Session;
  makeQ: (seq: number) => PackQuestion;
  now: number;
  remainingMs: number | null;
  totalMs: number | null;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);

  // Server-confirmed position and counts, seeded from the snapshot so a
  // reload mid-duel resumes at the right problem (localStorage deliberately
  // holds nothing tournament-specific — spec §1).
  const [seq, setSeq] = useState(() => st.you?.seq ?? 1);
  const [question, setQuestion] = useState<PackQuestion>(() =>
    makeQ(st.you?.seq ?? 1),
  );
  // Only the correct-count renders (the score bar); the wrong-count exists
  // server-side and on the result card.
  const [correct, setCorrect] = useState(() => st.you?.correct ?? 0);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  // The verdict being flashed and its performance.now() start.
  const [flash, setFlash] = useState<{
    kind: "right" | "wrong";
    at: number;
  } | null>(null);
  // Lockout anchor from the answer response; merged below with the hook's
  // own anchor (which a resync snapshot may carry).
  const [lockUntil, setLockUntil] = useState<number | null>(null);

  // The generator closure is frozen for this mount (the caller keys this
  // component by round), so a ref keeps goTo stable without stale problems.
  const makeQRef = useRef(makeQ);
  makeQRef.current = makeQ;
  const goTo = useCallback((n: number) => {
    setSeq(n);
    setQuestion(makeQRef.current(n));
    setInput("");
    setInvalid(false);
  }, []);

  // A resync snapshot with a LARGER seq is fresher than local state (answers
  // land strictly in seq order, spec §2.5): adopt it wholesale — this also
  // repairs a phone whose previous load already answered further ahead.
  const seqRef = useRef(seq);
  seqRef.current = seq;
  useEffect(() => {
    const you = st.you;
    if (!you || you.seq <= seqRef.current) return;
    setCorrect(you.correct);
    setFlash(null);
    goTo(you.seq);
  }, [st.you, goTo]);

  // Effective freeze end: the answer response's anchor OR the snapshot's,
  // whichever reaches further (both are local monotonic anchors).
  const lockEnd = Math.max(lockUntil ?? 0, st.lockUntilLocal ?? 0) || null;
  const lockRemain = lockEnd !== null ? Math.max(0, lockEnd - now) : 0;
  const locked = lockRemain > 0;

  // Advance once the verdict dwell — extended by the lockout after a wrong
  // answer — has fully passed. Driven by the shared 200ms ticker.
  useEffect(() => {
    if (!flash) return;
    const readyAt = Math.max(
      flash.at + (flash.kind === "right" ? TOURNEY_GREEN_MS : TOURNEY_RED_MS),
      flash.kind === "wrong" && lockEnd !== null ? lockEnd : 0,
    );
    if (now < readyAt) return;
    setFlash(null);
    goTo(seq + 1);
  }, [flash, now, lockEnd, seq, goTo]);

  const submit = async () => {
    const given = input.trim();
    if (!given || busy || locked || flash !== null) return;
    if (remainingMs !== null && remainingMs <= 0) return; // clock ran out
    // A syntactically incomplete answer ("3," or "5/") blocks the check with
    // a hint instead of wasting a graded attempt — same rule as drill
    // practice.
    if (parseExact(given) === null) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    const res = await tourneyAnswer(
      session.code,
      session.studentId,
      st.round,
      seq,
      // 24 chars mirrors the server's per-answer-key cap (spec §2.2); the
      // keypad's own 12-char limit makes this a formality.
      given.slice(0, 24),
    );
    setBusy(false);
    if (res.ok) {
      // The response is authoritative: adopt the count, flash the verdict;
      // the advance effect moves on once the dwell (and lockout) pass.
      if (typeof res.correct === "number") setCorrect(res.correct);
      if (res.right === true) {
        setFlash({ kind: "right", at: performance.now() });
        setLockUntil(null);
      } else {
        setFlash({ kind: "wrong", at: performance.now() });
        setLockUntil(
          typeof res.lockRemainMs === "number" && res.lockRemainMs > 0
            ? performance.now() + res.lockRemainMs
            : null,
        );
      }
    } else if (res.error === "bad_seq" && typeof res.expect === "number") {
      // Our position drifted (double-tap, an answer from a previous load):
      // silently jump to the server's expected problem — no flash (spec §5).
      goTo(res.expect);
    } else if (res.error === "locked" && typeof res.remainMs === "number") {
      // A press slipped in during the freeze — re-anchor the overlay.
      setLockUntil(performance.now() + res.remainMs);
    }
    // Anything else (network blip, phase already closed): keep the input so
    // the student can just press Check again; the next event/summary decides.
  };

  const youLabel = lang === "ru" ? "Ты" : "Сен";

  return (
    <>
      <RaceCountdown remainingMs={remainingMs} totalMs={totalMs} />

      {/* you-vs-opponent bars (a trio shows one bar per opponent); a bye
          plays solo — no bar */}
      {st.opponents.length > 0 && (
        <div className="mb-4 space-y-2">
          {st.opponents.map((opp, i) => (
            <TourneyScoreBar
              key={opp.id ?? `${opp.name}:${i}`}
              youLabel={youLabel}
              mine={correct}
              opp={opp}
            />
          ))}
        </div>
      )}

      {remainingMs !== null && remainingMs <= 0 ? (
        <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-lg shadow-blue-950/5">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-50">
            <Hourglass className="size-7 text-amber-600" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-bold tracking-tight">
            {t("race_time_up")}
          </h2>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
          <div className="text-[17px] font-medium leading-relaxed">
            <MathText text={loc(question.text, lang)} />
          </div>

          {question.visual && (
            <div className="mt-4 rounded-xl border border-border bg-background px-2 py-2">
              {/* revealed stays false even after a wrong answer — no solution
                  reveal mid-duel */}
              <DrillVisualView visual={question.visual} revealed={false} />
            </div>
          )}

          {/* answer display — flashes the server's verdict */}
          <div
            className={cn(
              "mt-4 rounded-xl border-[1.5px] bg-background px-4 py-3 text-center",
              flash?.kind === "right"
                ? "border-emerald-500 bg-emerald-50"
                : flash?.kind === "wrong" || invalid
                  ? "border-red-400 bg-red-50"
                  : "border-border",
            )}
          >
            <div
              className={cn(
                "min-h-9 font-math text-3xl tabular-nums",
                input === "" && "text-muted-foreground/50",
              )}
            >
              {input === "" ? t("input_placeholder") : input}
            </div>
          </div>
          {invalid && (
            <p className="mt-1.5 text-xs font-medium text-red-600">
              {t("input_invalid")}
            </p>
          )}

          <div className="relative mt-3">
            <DrillKeypad
              keys={question.keys ?? []}
              value={input}
              onChange={(next) => {
                if (locked || flash !== null) return;
                setInvalid(false);
                setInput(next);
              }}
              onSubmit={() => void submit()}
              submitLabel={t("check_button")}
              submitMode="check"
            />
            {/* full-keypad lockout overlay with the ticking freeze */}
            {locked && (
              <div className="absolute -inset-1 z-10 flex flex-col items-center justify-center gap-1 rounded-xl bg-red-50/95">
                <p className="text-sm font-bold text-red-700">
                  {t("tourney_locked")}
                </p>
                <p className="text-4xl font-bold tabular-nums text-red-600">
                  {Math.ceil(lockRemain / 1000)}
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

// The duel score header: «Сен 8 ▓▓▓░░ 6 Аружан» — a proportional two-color
// bar with the numbers inside it, plus the opponent's away/left badge from
// the presence relay. A scoreless duel splits 50/50.
function TourneyScoreBar({
  youLabel,
  mine,
  opp,
}: {
  youLabel: string;
  mine: number;
  opp: TourneyOpponent;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const theirs = opp.correct ?? 0;
  const total = mine + theirs;
  const frac = total > 0 ? mine / total : 0.5;
  const badge =
    opp.connected === false
      ? t("tourney_left_badge")
      : opp.away === true
        ? t("tourney_away_badge")
        : null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold">
        <span>{youLabel}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {badge && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
              {badge}
            </span>
          )}
          <span className="truncate">{opp.name}</span>
        </span>
      </div>
      <div className="flex h-7 overflow-hidden rounded-full border border-border bg-card">
        <div
          className="flex min-w-10 items-center bg-primary pl-2.5 text-xs font-bold text-white tabular-nums transition-all"
          style={{ width: `${Math.round(frac * 100)}%` }}
        >
          {mine}
        </div>
        <div className="flex min-w-10 flex-1 items-center justify-end bg-border pr-2.5 text-xs font-bold text-foreground tabular-nums">
          {theirs}
        </div>
      </div>
    </div>
  );
}

// The draw reveal — role-aware: main duel, losers pool (with the trio
// variant), bye, and the lucky-loser comeback banner (spec §5 screen 2).
function TourneyPairingScreen({ st }: { st: TourneyState }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const names = st.opponents.map((o) => o.name);
  return (
    <RaceCenter>
      {st.luckyLoser && (
        <p className="mb-4 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-bold text-amber-700">
          {t("tourney_lucky_loser")}
        </p>
      )}
      {st.role === "losers" && (
        <p className="mb-4 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("tourney_losers_pool")}
        </p>
      )}
      {st.role === "bye" ? (
        <>
          <div className="grid size-16 place-items-center rounded-2xl bg-accent text-3xl">
            🎟️
          </div>
          <p className="mt-5 max-w-sm text-lg font-bold tracking-tight">
            {t("tourney_bye")}
          </p>
        </>
      ) : names.length === 0 ? (
        // Latecomer draw slot (defensive — the caller routes them earlier).
        <p className="max-w-sm text-lg font-bold tracking-tight">
          {t("tourney_waiting_next")}
        </p>
      ) : (
        <>
          <div className="grid size-16 place-items-center rounded-2xl bg-accent text-3xl">
            ⚔️
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {names.length > 1 ? t("tourney_trio") : t("tourney_your_opponent")}
          </p>
          <div className="mt-2 space-y-1">
            {names.map((name) => (
              <p key={name} className="text-2xl font-bold tracking-tight">
                {name}
              </p>
            ))}
          </div>
        </>
      )}
    </RaceCenter>
  );
}

// The settle card: champion / won / eliminated / lost, with the duel score
// («9 : 6») per opponent. Eliminated students read that the game continues —
// the next draw puts them in the losers pool (spec §5 screen 5).
function TourneyResultScreen({ result }: { result: TourneyResultView }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const headline = result.champion
    ? t("tourney_champion")
    : result.won
      ? t("tourney_you_won")
      : result.eliminated
        ? t("tourney_eliminated")
        : t("tourney_you_lost");
  const upbeat = result.champion || result.won;
  return (
    <RaceCenter>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <div
          className={cn(
            "mx-auto mb-3 grid size-12 place-items-center rounded-xl text-2xl",
            upbeat ? "bg-emerald-50" : "bg-red-50",
          )}
        >
          {result.champion ? "🏆" : result.won ? "🎉" : "🥊"}
        </div>
        <h2
          className={cn(
            "text-xl font-bold tracking-tight",
            upbeat ? "text-emerald-700" : "text-red-700",
          )}
        >
          {headline}
        </h2>
        <div className="mt-4 space-y-1.5">
          {result.opponents.map((opp, i) => (
            <p
              key={opp.id ?? `${opp.name}:${i}`}
              className="text-sm font-semibold text-muted-foreground"
            >
              <span className="tabular-nums text-foreground">
                {result.you.correct}
              </span>
              {" : "}
              <span className="tabular-nums text-foreground">
                {opp.correct ?? 0}
              </span>{" "}
              {opp.name}
            </p>
          ))}
          {result.opponents.length === 0 && (
            // A bye round settled — only your own tally to show.
            <p className="text-sm font-semibold text-muted-foreground">
              <Check className="inline size-4 text-emerald-600" aria-hidden />{" "}
              <span className="tabular-nums text-foreground">
                {result.you.correct}
              </span>
            </p>
          )}
        </div>
        {!result.champion && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("tourney_waiting_draw")}
          </p>
        )}
      </div>
    </RaceCenter>
  );
}

// The final screen: champion, top-3 with medals, your rank; confetti for the
// top-3 (spec §5 screen 6).
function TourneyPodiumScreen({ podium }: { podium: TourneyPodiumView }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const onPodium = podium.you.rank >= 1 && podium.you.rank <= 3;
  const rankLine = raceRankLine(t, podium.you.rank, podium.you.of);
  return (
    <RaceCenter>
      {onPodium && <Confetti />}
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent">
          <Trophy className="size-6 text-primary" aria-hidden />
        </div>
        {/* champion is null when the pre-generated rounds ran out before the
            bracket produced one (spec §2.4) — the card then leads with rank */}
        {podium.champion && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("tourney_final")}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              🏆 {podium.champion.name}
            </p>
          </>
        )}
        <p
          className={cn(
            "text-sm font-semibold text-muted-foreground",
            podium.champion && "mt-4",
          )}
        >
          {t("race_your_result")}
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {rankLine ?? String(podium.you.correct)}
        </p>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t("tourney_wins")}:{" "}
          <span className="tabular-nums text-foreground">
            {podium.you.wins}
          </span>
          {" · "}
          <Check className="inline size-4 text-emerald-600" aria-hidden />{" "}
          <span className="tabular-nums text-foreground">
            {podium.you.correct}
          </span>
        </p>
      </div>
      {podium.top.length > 0 && (
        <div className="mt-6 w-full max-w-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("tourney_standings")}
          </p>
          <div className="space-y-2">
            {podium.top.slice(0, 3).map((row, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left",
                  i === 0 ? "border-amber-300 bg-amber-50" : "border-border",
                )}
              >
                <span className="text-xl" aria-hidden>
                  {["🥇", "🥈", "🥉"][i]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {row.name}
                </span>
                <span className="text-xs font-bold text-muted-foreground tabular-nums">
                  {t("tourney_wins")}: {row.wins}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {row.correct}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </RaceCenter>
  );
}

function ScorePill({ stats }: { stats: QuizStats }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 tabular-nums">
      <Check className="size-3.5" aria-hidden />
      {stats.correct}
      <span className="sr-only">{t("score_label")}</span>
    </span>
  );
}

// One question with options / input + feedback. Shared with preview mode:
// `revealed` renders the correct answer without a student pick.
function QuestionCard({
  question,
  lang,
  optOrder,
  record,
  revealed = false,
  features = ALL_FEATURES,
  hintsAfterAnswer = false,
  packFormulas,
  inputValue,
  onInputChange,
  onPick,
  onCheckInput,
  onCheckDrag,
}: {
  question: PackQuestion;
  lang: "kz" | "ru";
  optOrder: number[];
  record: AnswerRecord | null;
  revealed?: boolean;
  // Which aids the teacher allowed (previews default to everything).
  features?: QuizFeatures;
  // Race mode keeps the hint chip after answering — the reveal/explain
  // phases are a class discussion and the hints are part of it. Self-paced
  // stays default-false: there the solution takes over once answered.
  hintsAfterAnswer?: boolean;
  // Pack-level formula sheet — the "Формулалар" panel's fallback when the
  // question has no theory of its own.
  packFormulas?: Localized[];
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onPick?: (displayIndex: number) => void;
  onCheckInput?: () => void;
  onCheckDrag?: (ok: boolean, given: string) => void;
}) {
  const t = engineT(lang);
  const answered = record !== null || revealed;
  // Two-step answering: tapping an option only selects it; the Check button
  // below confirms. Guards against misclicks on phones. Callers remount this
  // card per question (key=question.id), which resets the selection.
  const [selected, setSelected] = useState<number | null>(null);
  // Drill: a syntactically incomplete answer ("3," or "5/") blocks the check
  // with a hint instead of counting as wrong. Reset by the per-question
  // remount and by any further typing.
  const [drillInvalid, setDrillInvalid] = useState(false);

  // ── Student aids: figure / formulas / hints behind collapsible chips ──────
  // Read first, imagine first — the figure starts closed on purpose.
  const theory =
    question.theory && question.theory.length > 0
      ? question.theory
      : packFormulas && packFormulas.length > 0
        ? packFormulas
        : null;
  const hints =
    question.hints && question.hints.length > 0 ? question.hints : null;
  const showFigure = Boolean(question.geogebra) && features.figure;
  const showTheory = Boolean(theory) && features.theory;
  // Hints are for the thinking phase; once answered the solution takes over
  // (unless the mode says otherwise — see hintsAfterAnswer above).
  const showHints =
    Boolean(hints) && features.hints && (!answered || hintsAfterAnswer);

  const [figureOpen, setFigureOpen] = useState(false);
  // Mounted on first open, then kept alive and only CSS-hidden: the applet
  // is expensive to build, cheap to hide.
  const [figureMounted, setFigureMounted] = useState(false);
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);
  const [hintCount, setHintCount] = useState(1);

  // Solution highlights auto-open the figure at reveal so the worked steps
  // and the drawing they talk about land together.
  const hasSolutionFigure =
    showFigure && Boolean(question.solutionGeogebra?.length);
  useEffect(() => {
    if (answered && hasSolutionFigure) {
      setFigureMounted(true);
      setFigureOpen(true);
    }
  }, [answered, hasSolutionFigure]);
  const graph = question.type === "graph-quadratic" ? question.graph : null;
  // Mode A shows graph thumbnails as options; B & C show a text list. In every
  // mode the correct choice is index 0, matching the grading in QuestionFlow.
  const graphThumbs = graph?.mode === "A" ? [graph.equation, ...graph.distractors] : null;
  let graphTextOptions: ReactNode[] = [];
  if (graph?.mode === "C") {
    graphTextOptions = [graph.equation, ...graph.distractors].map((p, i) => (
      <MathFormula key={i} formula={formatFunc(p)} />
    ));
  } else if (graph?.mode === "B") {
    graphTextOptions = graphPropertyChoices(graph.equation, graph.ask, lang).map(
      (s, i) => <span key={i}>{s}</span>,
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
      <div className="text-[17px] font-medium leading-relaxed">
        <MathText text={loc(question.text, lang)} />
      </div>

      {question.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={question.image}
          alt=""
          className="mt-4 max-h-72 w-full rounded-xl border border-border object-contain"
        />
      )}

      {(showFigure || showTheory || showHints) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {showFigure && (
            <AidChip
              icon={Shapes}
              label={t("figure_button")}
              open={figureOpen}
              onClick={() => {
                setFigureMounted(true);
                setFigureOpen((o) => !o);
              }}
            />
          )}
          {showTheory && (
            <AidChip
              icon={BookOpen}
              label={t("formulas_button")}
              open={theoryOpen}
              onClick={() => setTheoryOpen((o) => !o)}
            />
          )}
          {showHints && (
            <AidChip
              icon={Lightbulb}
              tone="amber"
              label={
                hints!.length > 1 && hintsOpen
                  ? `${t("hint_button")} ${Math.min(hintCount, hints!.length)}/${hints!.length}`
                  : t("hint_button")
              }
              open={hintsOpen}
              onClick={() => setHintsOpen((o) => !o)}
            />
          )}
        </div>
      )}

      {showFigure && figureMounted && (
        <div className={cn("mt-3", !figureOpen && "hidden")}>
          <GeoGebraFigure
            figure={question.geogebra!}
            extraCommands={answered ? question.solutionGeogebra : undefined}
          />
        </div>
      )}

      {showTheory && theoryOpen && (
        <div className="mt-3 rounded-xl border border-border bg-background p-4">
          <div className="space-y-2 text-[15px] leading-relaxed">
            {theory!.map((line, i) => (
              <p key={i}>
                <MathText text={loc(line, lang)} />
              </p>
            ))}
          </div>
        </div>
      )}

      {showHints && hintsOpen && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="space-y-2.5 text-[15px] leading-relaxed">
            {hints!.slice(0, hintCount).map((hint, i) => (
              <div key={i} className="flex gap-2.5">
                <Lightbulb
                  className="mt-1 size-4 shrink-0 text-amber-600"
                  aria-hidden
                />
                <p className="min-w-0 flex-1">
                  <MathText text={loc(hint, lang)} />
                </p>
              </div>
            ))}
          </div>
          {hintCount < hints!.length && (
            <button
              type="button"
              onClick={() => setHintCount((n) => n + 1)}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 active:bg-amber-100"
            >
              <Lightbulb className="size-3.5" aria-hidden />
              {t("hint_next")} · {hintCount + 1}/{hints!.length}
            </button>
          )}
        </div>
      )}

      {/* Mode A — show the equation, pick its graph. */}
      {graphThumbs && (
        <div className="mt-4">
          <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-5 text-center [background-size:18px_18px]">
            <MathFormula
              formula={formatFunc(graphThumbs[0])}
              className="text-2xl font-medium text-blue-950 sm:text-3xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {optOrder.map((originalIndex, displayIndex) => (
              <GraphOptionTile
                key={originalIndex}
                params={graphThumbs[originalIndex]}
                label={OPTION_LABELS[displayIndex]}
                answered={answered}
                isSelected={!answered && selected === displayIndex}
                showCorrect={answered && originalIndex === 0}
                showWrong={
                  answered && record?.pick === originalIndex && originalIndex !== 0
                }
                onPick={() => setSelected(displayIndex)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modes B & C — show the graph, pick a property (B) or the formula (C). */}
      {graph && (graph.mode === "B" || graph.mode === "C") && (
        <div className="mt-4">
          <div className="mx-auto mb-4 h-60 w-full max-w-sm overflow-hidden rounded-xl border border-border sm:h-72">
            <GraphCanvas params={graph.equation} />
          </div>
          <div className="grid gap-2.5">
            {optOrder.map((originalIndex, displayIndex) => {
              const isCorrect = originalIndex === 0;
              const isPicked = record?.pick === originalIndex;
              const isSel = !answered && selected === displayIndex;
              return (
                <button
                  key={originalIndex}
                  type="button"
                  disabled={answered}
                  onClick={() => setSelected(displayIndex)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border-[1.5px] border-border bg-background px-4 py-3 text-left text-[15px] transition-colors",
                    !answered && "hover:border-primary/50 hover:bg-accent",
                    isSel && "border-primary bg-accent ring-2 ring-primary/15",
                    answered && isCorrect && "border-emerald-500 bg-emerald-50",
                    answered && isPicked && !isCorrect && "border-red-400 bg-red-50",
                    answered && !isCorrect && !isPicked && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-xs font-bold",
                      isSel && "border-primary bg-primary text-white",
                      answered && isCorrect &&
                        "border-emerald-500 bg-emerald-500 text-white",
                      answered && isPicked && !isCorrect &&
                        "border-red-400 bg-red-400 text-white",
                    )}
                  >
                    {OPTION_LABELS[displayIndex]}
                  </span>
                  {graphTextOptions[originalIndex]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode D — show the equation, drag a parabola to match it. */}
      {graph?.mode === "D" && (
        <DragQuestion
          target={graph.equation}
          record={record}
          revealed={revealed}
          onCheckDrag={onCheckDrag}
        />
      )}

      {question.type === "mcq" && question.options && (
        <div className="mt-4 grid gap-2.5">
          {optOrder.map((originalIndex, displayIndex) => {
            const isCorrect = originalIndex === question.correct;
            const isPicked = record?.pick === originalIndex;
            const isSel = !answered && selected === displayIndex;
            return (
              <button
                key={originalIndex}
                type="button"
                disabled={answered}
                onClick={() => setSelected(displayIndex)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-[1.5px] border-border bg-background px-4 py-3 text-left text-[15px] transition-colors",
                  !answered && "hover:border-primary/50 hover:bg-accent",
                  isSel && "border-primary bg-accent ring-2 ring-primary/15",
                  answered && isCorrect && "border-emerald-500 bg-emerald-50",
                  answered &&
                    isPicked &&
                    !isCorrect &&
                    "border-red-400 bg-red-50",
                  answered && !isCorrect && !isPicked && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-xs font-bold",
                    isSel && "border-primary bg-primary text-white",
                    answered && isCorrect &&
                      "border-emerald-500 bg-emerald-500 text-white",
                    answered && isPicked && !isCorrect &&
                      "border-red-400 bg-red-400 text-white",
                  )}
                >
                  {OPTION_LABELS[displayIndex]}
                </span>
                <MathText text={loc(question.options![originalIndex], lang)} />
              </button>
            );
          })}
        </div>
      )}

      {/* confirm bar for choice questions (input & drag have their own) */}
      {!answered &&
        onPick &&
        (Boolean(graphThumbs) ||
          graphTextOptions.length > 0 ||
          (question.type === "mcq" && question.options)) && (
          <Button
            className="mt-4 h-12 w-full text-base font-semibold"
            disabled={selected === null}
            onClick={() => {
              if (selected !== null) onPick(selected);
            }}
          >
            {t("check_button")}
            <Check className="size-4" aria-hidden />
          </Button>
        )}

      {question.type === "input" && (
        <div className="mt-4">
          {answered ? (
            <div
              className={cn(
                "rounded-xl border-[1.5px] px-4 py-3 font-mono text-base",
                revealed || record?.ok
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-red-400 bg-red-50",
              )}
            >
              {revealed ? question.answer : record?.given}
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onCheckInput?.();
              }}
            >
              <Input
                value={inputValue ?? ""}
                onChange={(e) => onInputChange?.(e.target.value)}
                placeholder={t("input_placeholder")}
                autoComplete="off"
                autoCorrect="off"
                className="h-12 flex-1 text-base"
              />
              <Button type="submit" className="h-12 px-5 font-semibold">
                {t("check_button")}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* drill visual brick (number line / figure): base picture from the start, solution
          arrows revealed with the answer */}
      {question.type === "drill" && question.visual && (
        <div className="mt-4 rounded-xl border border-border bg-background px-2 py-2">
          <DrillVisualView visual={question.visual} revealed={answered} />
        </div>
      )}

      {/* drill — on-screen keypad, exact-value answers */}
      {question.type === "drill" && (
        <div className="mt-4">
          <div
            className={cn(
              "rounded-xl border-[1.5px] bg-background px-4 py-3 text-center",
              answered
                ? revealed || record?.ok
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-red-400 bg-red-50"
                : drillInvalid
                  ? "border-red-400 bg-red-50"
                  : "border-border",
            )}
          >
            <div
              className={cn(
                "min-h-9 font-math text-3xl tabular-nums",
                !answered &&
                  (inputValue ?? "") === "" &&
                  "text-muted-foreground/50",
              )}
            >
              {answered
                ? revealed
                  ? (question.answer ?? "")
                  : (record?.given ?? "")
                : (inputValue ?? "") === ""
                  ? t("input_placeholder")
                  : inputValue}
            </div>
          </div>
          {drillInvalid && !answered && (
            <p className="mt-1.5 text-xs font-medium text-red-600">
              {t("input_invalid")}
            </p>
          )}
          {!answered && (
            <div className="mt-3">
              <DrillKeypad
                keys={question.keys ?? []}
                value={inputValue ?? ""}
                onChange={(next) => {
                  setDrillInvalid(false);
                  onInputChange?.(next);
                }}
                onSubmit={() => {
                  if (!(inputValue ?? "").trim()) return;
                  if (parseExact(inputValue ?? "") === null) {
                    setDrillInvalid(true);
                    return;
                  }
                  onCheckInput?.();
                }}
                submitLabel={t("check_button")}
                submitMode="check"
              />
            </div>
          )}
        </div>
      )}

      {/* feedback */}
      {answered && (
        <div className="mt-4">
          {!revealed && (
            <p
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-bold",
                record?.ok
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700",
              )}
            >
              {record?.ok ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <X className="size-4" aria-hidden />
              )}
              {record?.ok ? t("feedback_correct") : t("feedback_wrong")}
            </p>
          )}
          {!revealed && record && !record.ok && question.type !== "graph-quadratic" && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("correct_answer_label")}:{" "}
              <span className="font-semibold text-foreground">
                <MathText
                  text={
                    question.type === "mcq" && question.options
                      ? loc(question.options[question.correct ?? 0], lang)
                      : question.type === "drill"
                        ? drillAnswerKatex(question.answer ?? "")
                        : (question.answer ?? "")
                  }
                />
              </span>
            </p>
          )}
          {question.solution && question.solution.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-background p-4">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("solution_label")}
              </p>
              <div className="space-y-2 text-sm leading-relaxed">
                {question.solution.map((step, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-bold tabular-nums text-primary">
                      {i + 1}
                    </span>
                    <p className="min-w-0 flex-1">
                      <MathText text={loc(step, lang)} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// A collapsible-aid toggle under the question text (figure / formulas /
// hints). Chevron shows the state; amber tone marks the hint chip apart from
// the reference aids.
function AidChip({
  icon: Icon,
  label,
  open,
  tone = "blue",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  open: boolean;
  tone?: "blue" | "amber";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-sm font-semibold transition-colors",
        tone === "amber"
          ? open
            ? "border-amber-400 bg-amber-50 text-amber-700"
            : "border-border bg-background text-amber-700 hover:bg-amber-50/60"
          : open
            ? "border-primary bg-accent text-primary"
            : "border-border bg-background text-primary hover:bg-accent/60",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
      {open ? (
        <ChevronUp className="size-3.5 opacity-60" aria-hidden />
      ) : (
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      )}
    </button>
  );
}

// One selectable graph option (mode A): a live GraphCanvas — crisp, pannable,
// zoomable, with numbered axes — inside a pickable tile. A tap picks; a drag
// pans the plot without picking (the guard below tells them apart by how far
// the pointer moved).
function GraphOptionTile({
  params,
  label,
  answered,
  isSelected,
  showCorrect,
  showWrong,
  onPick,
}: {
  params: QuadParams;
  label: string;
  answered: boolean;
  isSelected: boolean;
  showCorrect: boolean;
  showWrong: boolean;
  onPick: () => void;
}) {
  const downAt = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      role="button"
      tabIndex={answered ? -1 : 0}
      aria-label={label}
      aria-pressed={isSelected}
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = downAt.current;
        downAt.current = null;
        if (answered || !start) return;
        // Moved more than a few px → it was a pan, not a pick.
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) onPick();
      }}
      onKeyDown={(e) => {
        if (!answered && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl border-2 bg-white outline-none transition-all focus-visible:ring-3 focus-visible:ring-ring/50",
        !answered && "cursor-pointer hover:border-primary/50",
        showCorrect
          ? "border-emerald-500 ring-4 ring-emerald-500/15"
          : showWrong
            ? "border-red-400 ring-4 ring-red-400/15"
            : isSelected
              ? "border-primary ring-4 ring-primary/15"
              : "border-border",
        answered && !showCorrect && !showWrong && "opacity-55",
      )}
    >
      <span
        className={cn(
          "absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-md text-xs font-bold text-white",
          showCorrect ? "bg-emerald-500" : showWrong ? "bg-red-400" : "bg-primary",
        )}
      >
        {label}
      </span>
      <GraphCanvas params={params} />
    </div>
  );
}

// Mode D: the student drags a parabola to match `target`, then presses Check.
// Manages its own attempt state; reports the graded result up via onCheckDrag.
function DragQuestion({
  target,
  record,
  revealed,
  onCheckDrag,
}: {
  target: QuadParams;
  record: AnswerRecord | null;
  revealed: boolean;
  onCheckDrag?: (ok: boolean, given: string) => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [attempt, setAttempt] = useState<VertexTriple>({ a: 1, m: 0, n: 0 });
  const answered = record !== null || revealed;

  // What the plot shows: preview → the target; answered → the saved attempt;
  // otherwise the live attempt being dragged.
  let shown: VertexTriple = attempt;
  if (revealed) {
    shown = toVertexForm(target);
  } else if (record?.given) {
    try {
      shown = JSON.parse(record.given) as VertexTriple;
    } catch {
      shown = attempt;
    }
  }
  // After a wrong answer, overlay the target so the student sees the right shape.
  const reference = record !== null && !record.ok ? target : undefined;

  return (
    <div className="mt-4">
      <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-4 text-center [background-size:18px_18px]">
        <MathFormula
          formula={formatFunc(target)}
          className="text-xl font-medium text-blue-950 sm:text-2xl"
        />
      </div>
      <DragParabola
        value={shown}
        onChange={answered ? undefined : setAttempt}
        disabled={answered}
        reference={reference}
      />
      {!answered && (
        <>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {lang === "ru"
              ? "Двигайте точки · пустое место — перемещение · два пальца — масштаб"
              : "Нүктелерді жылжытыңыз · бос жер — жылжыту · екі саусақ — үлкейту"}
          </p>
          <Button
            className="mt-3 h-12 w-full text-base font-semibold"
            onClick={() =>
              onCheckDrag?.(gradeDrag(attempt, target), JSON.stringify(attempt))
            }
          >
            {t("check_button")}
          </Button>
        </>
      )}
    </div>
  );
}

// ═══ DONE / ENDED ═════════════════════════════════════════════════════════

function DoneScreen({
  stats,
  timeLeft,
}: {
  stats: QuizStats;
  timeLeft: number | null;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <CenterFrame>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <h1 className="text-xl font-bold tracking-tight">{t("done_title")}</h1>
        <ScoreSummary stats={stats} />
        <p className="mt-3 text-sm text-muted-foreground">{t("done_desc")}</p>
        {timeLeft !== null && (
          <div className="mt-4 flex justify-center">
            <TimerPill seconds={timeLeft} />
          </div>
        )}
      </div>
    </CenterFrame>
  );
}

function EndedScreen({ stats }: { stats: QuizStats }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const total = stats.correct + stats.wrong;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  return (
    <CenterFrame>
      {pct >= 70 && <Confetti />}
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <h1 className="text-xl font-bold tracking-tight">{t("ended_title")}</h1>
        <ScoreSummary stats={stats} />
        <p className="mt-3 text-sm text-muted-foreground">{t("ended_desc")}</p>
      </div>
    </CenterFrame>
  );
}

// The teacher removed this student. Re-joining is allowed by design (a wrong
// kick shouldn't lock a kid out of the lesson) — the teacher can always kick
// again.
function KickedScreen({ onRejoin }: { onRejoin: () => void }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <CenterFrame>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-red-50 text-2xl">
          🚪
        </div>
        <h1 className="text-xl font-bold tracking-tight">
          {t("kicked_title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("kicked_desc")}</p>
        <Button onClick={onRejoin} className="mt-5 w-full font-semibold">
          {t("kicked_rejoin")}
        </Button>
      </div>
    </CenterFrame>
  );
}

function ScoreSummary({ stats }: { stats: QuizStats }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const total = stats.correct + stats.wrong;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t("result_label")}
      </p>
      <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
        {stats.correct}
        <span className="text-xl text-muted-foreground"> / {total}</span>
      </p>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">{pct}%</p>
    </div>
  );
}

// ═══ PREVIEW (admin) ══════════════════════════════════════════════════════

function PreviewMode({
  pack,
  generatorCode,
}: {
  pack: QuizPack;
  generatorCode: string | null;
}) {
  const generator = pack.generator;
  if (generator && pack.questions.length === 0) {
    if (generator.type === "drill" && generator.file && generatorCode) {
      return (
        <UploadedDrillLoader code={generatorCode} config={generator.config}>
          {(questionAt) => (
            <GeneratedPreview generator={generator} pack={pack} questionAt={questionAt} />
          )}
        </UploadedDrillLoader>
      );
    }
    return <GeneratedPreview generator={generator} pack={pack} />;
  }
  return <ListPreview pack={pack} />;
}

// Preview of a generator quiz: sample questions made on the spot. Generated
// after mount (not during server render) so the server and browser never
// disagree about the random question.
function GeneratedPreview({
  generator,
  pack,
  questionAt,
}: {
  generator: PackGenerator;
  pack: QuizPack;
  questionAt?: (seq: number) => PackQuestion;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [seq, setSeq] = useState(0);
  const [previewSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [question, setQuestion] = useState<PackQuestion | null>(null);

  useEffect(() => {
    setQuestion(
      questionAt
        ? questionAt(seq + 1)
        : generateAnyPackQuestion(generator, previewSeed, seq + 1),
    );
  }, [generator, previewSeed, seq, questionAt]);

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded bg-amber-100 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-800">
            {t("preview_badge")}
          </span>
          <h1 className="text-sm font-bold">{loc(pack.title, lang)}</h1>
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </header>

        {question ? (
          <QuestionCard
            key={question.id}
            question={question}
            lang={lang}
            optOrder={identityOrder(choiceCount(question))}
            record={null}
            packFormulas={pack.formulas}
            revealed
          />
        ) : (
          <div className="grid h-60 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
          </div>
        )}

        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => setSeq((n) => n + 1)}
        >
          {lang === "ru" ? "Другой пример" : "Басқа мысал"}
        </Button>
      </div>
    </main>
  );
}

function ListPreview({ pack }: { pack: QuizPack }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [index, setIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(true);
  const total = pack.questions.length;
  const question = pack.questions[index];

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded bg-amber-100 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-800">
            {t("preview_badge")}
          </span>
          <h1 className="text-sm font-bold">{loc(pack.title, lang)}</h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAnswers((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {showAnswers ? (
                <EyeOff className="size-3.5" aria-hidden />
              ) : (
                <Eye className="size-3.5" aria-hidden />
              )}
              {showAnswers
                ? t("preview_hide_answers")
                : t("preview_show_answers")}
            </button>
            <LanguageToggle />
          </div>
        </header>

        <QuestionCard
          // Remount on the answers toggle too: flipping it off must clear any
          // solution highlights already drawn on the figure.
          key={`${question.id}-${showAnswers ? "a" : "q"}`}
          question={question}
          lang={lang}
          optOrder={identityOrder(choiceCount(question))}
          record={null}
          packFormulas={pack.formulas}
          revealed={showAnswers}
        />

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="text-sm font-bold tabular-nums">
            {index + 1} / {total}
          </span>
          <Button
            variant="outline"
            disabled={index >= total - 1}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </main>
  );
}
