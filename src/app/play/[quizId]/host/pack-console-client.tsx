"use client";

// Teacher console of the quiz engine: open a room (code + QR) → watch live
// student cards stream in over SSE → leaderboard. Rendered standalone at
// /play/<id>/host and embedded in the lesson page's quizzes tab.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  BookOpen,
  Calculator,
  Check,
  Copy,
  EyeOff,
  Flag,
  Expand,
  GripVertical,
  History,
  Lightbulb,
  ListChecks,
  ListOrdered,
  Loader2,
  Play,
  QrCode as QrCodeIcon,
  Shapes,
  Shuffle,
  Square,
  Swords,
  Timer,
  Trophy,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Confetti } from "@/components/quiz/confetti";
import { MathText } from "@/components/quiz/math-text";
import { QrCode } from "@/components/quiz/qr-code";
import { TimerPill } from "@/components/quiz/timer-pill";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  loc,
  type Localized,
  type PackGenerator,
  type PackQuestion,
  type PackTag,
  type PackTagColor,
  type PackTagGroup,
} from "@/lib/quiz/pack";
import { engineT } from "@/lib/quiz/engine-strings";
import { MathFormula } from "@/components/quiz/math-formula";
import {
  GRAPH_MODES,
  SECTION_INFO,
  type GraphQuizMode,
  type SectionId,
} from "@/lib/quiz/quadratic";
import { getDrillTopic } from "@/lib/drill/registry";
import { locDrill } from "@/lib/drill/strings";
import { toPlain } from "@/lib/drill/exact";
import { mulberry32 } from "@/lib/drill/rng";
import { UploadedDrillSource } from "@/lib/drill/uploaded/source";
import {
  defaultConfig,
  DEFAULT_LEVEL_SETTINGS,
  encodeDrillConfig,
  encodeLevelSettings,
  type DrillConfig,
  type DrillLevel,
  type DrillOptionGroup,
} from "@/lib/drill/types";

// All the console needs from a drill topic is its option groups — built-in
// topics satisfy this structurally, uploaded ones provide a pack snapshot.
type DrillTopicTicks = { options: DrillOptionGroup[] };
import type { SavedQuizRef } from "@/lib/quiz/saved-quiz";
import {
  createSavedQuizAction,
  updateSavedQuizAction,
} from "@/lib/quiz/saved-quiz-actions";
import {
  useTeacherSession,
  type LiveStudent,
  type ResumableRoom,
} from "@/lib/quiz/use-teacher-session";
import {
  ALL_FEATURES,
  FEATURE_KEYS,
  type QuizFeatures,
  type RaceConfig,
  type RaceQuestionConfig,
  type TourneyConfig,
  type TourneyRoundKey,
} from "@/lib/quiz/live-client";
import {
  useResultAutosave,
  type ResultSaveStatus,
} from "@/lib/quiz/use-result-autosave";
import { RaceBoard } from "./race-board";
import { TourneyBoard } from "./tourney-board";

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

function avatarColor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function pctOf(s: LiveStudent) {
  return s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
}

function pctColor(pct: number) {
  return pct >= 70
    ? "text-emerald-600"
    : pct >= 40
      ? "text-amber-600"
      : "text-red-600";
}

function sortStudents(students: Map<string, LiveStudent>) {
  return Array.from(students.values()).sort((a, b) => {
    // Level rooms: the ladder IS the ranking — higher rung first, percent
    // breaks ties. Everywhere else level is undefined and this term is 0.
    const lvl = (b.level ?? 0) - (a.level ?? 0);
    if (lvl !== 0) return lvl;
    const pA = a.total > 0 ? a.score / a.total : 0;
    const pB = b.total > 0 ? b.score / b.total : 0;
    return pB !== pA ? pB - pA : b.score - a.score;
  });
}

// The saved quiz currently being edited in the console. `snapshot` is the
// composition at last save; comparing against the live selection detects
// unsaved changes.
type SavedState = { id: string; name: string; snapshot: string };

function selectionSnapshot(ids: string[], mode: "custom" | "shuffle") {
  return `${ids.join(",")}|${mode}`;
}

// The room setup that must survive a teacher-side reload: restoring it before
// reconnecting keeps the join link/QR and the autosave's question columns
// identical to the room the students are already in. The race fields must be
// restored too — mode decides which live screen renders (race board vs
// self-paced cards), and the timers feed nothing after creation but must not
// silently reset for a possible follow-up room.
type RoomCtx = {
  selectedIds: string[];
  orderMode: "custom" | "shuffle";
  genSections: SectionId[];
  genModes: GraphQuizMode[];
  genDrill?: DrillConfig; // drill generator: the teacher's option ticks
  // Level-mode settings for ladder topics (on/off + threshold + batch size);
  // absent for topics without a ladder and for pre-level saved blobs.
  lvl?: { on: boolean; pass: number; size: number };
  features?: QuizFeatures;
  mode?: "self" | "race" | "tourney";
  raceSec?: number; // room default seconds per question
  raceAuto?: boolean; // auto-advance initial value
  raceQSec?: Record<string, number>; // per-question overrides, qid → seconds
  tourneySec?: number; // tournament: duel length (roundSec)
  tourneyLockSec?: number; // tournament: wrong-answer freeze (lockoutSec)
};

// The default-time choices the setup card offers (spec §7); RACE_SEC_DEFAULT
// doubles as the fallback wherever no explicit value survived.
const RACE_SEC_CHOICES = [10, 20, 30, 45, 60, 90, 120] as const;
const RACE_SEC_DEFAULT = 30;

// Server clamp is [5, 600] (spec §2.2) — mirror it so what the tray shows is
// what the room runs.
function clampRaceSec(n: number): number {
  return Math.min(600, Math.max(5, Math.round(n)));
}

// Tournament setup choices (TOURNAMENT_MODE_SPEC.md §6). Lockout 0 renders
// as «Жоқ»/«Нет»; the 4с default sits between the spec's listed steps by
// product-owner reconciliation (select shows Жоқ/3/4/5/8с, default 4с).
const TOURNEY_SEC_CHOICES = [60, 90, 120, 180] as const;
const TOURNEY_SEC_DEFAULT = 90;
const TOURNEY_LOCK_CHOICES = [0, 3, 4, 5, 8] as const;
const TOURNEY_LOCK_DEFAULT = 4;
// The answer key the console pre-generates: 12 rounds × 240 answers (§2.2).
const TOURNEY_ROUNDS = 12;
const TOURNEY_SEQ_PER_ROUND = 240;

// Server clamps (spec §2.2) — mirrored so a stale resume blob can't smuggle
// an out-of-range value into a fresh room.
function clampTourneySec(n: number): number {
  return Math.min(300, Math.max(30, Math.round(n)));
}
function clampTourneyLock(n: number): number {
  return Math.min(15, Math.max(0, Math.round(n)));
}

// A fresh 31-bit round seed (spec §2.2). Math.random is fine here — the seed
// only needs to be unpredictable-enough for a classroom, not cryptographic.
function randomSeed31(): number {
  return Math.floor(Math.random() * 2147483647);
}

// The teacher's last student-aid choice, shared across quizzes (a teacher who
// bans calculators bans them in every class).
const FEATURES_STORAGE_KEY = "ms_quiz_features";

function sanitizeStoredFeatures(raw: unknown): QuizFeatures {
  const r = (raw ?? {}) as Partial<Record<keyof QuizFeatures, unknown>>;
  return {
    figure: r.figure !== false,
    theory: r.theory !== false,
    hints: r.hints !== false,
    calculator: r.calculator !== false,
  };
}

export function PackConsoleClient({
  quizId,
  title,
  questions,
  tagGroups,
  embedded = false,
  canSave = true,
  savedQuiz = null,
  initialSelectedIds,
  initialOrderMode,
  generator = null,
  generatorCode = null,
}: {
  quizId: string;
  title: Localized;
  questions: PackQuestion[];
  tagGroups?: PackTagGroup[];
  embedded?: boolean;
  // false for dev-preview, where there is no signed-in user to own a save.
  canSave?: boolean;
  savedQuiz?: SavedQuizRef | null;
  initialSelectedIds?: string[];
  initialOrderMode?: "custom" | "shuffle";
  // Generator quiz: questions are machine-made endlessly on each student's
  // device, so there is no question picker and the room always can start.
  // The object (not a boolean) because the setup card renders the machine's
  // own controls: sections/modes for graph-quadratic, option ticks for drill.
  generator?: PackGenerator | null;
  // Uploaded drill-generator source (generator.file packs). The console
  // itself never executes it directly — buildTourneyConfig runs it in the
  // same sandbox worker the student page uses, to pre-generate the
  // tournament answer key. null for registry topics and list packs.
  generatorCode?: string | null;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  // persistKey scopes the reload-recovery blob to this quiz — the same room
  // is offered back whether the console is embedded or standalone.
  const session = useTeacherSession({ persistKey: `pack:${quizId}` });
  const [qrOpen, setQrOpen] = useState(false);
  // Which questions the teacher includes in this room — an ordered list; in
  // "custom" mode students get exactly this sequence. Defaults to the whole
  // pack in pack order (or the saved quiz being edited). Frozen once the room
  // opens (the picker is only shown in the setup phase).
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => initialSelectedIds ?? questions.map((q) => q.id),
  );
  // "custom" → students follow selectedIds; "shuffle" → each student's device
  // deals its own question/option order (anti-cheating for neighbors).
  const [orderMode, setOrderMode] = useState<"custom" | "shuffle">(
    initialOrderMode ?? "custom",
  );
  // Room mode: self-paced (everything as before), race (Жарыс) — the
  // server-lockstep Kahoot flow — or tournament (Турнир), the bracket-duel
  // flow. A PER-RUN choice on purpose: it is not part of saved quizzes.
  // Race exists for list packs only (generator graph questions structurally
  // leak the answer — correct is always index 0); tournament v1 exists for
  // drill generator packs only (the INVERSE rule, spec §6).
  const [mode, setMode] = useState<"self" | "race" | "tourney">("self");
  // Race timers: the room default + per-question overrides (qid → seconds).
  // A question's effective time is raceQSec[id] ?? question.timeSec (author's
  // suggestion) ?? raceSec — so un-edited rows follow the default live.
  const [raceSec, setRaceSec] = useState<number>(RACE_SEC_DEFAULT);
  const [raceAuto, setRaceAuto] = useState(false);
  const [raceQSec, setRaceQSec] = useState<Record<string, number>>({});
  // Switching to race dropped graph questions from the tray — tell, don't
  // silently shrink the selection.
  const [graphDropped, setGraphDropped] = useState(false);
  // Tournament timers: duel length + wrong-answer lockout (both sent once at
  // room creation inside the tourney config; nothing to edit live).
  const [tourneySec, setTourneySec] = useState<number>(TOURNEY_SEC_DEFAULT);
  const [tourneyLockSec, setTourneyLockSec] = useState<number>(
    TOURNEY_LOCK_DEFAULT,
  );
  // Pre-generating the 12-round answer key runs the generator ~2880 times
  // (in a worker for uploaded files) — a spinner state of its own, and a
  // HARD visible failure: a broken generator must never open a room.
  const [tourneyBuilding, setTourneyBuilding] = useState(false);
  const [tourneyBuildError, setTourneyBuildError] = useState<string | null>(
    null,
  );

  const questionById = useMemo(
    () => new Map(questions.map((q) => [q.id, q] as const)),
    [questions],
  );

  // Tournament eligibility (spec §6): drill generator packs only — registry
  // topics AND uploaded .js generator files both qualify.
  const isDrillGen = generator?.type === "drill";

  // Effective race seconds for one question (see raceQSec above). The stored
  // override is clamped only here — mid-typing values stay raw in state so
  // "1" on the way to "15" doesn't snap to 5 under the teacher's cursor.
  const raceSecFor = (q: PackQuestion) =>
    clampRaceSec(raceQSec[q.id] ?? q.timeSec ?? raceSec);

  const switchMode = (m: "self" | "race" | "tourney") => {
    setMode(m);
    if (m !== "race") {
      // Tournament needs no selection surgery: drill generator packs have no
      // question picker at all — everything tournament-specific is settings.
      setGraphDropped(false);
      return;
    }
    // Race constraints (spec §7): the canonical order IS the teacher's tray
    // order, so shuffle is off the table; graph-quadratic questions are out
    // entirely (their correct option is structurally index 0).
    setOrderMode("custom");
    setSelectedIds((prev) => {
      const kept = prev.filter(
        (id) => questionById.get(id)?.type !== "graph-quadratic",
      );
      if (kept.length !== prev.length) setGraphDropped(true);
      return kept;
    });
  };

  // The race config the server will own, built straight from the pack in the
  // teacher's tray order (spec §2.2). Answers/solutions ride ONLY this
  // channel — the student join link is answer-stripped under race=1.
  const buildRaceConfig = (): RaceConfig => ({
    auto: raceAuto,
    questions: selectedIds
      .map((id) => questionById.get(id))
      .filter(
        (q): q is PackQuestion =>
          q !== undefined && q.type !== "graph-quadratic",
      )
      .map((q) => {
        const cfg: RaceQuestionConfig = {
          id: q.id,
          type: q.type === "mcq" ? "mcq" : "input",
          timeSec: raceSecFor(q),
        };
        if (q.type === "mcq") {
          cfg.correct = q.correct;
          cfg.optionCount = q.options?.length;
        } else {
          // answer first, then alternates — trimmed and deduped; the server
          // normalizes further (lowercase, comma→dot…) at grading time.
          const seen = new Set<string>();
          cfg.accept = [q.answer ?? "", ...(q.accept ?? [])]
            .map((s) => s.trim())
            .filter((s) => {
              if (!s || seen.has(s)) return false;
              seen.add(s);
              return true;
            });
        }
        // Explain-phase content, held server-side and broadcast to phones
        // only at explain (the board renders its copy from the local pack).
        if (q.solutionSteps) cfg.solutionSteps = q.solutionSteps;
        if (q.solution) cfg.solution = q.solution;
        if (q.solutionGeogebra) cfg.solutionGeogebra = q.solutionGeogebra;
        return cfg;
      }),
  });

  // The tournament config the server will own (spec §2.2/§6): 12 rounds,
  // each a fresh 31-bit seed + the 240-answer key generated under the
  // teacher's option ticks (genDrill — the same config that rides the join
  // link as dopt=, so the phones regenerate EXACTLY these problems from the
  // seed). Registry topics run synchronously here; uploaded files run in the
  // same sandbox worker the student page uses. Any failure throws — the
  // caller shows it and no room opens.
  const buildTourneyConfig = async (): Promise<TourneyConfig> => {
    if (generator?.type !== "drill") {
      throw new Error("tournament mode needs a drill generator pack");
    }
    const rounds: TourneyRoundKey[] = [];
    if (generator.file) {
      if (!generatorCode) {
        // The page didn't thread the uploaded source through — without it
        // there is no answer key, and a key-less room must not open.
        throw new Error(
          "The generator file could not be loaded — reload the page and try again.",
        );
      }
      // The player-path load skips the validation harness: the file was
      // validated at upload, and the tournament build only needs answers.
      const loaded = await UploadedDrillSource.load(generatorCode, {
        validate: false,
      });
      if (!loaded.ok) throw new Error(loaded.errors.join("\n"));
      try {
        for (let r = 0; r < TOURNEY_ROUNDS; r++) {
          const seed = randomSeed31();
          const res = await loaded.source.generate(
            seed,
            genDrill,
            1,
            TOURNEY_SEQ_PER_ROUND,
          );
          if (!res.ok) throw new Error(res.errors.join("\n"));
          rounds.push({
            seed,
            answers: res.problems.map((p) => toPlain(p.answer, p.answerStyle)),
          });
        }
      } finally {
        loaded.source.dispose();
      }
    } else {
      const topic = getDrillTopic(generator.topic);
      if (!topic) {
        // Stale deployed client vs newer pack — same mismatch the student
        // page degrades on; here it must block the room instead.
        throw new Error(`unknown drill topic "${generator.topic}"`);
      }
      for (let r = 0; r < TOURNEY_ROUNDS; r++) {
        const seed = randomSeed31();
        const answers: string[] = [];
        for (let seq = 1; seq <= TOURNEY_SEQ_PER_ROUND; seq++) {
          // Same per-seq stream derivation as the student page's
          // generateDrillPackQuestion — byte-identical problems per (seed,
          // seq) is what makes the pre-generated key gradeable at all.
          const problem = topic.generate(
            mulberry32((seed + seq * 2654435761) >>> 0),
            genDrill,
          );
          answers.push(toPlain(problem.answer, problem.answerStyle));
        }
        rounds.push({ seed, answers });
      }
    }
    return { roundSec: tourneySec, lockoutSec: tourneyLockSec, rounds };
  };

  // Opens the room. Tournament rooms pre-generate the whole answer key FIRST
  // (spinner via tourneyBuilding) — a generator error is a visible dead end,
  // never a silently self-paced room (spec §6).
  const openRoom = async () => {
    setTourneyBuildError(null);
    let tourneyCfg: TourneyConfig | undefined;
    if (isDrillGen && mode === "tourney") {
      setTourneyBuilding(true);
      try {
        // Let the spinner paint before the synchronous registry loop runs.
        await new Promise((resolve) => setTimeout(resolve, 0));
        tourneyCfg = await buildTourneyConfig();
      } catch (err) {
        setTourneyBuildError(
          err instanceof Error && err.message ? err.message : String(err),
        );
        return;
      } finally {
        setTourneyBuilding(false);
      }
    }
    await session.createRoom(
      quizTitle,
      studentPath,
      {
        selectedIds,
        orderMode,
        genSections,
        genModes,
        genDrill: drillTopic ? genDrill : undefined,
        lvl: hasLadder ? { on: lvlOn, pass: lvlPass, size: lvlSize } : undefined,
        features,
        mode,
        raceSec,
        raceAuto,
        raceQSec,
        tourneySec,
        tourneyLockSec,
      } satisfies RoomCtx,
      features,
      // The race config only exists for race rooms; the hook fails the
      // create loudly (race_unsupported) if the server doesn't acknowledge
      // it question-for-question. The tourney config gets the same
      // round-for-round treatment (tourney_unsupported).
      mode === "race" && !generator ? buildRaceConfig() : undefined,
      tourneyCfg,
    );
  };
  // When some saved ids no longer exist in the pack, the loaded selection
  // already differs from the row — an unmatchable snapshot keeps "save
  // changes" enabled so the teacher can persist the cleanup.
  const [saved, setSaved] = useState<SavedState | null>(() =>
    savedQuiz
      ? {
          id: savedQuiz.id,
          name: savedQuiz.name,
          snapshot:
            savedQuiz.missing > 0
              ? "stale"
              : selectionSnapshot(
                  initialSelectedIds ?? questions.map((q) => q.id),
                  initialOrderMode ?? "custom",
                ),
        }
      : null,
  );
  // Generator quiz: the teacher's ticks for this room. Deliberately start
  // EMPTY — the teacher consciously chooses what fits their class; the room
  // can't open until at least one section and one type are ticked.
  const [genSections, setGenSections] = useState<SectionId[]>([]);
  const [genModes, setGenModes] = useState<GraphQuizMode[]>([]);
  // Drill generator: the topic's option ticks. Unlike the graph machine these
  // START at the topic defaults (optionally narrowed by the pack's pre-set
  // config) — every group must keep ≥1 tick, so an empty start would only
  // force busywork. The teacher adjusts and opens. Uploaded-file generators
  // carry their option snapshot in the pack (fileOptions), so the console
  // renders ticks without ever executing the file.
  const drillTopic: DrillTopicTicks | null =
    generator?.type === "drill"
      ? generator.file
        ? { options: generator.fileOptions ?? [] }
        : (getDrillTopic(generator.topic) ?? null)
      : null;
  const [genDrill, setGenDrill] = useState<DrillConfig>(() =>
    drillTopic
      ? {
          ...defaultConfig(drillTopic),
          ...(generator?.type === "drill" ? generator.config : undefined),
        }
      : {},
  );
  // Level mode (drill ladders): available only when the topic ships a
  // `levels` ladder. Defaults ON — a ladder is authored to be climbed — with
  // the threshold/batch-size knobs the teacher can adjust before opening.
  // Only self-paced rooms run it (race/tournament have their own engines).
  const drillLevels: DrillLevel[] | null =
    generator?.type === "drill"
      ? generator.file
        ? (generator.fileLevels ?? null)
        : (getDrillTopic(generator.topic)?.levels ?? null)
      : null;
  const hasLadder = drillLevels !== null && drillLevels.length >= 2;
  const [lvlOn, setLvlOn] = useState(true);
  const [lvlPass, setLvlPass] = useState(DEFAULT_LEVEL_SETTINGS.pass);
  const [lvlSize, setLvlSize] = useState(DEFAULT_LEVEL_SETTINGS.size);
  const levelActive = hasLadder && lvlOn && mode === "self";
  // Student aids for this room (figure / formulas / hints / calculator).
  // All on by default; the teacher's last choice is restored after mount
  // (not in the initializer — localStorage would desync SSR hydration).
  const [features, setFeatures] = useState<QuizFeatures>(ALL_FEATURES);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FEATURES_STORAGE_KEY);
      if (raw) setFeatures(sanitizeStoredFeatures(JSON.parse(raw)));
    } catch {
      // unreadable blob — defaults stand
    }
  }, []);
  const toggleFeature = (key: keyof QuizFeatures) => {
    setFeatures((cur) => {
      const next = { ...cur, [key]: !cur[key] };
      try {
        localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const rootRef = useRef<HTMLDivElement>(null);

  const quizTitle = loc(title, lang);

  // Freeze the scoreboard into the teacher's profile when the room ends.
  // canSave=false (dev-preview) has no signed-in owner, so nothing to save to.
  const resultSave = useResultAutosave({
    phase: session.phase,
    code: session.code,
    students: session.students,
    enabled: canSave,
    quizId,
    title: quizTitle,
    // Generator rooms mint a fresh question per student — no stable ids to
    // record per-question detail against.
    questionIds: generator ? null : selectedIds,
  });

  // Keep the join link (and QR) clean when `q` adds nothing: the whole pack in
  // pack order, or the whole pack under shuffle where order is irrelevant.
  // selectedIds only ever holds distinct ids from this pack, so length
  // equality means "same set".
  const wholePack = selectedIds.length === questions.length;
  const packOrder = questions.map((q) => q.id).join(",");
  const qParam =
    selectedIds.length > 0 &&
    !(wholePack && (orderMode === "shuffle" || selectedIds.join(",") === packOrder))
      ? selectedIds.join(",")
      : null;
  // Switched-off aids ride the join link as `off=` — the fallback that keeps
  // the teacher's choice working on a pre-v7 server. The server's copy of the
  // same flags (v7) is what students actually trust when present.
  const offList = FEATURE_KEYS.filter((key) => !features[key]);
  // The teacher's generator ticks ride the join link so every student's
  // device generates from exactly this room's choice.
  // race=1 makes the student page open the race flow AND makes the server
  // component strip answers from the pack it ships (spec §5). shuffle is
  // never emitted for race links: option order must stay canonical so the
  // board's distribution letters match every phone (belt and braces — the
  // mode switch already forces orderMode to custom).
  // Level rooms: the ladder's per-level presets drive the config, so the
  // teacher ticks don't ride the link — `lvl=` does instead.
  const doptValue =
    drillTopic && !levelActive ? encodeDrillConfig(genDrill) : "";
  const lvlValue = levelActive
    ? encodeLevelSettings({ pass: lvlPass, size: lvlSize })
    : "";
  const joinParams = [
    qParam ? `q=${encodeURIComponent(qParam)}` : null,
    orderMode === "shuffle" && mode !== "race" ? "shuffle=1" : null,
    mode === "race" && !generator ? "race=1" : null,
    // tourney=1 makes the student page open the tournament flow (the server
    // summary on /status confirms it — server truth wins, spec §5).
    mode === "tourney" && isDrillGen ? "tourney=1" : null,
    generator?.type === "graph-quadratic" ? `sec=${genSections.join(",")}` : null,
    generator?.type === "graph-quadratic" ? `modes=${genModes.join(",")}` : null,
    doptValue ? `dopt=${encodeURIComponent(doptValue)}` : null,
    lvlValue ? `lvl=${lvlValue}` : null,
    offList.length > 0 ? `off=${offList.join(",")}` : null,
  ]
    .filter(Boolean)
    .join("&");
  // The join link without the room code: settled before the room opens, so
  // createRoom sends it to the server for the universal /join page (path
  // only — the origin is never stored, so domain moves invalidate nothing).
  const studentPath = `/play/${quizId}${joinParams ? `?${joinParams}` : ""}`;
  // session.code is null during SSR, so window is only touched in the browser.
  const studentUrl =
    session.code === null
      ? ""
      : `${window.location.origin}${studentPath}${
          joinParams ? "&" : "?"
        }code=${session.code}`;

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };

  // One live room per teacher: the server refused the create because another
  // room of this teacher is still open (possibly a different quiz/device).
  // Confirm ending it; on "yes" the hook ends the old room and replays this
  // create. The ref stops re-renders from re-opening the blocking dialog.
  const conflict = session.conflict;
  const conflictPrompted = useRef(false);
  useEffect(() => {
    if (!conflict) {
      conflictPrompted.current = false;
      return;
    }
    if (conflictPrompted.current) return;
    conflictPrompted.current = true;
    const ok = window.confirm(
      t("c_conflict_confirm")
        .replace("{title}", conflict.title || quizTitle)
        .replace("{code}", conflict.code),
    );
    void session.resolveConflict(ok);
  }, [conflict, session, t, quizTitle]);

  const kickWithConfirm = (s: LiveStudent) => {
    if (window.confirm(t("c_kick_confirm").replace("{name}", s.name))) {
      session.kick(s.studentId);
    }
  };

  // Reconnect to a room that survived a reload: put the console's setup back
  // to what that room was opened with (dropping ids the pack no longer has),
  // THEN resume — studentUrl and autosave derive from this state.
  const resumeRoom = () => {
    const ctx = session.resumable?.ctx as Partial<RoomCtx> | undefined;
    if (ctx && typeof ctx === "object") {
      if (Array.isArray(ctx.selectedIds)) {
        const known = new Set(questions.map((q) => q.id));
        const ids = ctx.selectedIds.filter(
          (id): id is string => typeof id === "string" && known.has(id),
        );
        if (ids.length > 0) setSelectedIds(ids);
      }
      if (ctx.orderMode === "custom" || ctx.orderMode === "shuffle") {
        setOrderMode(ctx.orderMode);
      }
      if (Array.isArray(ctx.genSections)) {
        const stored = ctx.genSections as unknown[];
        setGenSections(
          SECTION_INFO.map((s) => s.id).filter((id) => stored.includes(id)),
        );
      }
      if (Array.isArray(ctx.genModes)) {
        const stored = ctx.genModes as unknown[];
        setGenModes(GRAPH_MODES.filter((m) => stored.includes(m)));
      }
      // Drill ticks, whitelisted against the topic's real groups/choices so a
      // stale blob can never smuggle unknown ids into the join link.
      if (
        drillTopic &&
        ctx.genDrill &&
        typeof ctx.genDrill === "object" &&
        !Array.isArray(ctx.genDrill)
      ) {
        const restored: DrillConfig = {};
        for (const group of drillTopic.options) {
          const stored = (ctx.genDrill as Record<string, unknown>)[group.id];
          if (!Array.isArray(stored)) continue;
          // Whitelist against known choice ids but PRESERVE the stored
          // order: generators consume config arrays order-sensitively, and a
          // tournament's answer keys were baked under exactly this order —
          // canonicalizing here would silently regenerate a different dopt=
          // in the resumed console's join link and desync grading.
          const known = new Set(group.choices.map((c) => c.id));
          const ids = stored.filter(
            (id): id is string => typeof id === "string" && known.has(id),
          );
          if (ids.length > 0) restored[group.id] = ids;
        }
        if (Object.keys(restored).length > 0) {
          setGenDrill((cur) => ({ ...cur, ...restored }));
        }
      }
      // Level settings, clamped to the codec's ranges so a stale blob can't
      // smuggle an out-of-range value into the join link.
      if (hasLadder && ctx.lvl && typeof ctx.lvl === "object") {
        const l = ctx.lvl as Record<string, unknown>;
        if (typeof l.on === "boolean") setLvlOn(l.on);
        if (typeof l.pass === "number" && Number.isFinite(l.pass)) {
          setLvlPass(Math.min(100, Math.max(50, Math.round(l.pass))));
        }
        if (typeof l.size === "number" && Number.isFinite(l.size)) {
          setLvlSize(Math.min(20, Math.max(4, Math.round(l.size))));
        }
      }
      if (ctx.features && typeof ctx.features === "object") {
        setFeatures(sanitizeStoredFeatures(ctx.features));
      }
      // Race/tournament fields, whitelisted the same way: mode decides which
      // live screen renders (race board / tournament board / self-paced
      // cards), so getting it back is what makes a mid-game console reload
      // land on the right screen at all. A ctx WITHOUT a mode key (a blob
      // written by a pre-race build, alive up to 4h across a deploy) is by
      // definition a self-paced room — default to "self" so a mode toggle
      // clicked before resuming can't strand the teacher on a board the room
      // never had. Each mode is also re-checked against what THIS pack
      // allows (race: list packs; tourney: drill generator packs).
      setMode(
        ctx.mode === "race" && !generator
          ? "race"
          : ctx.mode === "tourney" && isDrillGen
            ? "tourney"
            : "self",
      );
      if (ctx.mode === "race" && !generator) setOrderMode("custom");
      if (typeof ctx.raceSec === "number" && Number.isFinite(ctx.raceSec)) {
        setRaceSec(clampRaceSec(ctx.raceSec));
      }
      if (
        typeof ctx.tourneySec === "number" &&
        Number.isFinite(ctx.tourneySec)
      ) {
        setTourneySec(clampTourneySec(ctx.tourneySec));
      }
      if (
        typeof ctx.tourneyLockSec === "number" &&
        Number.isFinite(ctx.tourneyLockSec)
      ) {
        setTourneyLockSec(clampTourneyLock(ctx.tourneyLockSec));
      }
      if (typeof ctx.raceAuto === "boolean") setRaceAuto(ctx.raceAuto);
      if (
        ctx.raceQSec &&
        typeof ctx.raceQSec === "object" &&
        !Array.isArray(ctx.raceQSec)
      ) {
        const clean: Record<string, number> = {};
        for (const [id, sec] of Object.entries(ctx.raceQSec)) {
          if (questionById.has(id) && typeof sec === "number" && Number.isFinite(sec)) {
            clean[id] = clampRaceSec(sec);
          }
        }
        setRaceQSec(clean);
      }
    }
    session.resume();
  };

  // Embedded setup blends into the lesson page (plain background, site-style
  // cards); once a room opens, the console becomes its own framed graph-paper
  // surface — the visual cue that "quiz mode" started.
  const plainSetup = embedded && session.phase === "setup";

  return (
    <div
      ref={rootRef}
      className={cn(
        "text-foreground",
        !plainSetup && "quiz-grid-paper",
        embedded &&
          !plainSetup &&
          "min-h-[640px] overflow-hidden rounded-xl border-[1.5px] border-border shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:min-h-[760px]",
        !embedded && "min-h-dvh",
        // This div IS the fullscreen element (toggleFullscreen). Fullscreen
        // clamps it to the viewport, so the embedded overflow-hidden would
        // make anything below the fold (losers panel, podium tail)
        // unreachable — let it scroll there, and give it an opaque bg so the
        // fullscreen backdrop never shows through as black.
        "[&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background",
      )}
    >
      {session.phase === "setup" && (
        <SetupScreen
          quizId={quizId}
          quizTitle={quizTitle}
          questions={questions}
          tagGroups={tagGroups}
          embedded={embedded}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          orderMode={orderMode}
          setOrderMode={setOrderMode}
          canSave={canSave && !generator}
          saved={saved}
          setSaved={setSaved}
          savedMissing={savedQuiz?.missing ?? 0}
          creating={session.creating || tourneyBuilding}
          createError={session.createError}
          tourneyBuildError={tourneyBuildError}
          onCreate={() => void openRoom()}
          resumable={session.resumable}
          onResume={resumeRoom}
          onDiscardResume={() => {
            // Discarding a still-running room ENDS it for the students —
            // never let that be a single silent click.
            if (
              session.resumable &&
              session.resumable.status !== "ended" &&
              !window.confirm(t("c_resume_discard_confirm"))
            ) {
              return;
            }
            session.discardResume();
          }}
          generator={generator}
          genSections={genSections}
          setGenSections={setGenSections}
          genModes={genModes}
          setGenModes={setGenModes}
          drillTopic={drillTopic}
          genDrill={genDrill}
          setGenDrill={setGenDrill}
          drillLevels={drillLevels}
          lvlOn={lvlOn}
          setLvlOn={setLvlOn}
          lvlPass={lvlPass}
          setLvlPass={setLvlPass}
          lvlSize={lvlSize}
          setLvlSize={setLvlSize}
          features={features}
          onToggleFeature={toggleFeature}
          mode={mode}
          onModeChange={switchMode}
          raceSec={raceSec}
          setRaceSec={setRaceSec}
          raceAuto={raceAuto}
          setRaceAuto={setRaceAuto}
          raceQSec={raceQSec}
          setRaceQSec={setRaceQSec}
          graphDropped={graphDropped}
          tourneySec={tourneySec}
          setTourneySec={setTourneySec}
          tourneyLockSec={tourneyLockSec}
          setTourneyLockSec={setTourneyLockSec}
        />
      )}

      {session.phase === "lobby" && session.code && (
        <LobbyScreen
          code={session.code}
          studentUrl={studentUrl}
          students={session.students}
          onStart={() => void session.start()}
          onClose={() => {
            // Teacher changed their mind before starting — reset() ends the
            // room server-side so waiting students aren't stranded, then
            // returns the console to setup.
            if (window.confirm(t("c_close_room_confirm"))) session.reset();
          }}
          onOpenQr={() => setQrOpen(true)}
          onKick={kickWithConfirm}
        />
      )}

      {session.phase === "live" &&
        session.code &&
        (mode === "tourney" && isDrillGen ? (
          // Tournament rooms swap the self-paced scoreboard for the bracket
          // board; ending (button, podium's Аяқтау, or the 45-min clock)
          // still lands on the SAME ResultsScreen below — the server keeps
          // score/total in sync at every settle, so the autosave path is one
          // and the same for all three modes.
          <TourneyBoard
            quizTitle={quizTitle}
            code={session.code}
            students={session.students}
            timeLeft={session.timeLeft}
            tourney={session.tourney}
            onEnd={() => {
              if (window.confirm(t("c_end_confirm"))) void session.end();
            }}
            onOpenQr={() => setQrOpen(true)}
            onFullscreen={toggleFullscreen}
            onKick={kickWithConfirm}
            onPair={session.tourneyPair}
            onStartRound={session.tourneyStart}
            onPodium={session.tourneyPodium}
            // Podium's «Аяқтау» is the expected end of a tournament — no
            // confirm.
            onFinish={() => void session.end()}
          />
        ) : mode === "race" && !generator ? (
          // Race rooms swap the self-paced scoreboard for the phase-driven
          // race board; ending (button, podium's Аяқтау, or the 45-min clock)
          // still lands on the SAME ResultsScreen below, so the autosave path
          // is one and the same for both modes.
          <RaceBoard
            quizTitle={quizTitle}
            code={session.code}
            students={session.students}
            timeLeft={session.timeLeft}
            race={session.race}
            questionById={questionById}
            onEnd={() => {
              if (window.confirm(t("c_end_confirm"))) void session.end();
            }}
            onOpenQr={() => setQrOpen(true)}
            onFullscreen={toggleFullscreen}
            onKick={kickWithConfirm}
            onNext={session.raceNext}
            onReveal={session.raceReveal}
            onExplain={session.raceExplain}
            onPodium={session.racePodium}
            onSetAuto={session.raceSetAuto}
            // Podium's «Аяқтау» is the expected end of a race — no confirm.
            onFinish={() => void session.end()}
          />
        ) : (
          <LiveScreen
            quizTitle={quizTitle}
            code={session.code}
            students={session.students}
            ladder={levelActive && drillLevels ? drillLevels : null}
            timeLeft={session.timeLeft}
            onEnd={() => {
              if (window.confirm(t("c_end_confirm"))) void session.end();
            }}
            onOpenQr={() => setQrOpen(true)}
            onFullscreen={toggleFullscreen}
            onKick={kickWithConfirm}
          />
        ))}

      {session.phase === "results" && (
        <ResultsScreen
          students={session.students}
          onNew={session.reset}
          saveStatus={resultSave.status}
          onRetrySave={resultSave.retry}
        />
      )}

      {qrOpen && session.code && (
        <QrOverlay
          code={session.code}
          studentUrl={studentUrl}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
}

// ═══ SETUP (title + order mode + question picker) ═══════════════════════

const TAG_BADGE_COLORS: Record<PackTagColor, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  slate: "border-border bg-background text-muted-foreground",
};

function SetupScreen({
  quizId,
  quizTitle,
  questions,
  tagGroups,
  embedded,
  selectedIds,
  setSelectedIds,
  orderMode,
  setOrderMode,
  canSave,
  saved,
  setSaved,
  savedMissing,
  creating,
  createError,
  onCreate,
  resumable,
  onResume,
  onDiscardResume,
  generator,
  genSections,
  setGenSections,
  genModes,
  setGenModes,
  drillTopic,
  genDrill,
  setGenDrill,
  drillLevels,
  lvlOn,
  setLvlOn,
  lvlPass,
  setLvlPass,
  lvlSize,
  setLvlSize,
  features,
  onToggleFeature,
  mode,
  onModeChange,
  raceSec,
  setRaceSec,
  raceAuto,
  setRaceAuto,
  raceQSec,
  setRaceQSec,
  graphDropped,
  tourneySec,
  setTourneySec,
  tourneyLockSec,
  setTourneyLockSec,
  tourneyBuildError,
}: {
  quizId: string;
  quizTitle: string;
  questions: PackQuestion[];
  tagGroups?: PackTagGroup[];
  embedded: boolean;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  orderMode: "custom" | "shuffle";
  setOrderMode: (mode: "custom" | "shuffle") => void;
  canSave: boolean;
  saved: SavedState | null;
  setSaved: (s: SavedState) => void;
  savedMissing: number;
  creating: boolean;
  createError:
    | "unauthorized"
    | "network"
    | "race_unsupported"
    | "tourney_unsupported"
    | null;
  // The tournament answer-key pre-generation failed (broken generator file,
  // unknown topic…) — shown verbatim; no room was opened.
  tourneyBuildError: string | null;
  onCreate: () => void;
  resumable: ResumableRoom | null;
  onResume: () => void;
  onDiscardResume: () => void;
  generator: PackGenerator | null;
  genSections: SectionId[];
  setGenSections: React.Dispatch<React.SetStateAction<SectionId[]>>;
  genModes: GraphQuizMode[];
  setGenModes: React.Dispatch<React.SetStateAction<GraphQuizMode[]>>;
  drillTopic: DrillTopicTicks | null;
  genDrill: DrillConfig;
  setGenDrill: React.Dispatch<React.SetStateAction<DrillConfig>>;
  drillLevels: DrillLevel[] | null;
  lvlOn: boolean;
  setLvlOn: React.Dispatch<React.SetStateAction<boolean>>;
  lvlPass: number;
  setLvlPass: (n: number) => void;
  lvlSize: number;
  setLvlSize: (n: number) => void;
  features: QuizFeatures;
  onToggleFeature: (key: keyof QuizFeatures) => void;
  mode: "self" | "race" | "tourney";
  onModeChange: (m: "self" | "race" | "tourney") => void;
  raceSec: number;
  setRaceSec: (n: number) => void;
  raceAuto: boolean;
  setRaceAuto: React.Dispatch<React.SetStateAction<boolean>>;
  raceQSec: Record<string, number>;
  setRaceQSec: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  graphDropped: boolean;
  tourneySec: number;
  setTourneySec: (n: number) => void;
  tourneyLockSec: number;
  setTourneyLockSec: (n: number) => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const total = questions.length;
  const selectedCount = selectedIds.length;
  const isDrillGen = generator?.type === "drill";
  const hasLadder = drillLevels !== null && drillLevels.length >= 2;
  const levelActive = hasLadder && lvlOn && mode === "self";

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  // id → question + its stable "№ in the pack" (shown even when filters hide
  // neighbors, so numbering never shifts under the teacher).
  const byId = useMemo(
    () =>
      new Map(
        questions.map((q, i) => [q.id, { question: q, number: i + 1 }] as const),
      ),
    [questions],
  );
  const tagDefs = useMemo(() => {
    const map = new Map<string, PackTag>();
    for (const group of tagGroups ?? [])
      for (const tag of group.tags) map.set(tag.id, tag);
    return map;
  }, [tagGroups]);

  // Tag filter: chips from different groups AND together, chips inside one
  // group OR together (e.g. "cube" + "easy" = easy cube questions).
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const visible = useMemo(() => {
    if (activeTags.size === 0 || !tagGroups) return questions;
    return questions.filter((q) => {
      for (const group of tagGroups) {
        const active = group.tags.filter((tag) => activeTags.has(tag.id));
        if (active.length === 0) continue;
        if (!active.some((tag) => q.tags?.includes(tag.id))) return false;
      }
      return true;
    });
  }, [questions, tagGroups, activeTags]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions)
      for (const tid of q.tags ?? []) counts.set(tid, (counts.get(tid) ?? 0) + 1);
    return counts;
  }, [questions]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // "Select all" acts on the filtered view: appends the visible unselected
  // (in pack order) or clears the visible ones, leaving the rest untouched.
  // In race mode graph-quadratic questions are unselectable (spec §7), so
  // they count for neither "all selected" nor the append.
  const selectable = useMemo(
    () =>
      mode === "race"
        ? visible.filter((q) => q.type !== "graph-quadratic")
        : visible,
    [visible, mode],
  );
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((q) => selectedSet.has(q.id));
  const toggleAllVisible = () => {
    const visibleIds = new Set(selectable.map((q) => q.id));
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.has(id))
        : [
            ...prev,
            ...selectable.filter((q) => !selectedSet.has(q.id)).map((q) => q.id),
          ],
    );
  };

  const toggleTag = (id: string) =>
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Embedded: the lesson page's main already pads horizontally, and site
  // cards are flatter (thin border + hairline shadow) than the standalone
  // console's floating cards on graph paper.
  const cardClass = embedded
    ? "rounded-xl border-[1.5px] border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    : "rounded-2xl border border-border bg-card shadow-lg shadow-blue-950/5";

  return (
    <div
      className={cn(
        "mx-auto w-full",
        generator ? "max-w-3xl" : "max-w-screen-2xl",
        embedded ? "py-2" : "px-4 py-6",
      )}
    >
      {resumable && (
        <div className="mx-auto w-full max-w-3xl">
          <ResumeBanner
            resumable={resumable}
            onResume={onResume}
            onDiscard={onDiscardResume}
          />
        </div>
      )}

      {/* header card */}
      <div className={cn(cardClass, "mx-auto w-full max-w-3xl p-5")}>
        {!embedded && (
          <div className="mb-3 flex justify-end">
            <LanguageToggle />
          </div>
        )}
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-2xl">
            🧮
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              {quizTitle}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ListChecks className="size-4" aria-hidden />
              {generator ? (
                t("c_gen_endless")
              ) : (
                <>
                  <span className="tabular-nums">
                    {selectedCount} / {total}
                  </span>{" "}
                  {t("c_selected")}
                </>
              )}
            </p>
          </div>
        </div>

        {/* graph generator: the teacher ticks sections + question types for
            this room. Nothing preticked on purpose — a conscious choice each
            time. */}
        {generator?.type === "graph-quadratic" && (
          <>
            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-sm font-bold">{t("c_gen_sections")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("c_gen_sections_hint")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SECTION_INFO.map((sec) => {
                  const active = genSections.includes(sec.id);
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setGenSections((cur) =>
                          cur.includes(sec.id)
                            ? cur.filter((s) => s !== sec.id)
                            : [...cur, sec.id],
                        )
                      }
                      className={cn(
                        "relative rounded-xl border-[1.5px] px-2 py-3 text-center transition-colors",
                        active
                          ? "border-primary bg-accent"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      {active && (
                        <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded bg-primary text-white">
                          <Check className="size-3" aria-hidden />
                        </span>
                      )}
                      <MathFormula
                        formula={sec.formula}
                        className={cn(
                          "block text-[15px] font-semibold",
                          active ? "text-primary" : "text-foreground",
                        )}
                      />
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {sec.example}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-sm font-bold">{t("c_gen_modes")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("c_gen_modes_hint")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {GRAPH_MODES.map((m) => {
                  const active = genModes.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setGenModes((cur) =>
                          cur.includes(m)
                            ? cur.filter((x) => x !== m)
                            : [...cur, m],
                        )
                      }
                      className={cn(
                        "relative rounded-lg border-[1.5px] px-3 py-2.5 text-sm font-semibold transition-colors",
                        active
                          ? "border-primary bg-accent text-primary"
                          : "border-border text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {active && (
                        <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded bg-primary text-white">
                          <Check className="size-3" aria-hidden />
                        </span>
                      )}
                      {t(`g_mode_${m}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {(genSections.length === 0 || genModes.length === 0) &&
              !createError && (
                <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
                  {t("c_gen_pick")}
                </p>
              )}
          </>
        )}

        {/* level mode (drill ladders): on/off + threshold + batch size. When
            ON, the ladder's per-level presets drive the difficulty, so the
            option tick groups below disappear — one source of truth. */}
        {hasLadder && mode === "self" && drillLevels && (
          <div className="mt-4 rounded-xl border-[1.5px] border-border p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Trophy className="size-4 text-primary" aria-hidden />
                {t("c_lvl_title")}
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={lvlOn}
                onClick={() => setLvlOn((v) => !v)}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  lvlOn ? "bg-primary" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]",
                    lvlOn ? "left-[22px]" : "left-0.5",
                  )}
                />
                <span className="sr-only">{t("c_lvl_toggle")}</span>
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("c_lvl_hint")}
            </p>
            {lvlOn && (
              <>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {drillLevels.map((level, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-primary/25 bg-accent px-2.5 py-1 text-xs font-semibold text-primary"
                    >
                      {i + 1}. {locDrill(level.label, lang)}
                    </span>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-muted-foreground">
                      {t("c_lvl_pass")}
                    </p>
                    <div className="flex gap-1.5">
                      {[50, 60, 70, 80, 90].map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={lvlPass === p}
                          onClick={() => setLvlPass(p)}
                          className={cn(
                            "flex-1 rounded-lg border-[1.5px] px-1 py-1.5 text-xs font-bold tabular-nums transition-colors",
                            lvlPass === p
                              ? "border-primary bg-accent text-primary"
                              : "border-border text-muted-foreground hover:bg-accent/50",
                          )}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-muted-foreground">
                      {t("c_lvl_size")}
                    </p>
                    <div className="flex gap-1.5">
                      {[5, 8, 10, 15, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={lvlSize === n}
                          onClick={() => setLvlSize(n)}
                          className={cn(
                            "flex-1 rounded-lg border-[1.5px] px-1 py-1.5 text-xs font-bold tabular-nums transition-colors",
                            lvlSize === n
                              ? "border-primary bg-accent text-primary"
                              : "border-border text-muted-foreground hover:bg-accent/50",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* drill generator: the topic's own option groups as tick tiles.
            Pre-ticked with the topic defaults (each group must keep ≥1), the
            same rule the /labs/drill setup screen uses. Hidden in level mode
            — the ladder presets own the difficulty then. */}
        {drillTopic &&
          !levelActive &&
          drillTopic.options.map((group) => (
            <div key={group.id} className="mt-4">
              <p className="mb-2 text-sm font-bold">
                {locDrill(group.label, lang)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.choices.map((choice) => {
                  const selected = genDrill[group.id] ?? group.defaults;
                  const active = selected.includes(choice.id);
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setGenDrill((cur) => {
                          const current = cur[group.id] ?? group.defaults;
                          if (current.includes(choice.id)) {
                            if (current.length === 1) return cur; // keep ≥1
                            return {
                              ...cur,
                              [group.id]: current.filter(
                                (id) => id !== choice.id,
                              ),
                            };
                          }
                          return {
                            ...cur,
                            [group.id]: [...current, choice.id],
                          };
                        })
                      }
                      className={cn(
                        "relative rounded-lg border-[1.5px] px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                        active
                          ? "border-primary bg-accent text-primary"
                          : "border-border text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {active && (
                        <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded bg-primary text-white">
                          <Check className="size-3" aria-hidden />
                        </span>
                      )}
                      {locDrill(choice.label, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        {/* room mode. List quizzes: self ↔ race (generator packs can't race:
            their graph questions structurally leak the answer). Drill
            generator packs: self ↔ tournament — race stays hidden as today,
            and «Турнир» appears beside «Өз қарқынымен» (spec §6: tournament
            v1 runs on drill generators ONLY, the inverse exclusion rule). */}
        {(!generator || isDrillGen) && (
          <div
            role="radiogroup"
            aria-label={`${t("race_mode_self")} / ${
              isDrillGen ? t("tourney_mode") : t("race_mode_race")
            }`}
            className="mt-4 grid gap-2 sm:grid-cols-2"
          >
            <ModeButton
              active={mode === "self"}
              icon={ListChecks}
              label={t("race_mode_self")}
              onClick={() => onModeChange("self")}
            />
            {!generator && (
              <ModeButton
                active={mode === "race"}
                icon={Zap}
                label={t("race_mode_race")}
                onClick={() => onModeChange("race")}
              />
            )}
            {isDrillGen && (
              <ModeButton
                active={mode === "tourney"}
                icon={Swords}
                label={t("tourney_mode")}
                onClick={() => onModeChange("tourney")}
              />
            )}
          </div>
        )}

        {/* tournament timing: duel length + wrong-answer lockout. Both ride
            the tourney config once at room creation; the pack's drill option
            ticks above apply as in any drill room. */}
        {isDrillGen && mode === "tourney" && (
          <>
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                <Timer className="size-4 text-primary" aria-hidden />
                {t("tourney_round_len")}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {TOURNEY_SEC_CHOICES.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={tourneySec === sec}
                    onClick={() => setTourneySec(sec)}
                    className={cn(
                      "rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-bold tabular-nums transition-colors",
                      tourneySec === sec
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {sec}с
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                <Zap className="size-4 text-primary" aria-hidden />
                {t("tourney_lockout")}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {TOURNEY_LOCK_CHOICES.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={tourneyLockSec === sec}
                    onClick={() => setTourneyLockSec(sec)}
                    className={cn(
                      "rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-bold tabular-nums transition-colors",
                      tourneyLockSec === sec
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {/* 0 = no lockout; §7 has no "none" key, so the literal
                        pair stays inline */}
                    {sec === 0 ? (lang === "kz" ? "Жоқ" : "Нет") : `${sec}с`}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* order mode (list quizzes only — a generator deals its own order).
            Race locks it to "custom": the tray order IS the race's canonical
            question order, and per-student shuffle would unglue the board's
            distribution letters from the phones. */}
        {!generator && (
          <div
            role="radiogroup"
            aria-label={`${t("c_mode_custom")} / ${t("c_mode_shuffle")}`}
            className="mt-4 grid gap-2 sm:grid-cols-2"
          >
            <ModeButton
              active={orderMode === "custom"}
              icon={ListOrdered}
              label={t("c_mode_custom")}
              desc={t("c_mode_custom_desc")}
              onClick={() => setOrderMode("custom")}
            />
            <ModeButton
              active={orderMode === "shuffle"}
              icon={Shuffle}
              label={t("c_mode_shuffle")}
              // No dedicated §8 key exists for the lock reason, so the hint
              // is composed: «Жарыс: сұрақтар сіз құрған ретпен беріледі».
              desc={
                mode === "race"
                  ? `${t("race_mode_race")}: ${t("c_mode_custom_desc").toLowerCase()}`
                  : t("c_mode_shuffle_desc")
              }
              disabled={mode === "race"}
              onClick={() => setOrderMode("shuffle")}
            />
          </div>
        )}

        {/* race timing: default seconds per question + auto-advance. The
            per-question override inputs live on the tray rows below. */}
        {!generator && mode === "race" && (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Timer className="size-4 text-primary" aria-hidden />
                {t("race_default_time")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {RACE_SEC_CHOICES.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  aria-pressed={raceSec === sec}
                  onClick={() => setRaceSec(sec)}
                  className={cn(
                    "rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-bold tabular-nums transition-colors",
                    raceSec === sec
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {sec}с
                </button>
              ))}
              <button
                type="button"
                aria-pressed={raceAuto}
                onClick={() => setRaceAuto((v) => !v)}
                className={cn(
                  "ml-auto flex items-center gap-1.5 rounded-xl border-[1.5px] px-3 py-1.5 text-sm font-semibold transition-colors",
                  raceAuto
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/50",
                )}
              >
                {raceAuto && <Check className="size-3.5" aria-hidden />}
                <Zap className={cn("size-4", !raceAuto && "opacity-60")} aria-hidden />
                {t("race_auto")}
              </button>
            </div>
          </div>
        )}

        {/* graph questions can't race — the mode switch just dropped some
            from the tray, and silence here would read as a lost selection */}
        {!generator && mode === "race" && graphDropped && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
            {t("race_graph_excluded")}
          </p>
        )}

        {/* student aids: what the student's screen offers in this room. All
            on by default; the last choice is remembered on this device. */}
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-bold">{t("c_features_title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("c_features_hint")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FeatureToggle
              icon={Shapes}
              label={t("c_feat_figure")}
              on={features.figure}
              onClick={() => onToggleFeature("figure")}
            />
            <FeatureToggle
              icon={BookOpen}
              label={t("c_feat_theory")}
              on={features.theory}
              onClick={() => onToggleFeature("theory")}
            />
            <FeatureToggle
              icon={Lightbulb}
              label={t("c_feat_hints")}
              on={features.hints}
              onClick={() => onToggleFeature("hints")}
            />
            <FeatureToggle
              icon={Calculator}
              label={t("c_feat_calc")}
              on={features.calculator}
              onClick={() => onToggleFeature("calculator")}
            />
          </div>
        </div>

        {canSave && (
          <SaveQuizControls
            quizId={quizId}
            selectedIds={selectedIds}
            orderMode={orderMode}
            saved={saved}
            setSaved={setSaved}
            embedded={embedded}
          />
        )}

        {savedMissing > 0 && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
            {t("c_saved_missing").replace("{n}", String(savedMissing))}
          </p>
        )}
        {createError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
          >
            {createError === "unauthorized"
              ? t("c_err_unauthorized")
              : createError === "race_unsupported"
                ? t("race_server_unsupported")
                : createError === "tourney_unsupported"
                  ? t("tourney_server_unsupported")
                  : t("c_err_network")}
          </p>
        )}
        {tourneyBuildError && (
          <p
            role="alert"
            className="mt-4 whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
          >
            {tourneyBuildError}
          </p>
        )}
        {!generator && selectedCount === 0 && !createError && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
            {t("c_none_selected")}
          </p>
        )}

        <Button
          onClick={onCreate}
          disabled={
            creating ||
            (generator
              ? generator.type === "graph-quadratic" &&
                (genSections.length === 0 || genModes.length === 0)
              : selectedCount === 0)
          }
          className="mt-4 h-12 w-full text-base font-semibold"
        >
          {creating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("c_creating")}
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden />
              {t("c_open_room")}
            </>
          )}
        </Button>
      </div>

      {/* two-pane picker (list quizzes only): the full question bank on the
          left, the quiz being built on the right — each scrolls on its own,
          so long packs never bury the selection. */}
      {!generator && (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <section className={cn(cardClass, "flex flex-col")}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5">
              <ListChecks className="size-4 text-primary" aria-hidden />
              <p className="text-sm font-bold">{t("c_bank_title")}</p>
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-bold tabular-nums">
                {total}
              </span>
              <button
                type="button"
                onClick={toggleAllVisible}
                className="ml-auto shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                {allVisibleSelected ? t("c_deselect_all") : t("c_select_all")}
              </button>
            </div>

            {tagGroups && tagGroups.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2.5">
                <FilterChip
                  active={activeTags.size === 0}
                  label={`${t("c_filter_all")} · ${total}`}
                  onClick={() => setActiveTags(new Set())}
                />
                {tagGroups.map((group) => (
                  <Fragment key={group.id}>
                    <span
                      className="mx-1 h-4 w-px shrink-0 bg-border"
                      aria-hidden
                    />
                    {group.tags.map((tag) => (
                      <FilterChip
                        key={tag.id}
                        active={activeTags.has(tag.id)}
                        label={`${loc(tag.label, lang)} · ${tagCounts.get(tag.id) ?? 0}`}
                        onClick={() => toggleTag(tag.id)}
                      />
                    ))}
                  </Fragment>
                ))}
              </div>
            )}

            <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
              {visible.map((question) => (
                <QuestionPreviewRow
                  key={question.id}
                  index={byId.get(question.id)?.number ?? 0}
                  question={question}
                  lang={lang}
                  selected={selectedSet.has(question.id)}
                  orderPos={
                    orderMode === "custom" && selectedSet.has(question.id)
                      ? selectedIds.indexOf(question.id) + 1
                      : null
                  }
                  tagDefs={tagDefs}
                  raceExcluded={
                    mode === "race" && question.type === "graph-quadratic"
                  }
                  onToggle={() => toggle(question.id)}
                />
              ))}
            </div>
          </section>

          <SelectionTray
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            byId={byId}
            lang={lang}
            reorderable={orderMode === "custom"}
            cardClass={cardClass}
            raceMode={mode === "race"}
            raceSec={raceSec}
            raceQSec={raceQSec}
            setRaceQSec={setRaceQSec}
          />
        </div>
      )}
    </div>
  );
}

// A room from a previous page-load is still alive on the server — offer to
// reconnect (the /live snapshot brings every student's score back) instead of
// letting the teacher unknowingly open a duplicate room.
function ResumeBanner({
  resumable,
  onResume,
  onDiscard,
}: {
  resumable: ResumableRoom;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const ended = resumable.status === "ended";
  return (
    <div
      role="status"
      className="mb-4 rounded-xl border-[1.5px] border-primary/50 bg-accent p-4"
    >
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
        <History className="size-4 shrink-0 text-primary" aria-hidden />
        {t("c_resume_title")}
        <span className="rounded-full border border-primary/20 bg-card px-2 py-0.5 font-mono text-xs font-bold tracking-[0.18em] text-primary">
          {resumable.code}
        </span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {ended ? t("c_resume_desc_ended") : t("c_resume_desc")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onResume} className="h-9 font-semibold">
          <Play className="size-4" aria-hidden />
          {ended ? t("c_resume_results") : t("c_resume_button")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDiscard}
          className="h-9 text-muted-foreground"
        >
          {t("c_resume_discard")}
        </Button>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  desc,
  disabled = false,
  onClick,
}: {
  active: boolean;
  icon: typeof ListOrdered;
  label: string;
  // Optional: the room-mode switch is label-only (no §8 key describes it).
  desc?: string;
  // Kept visible-but-inert (race locks the shuffle order): the desc then
  // carries the reason, so hiding the button would hide the explanation too.
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border-[1.5px] p-3 text-left transition-colors",
        active
          ? "border-primary bg-accent"
          : "border-border bg-background",
        disabled ? "cursor-not-allowed opacity-50" : !active && "hover:border-primary/40",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-bold",
          active ? "text-primary" : "text-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
      {desc && (
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
          {desc}
        </span>
      )}
    </button>
  );
}

// One student-aid switch (figure / formulas / hints / calculator). Same
// visual language as the generator tick-boxes: allowed = primary + check.
function FeatureToggle({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-xl border-[1.5px] px-2 py-3 text-sm font-semibold transition-colors",
        on
          ? "border-primary bg-accent text-primary"
          : "border-border text-muted-foreground hover:bg-accent/50",
      )}
    >
      {on && (
        <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded bg-primary text-white">
          <Check className="size-3" aria-hidden />
        </span>
      )}
      <Icon className={cn("size-5", !on && "opacity-60")} aria-hidden />
      {label}
    </button>
  );
}

// ═══ SAVE QUIZ (name + reuse from the dashboard) ═════════════════════════

function SaveQuizControls({
  quizId,
  selectedIds,
  orderMode,
  saved,
  setSaved,
  embedded,
}: {
  quizId: string;
  selectedIds: string[];
  orderMode: "custom" | "shuffle";
  saved: SavedState | null;
  setSaved: (s: SavedState) => void;
  embedded: boolean;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  // naming = the name input is open (first save, or "save as new" of an
  // already-saved quiz — both create a new row).
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = selectionSnapshot(selectedIds, orderMode);
  const dirty = saved !== null && snapshot !== saved.snapshot;
  const empty = selectedIds.length === 0;

  const errorText = (code: string) =>
    code === "unauthorized"
      ? t("c_err_unauthorized")
      : code === "limit"
        ? t("c_save_err_limit")
        : t("c_save_err");

  const flashSaved = () => {
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const createNew = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || empty) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createSavedQuizAction({
        quizId,
        name: trimmed,
        questionIds: selectedIds,
        orderMode,
      });
      if (res.ok) {
        setSaved({ id: res.id, name: trimmed, snapshot });
        setNaming(false);
        setName("");
        flashSaved();
        // Keep the address reopenable: a refresh of the standalone console
        // returns to this saved quiz. The embedded console shares the lesson
        // page's URL, so it is left alone.
        if (!embedded) {
          const url = new URL(window.location.href);
          url.searchParams.set("saved", res.id);
          window.history.replaceState(null, "", url);
        }
      } else {
        setError(errorText(res.error));
      }
    } catch {
      setError(errorText("network"));
    }
    setBusy(false);
  };

  const saveChanges = async () => {
    if (!saved || busy || empty) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateSavedQuizAction({
        id: saved.id,
        questionIds: selectedIds,
        orderMode,
      });
      if (res.ok) {
        setSaved({ ...saved, snapshot });
        flashSaved();
      } else {
        setError(errorText(res.error));
      }
    } catch {
      setError(errorText("network"));
    }
    setBusy(false);
  };

  return (
    <div className="mt-3">
      {naming ? (
        <div className="rounded-xl border-[1.5px] border-primary/40 bg-background p-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              maxLength={120}
              placeholder={t("c_save_name_placeholder")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createNew();
                if (e.key === "Escape") {
                  setNaming(false);
                  setName("");
                }
              }}
              className="h-9 flex-1"
            />
            <Button
              size="sm"
              disabled={busy || !name.trim() || empty}
              onClick={() => void createNew()}
              className="h-9 font-semibold"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              {t("c_save_confirm")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setNaming(false);
                setName("");
              }}
              className="h-9"
            >
              {t("c_save_cancel")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("c_saved_hint")}
          </p>
        </div>
      ) : saved ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-border bg-background px-3 py-2">
          <Bookmark className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {saved.name}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || empty || !dirty}
            onClick={() => void saveChanges()}
            className="h-8 font-semibold"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : justSaved && !dirty ? (
              <>
                <Check className="size-3.5" aria-hidden />
                {t("c_saved_ok")}
              </>
            ) : (
              t("c_save_changes")
            )}
          </Button>
          <button
            type="button"
            title={t("c_save_as_new")}
            aria-label={t("c_save_as_new")}
            disabled={busy}
            onClick={() => setNaming(true)}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <BookmarkPlus className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={empty}
          onClick={() => setNaming(true)}
          className="h-10 w-full font-semibold"
        >
          <BookmarkPlus className="size-4" aria-hidden />
          {t("c_save_quiz")}
        </Button>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// ═══ SELECTION TRAY (the quiz being built, in order) ════════════════════

function SelectionTray({
  selectedIds,
  setSelectedIds,
  byId,
  lang,
  reorderable,
  cardClass,
  raceMode = false,
  raceSec = RACE_SEC_DEFAULT,
  raceQSec = {},
  setRaceQSec,
}: {
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  byId: Map<string, { question: PackQuestion; number: number }>;
  lang: "kz" | "ru";
  reorderable: boolean;
  cardClass: string;
  // Race mode: each row gets a seconds input. Displays the effective value
  // (override → author's timeSec → room default) and writes overrides back
  // through setRaceQSec; the value is clamped to [5,600] on blur, not on
  // every keystroke, so intermediate typing doesn't snap under the cursor.
  raceMode?: boolean;
  raceSec?: number;
  raceQSec?: Record<string, number>;
  setRaceQSec?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  const t = engineT(lang);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const secFor = (q: PackQuestion) =>
    raceQSec[q.id] ?? q.timeSec ?? raceSec;

  const setSec = (id: string, raw: string) => {
    if (!setRaceQSec) return;
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) {
      // Cleared → back to the question's own default (timeSec ?? room's).
      setRaceQSec((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setRaceQSec((prev) => ({ ...prev, [id]: n }));
  };

  const clampSec = (id: string) => {
    if (!setRaceQSec) return;
    setRaceQSec((prev) =>
      id in prev ? { ...prev, [id]: clampRaceSec(prev[id]) } : prev,
    );
  };

  const move = (from: number, to: number) =>
    setSelectedIds((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });

  const remove = (id: string) =>
    setSelectedIds((prev) => prev.filter((x) => x !== id));

  return (
    <div className={cn(cardClass)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5">
        <ListOrdered className="size-4 text-primary" aria-hidden />
        <p className="text-sm font-bold">{t("c_tray_title")}</p>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-bold tabular-nums">
          {selectedIds.length}
        </span>
        {!reorderable && selectedIds.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Shuffle className="size-3.5" aria-hidden />
            {t("c_tray_shuffle_note")}
          </span>
        )}
      </div>
      {selectedIds.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {t("c_tray_empty")}
        </p>
      )}
      <ol
        className={cn(
          "max-h-[70vh] overflow-y-auto",
          selectedIds.length > 0 && "p-2",
        )}
      >
        {selectedIds.map((id, i) => {
          const entry = byId.get(id);
          if (!entry) return null;
          return (
            <li
              key={id}
              draggable={reorderable}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", id);
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(i);
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "flex items-start gap-1.5 rounded-lg px-2 py-1.5",
                dragIndex === i && "opacity-40",
                overIndex === i &&
                  dragIndex !== null &&
                  dragIndex !== i &&
                  "bg-accent",
              )}
            >
              {reorderable && (
                <GripVertical
                  className="mt-1.5 size-4 shrink-0 cursor-grab text-muted-foreground/50"
                  aria-hidden
                />
              )}
              <span className="w-6 shrink-0 pt-1 text-right font-mono text-xs font-bold tabular-nums text-primary">
                {i + 1}.
              </span>
              <span className="min-w-0 flex-1 pt-1 text-[13px] leading-snug">
                <MathText text={loc(entry.question.text, lang)} />
              </span>
              {raceMode && (
                <label
                  className="flex shrink-0 items-center gap-1 pt-0.5"
                  title={t("race_per_q_sec")}
                >
                  <Timer
                    className="size-3.5 text-muted-foreground/60"
                    aria-hidden
                  />
                  <input
                    type="number"
                    min={5}
                    max={600}
                    step={5}
                    inputMode="numeric"
                    aria-label={t("race_per_q_sec")}
                    value={secFor(entry.question)}
                    onChange={(e) => setSec(id, e.target.value)}
                    onBlur={() => clampSec(id)}
                    className="h-7 w-14 rounded-md border border-border bg-background px-1.5 text-center text-xs font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  />
                </label>
              )}
              {reorderable && (
                <>
                  <TrayButton
                    label={t("c_move_up")}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </TrayButton>
                  <TrayButton
                    label={t("c_move_down")}
                    disabled={i === selectedIds.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </TrayButton>
                </>
              )}
              <TrayButton label={t("c_remove_question")} onClick={() => remove(id)}>
                <X className="size-3.5" aria-hidden />
              </TrayButton>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TrayButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md border border-transparent text-muted-foreground",
        disabled
          ? "opacity-30"
          : "hover:border-border hover:bg-background hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function QuestionPreviewRow({
  index,
  question,
  lang,
  selected,
  orderPos,
  tagDefs,
  raceExcluded = false,
  onToggle,
}: {
  index: number;
  question: PackQuestion;
  lang: "kz" | "ru";
  selected: boolean;
  // 1-based position in the teacher's order; null hides it (shuffle mode /
  // unselected) and the checkbox falls back to a plain check mark.
  orderPos: number | null;
  tagDefs: Map<string, PackTag>;
  // Race mode: graph-quadratic questions can't be picked (spec §7) — the row
  // stays visible (the teacher should see what exists) but is inert, dimmed
  // and explains itself via tooltip + inline notice.
  raceExcluded?: boolean;
  onToggle: () => void;
}) {
  const t = engineT(lang);
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-disabled={raceExcluded || undefined}
      tabIndex={raceExcluded ? -1 : 0}
      title={raceExcluded ? t("race_graph_excluded") : undefined}
      onClick={() => {
        if (raceExcluded) return;
        // let teachers drag-select/copy question text without toggling
        const sel = window.getSelection();
        if (sel && sel.type === "Range") return;
        onToggle();
      }}
      onKeyDown={(e) => {
        if (raceExcluded) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "group rounded-xl border-[1.5px] bg-card p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        raceExcluded
          ? "cursor-not-allowed border-border opacity-40 saturate-50"
          : [
              "cursor-pointer",
              selected
                ? "border-primary/40"
                : "border-border opacity-60 hover:border-primary/40 hover:opacity-80",
            ],
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors",
            selected
              ? "border-primary bg-primary text-white"
              : "border-border bg-background text-transparent group-hover:border-primary/50",
          )}
        >
          {selected && orderPos !== null ? (
            <span className="text-[10px] font-bold leading-none tabular-nums">
              {orderPos}
            </span>
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex gap-2 text-[15px] font-medium leading-snug">
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {index}.
            </span>
            <MathText text={loc(question.text, lang)} />
          </div>

          {raceExcluded && (
            <p className="mt-1.5 text-[11px] font-bold text-amber-700">
              {t("race_graph_excluded")}
            </p>
          )}

          {question.tags && question.tags.length > 0 && tagDefs.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {question.tags.map((tid) => {
                const def = tagDefs.get(tid);
                if (!def) return null;
                return (
                  <span
                    key={tid}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                      TAG_BADGE_COLORS[def.color ?? "slate"],
                    )}
                  >
                    {loc(def.label, lang)}
                  </span>
                );
              })}
            </div>
          )}

          {question.type === "mcq" && question.options && (
            <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
              {question.options.map((opt, oi) => {
                const correct = oi === question.correct;
                return (
                  <div
                    key={oi}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]",
                      correct
                        ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-800"
                        : "border-border bg-background text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border text-[10px] font-bold",
                        correct
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {correct ? (
                        <Check className="size-3" aria-hidden />
                      ) : (
                        OPTION_LABELS[oi]
                      )}
                    </span>
                    <MathText text={loc(opt, lang)} />
                  </div>
                );
              })}
            </div>
          )}

          {question.type === "input" && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 px-2.5 py-1.5 text-[13px] font-semibold text-emerald-800">
              <Check className="size-3.5" aria-hidden />
              <MathText text={question.answer ?? ""} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ LOBBY ══════════════════════════════════════════════════════════════

function LobbyScreen({
  code,
  studentUrl,
  students,
  onStart,
  onClose,
  onOpenQr,
  onKick,
}: {
  code: string;
  studentUrl: string;
  students: Map<string, LiveStudent>;
  onStart: () => void;
  onClose: () => void;
  onOpenQr: () => void;
  onKick: (s: LiveStudent) => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [copied, setCopied] = useState(false);
  const names = Array.from(students.values());
  const here = names.filter((s) => s.connected !== false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {t("c_room_code")}
      </p>
      <p className="mt-1 font-mono text-6xl font-bold tracking-[0.18em] text-primary sm:text-7xl">
        {code}
      </p>

      <button
        type="button"
        onClick={onOpenQr}
        title={t("c_show_qr")}
        className="mt-6 rounded-2xl border border-border bg-white p-3 shadow-lg shadow-blue-950/5 transition-transform hover:scale-[1.02]"
      >
        <QrCode text={studentUrl} size={200} />
      </button>
      <p className="mt-3 text-sm text-muted-foreground">{t("c_scan_hint")}</p>
      <p className="mt-0.5 text-xl font-bold tracking-tight text-primary sm:text-2xl">
        {t("c_join_host")}
      </p>

      <button
        type="button"
        onClick={copyLink}
        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {copied ? t("c_copied") : t("c_copy_link")}
      </button>

      <div className="mt-7 w-full rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Users className="size-4 text-primary" aria-hidden />
          {t("c_students")}: {here.length}
        </p>
        {names.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("c_waiting_students")}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {names.map((s) => (
              <span
                key={s.studentId}
                className={cn(
                  "flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-1.5 text-sm font-semibold",
                  s.connected === false && "opacity-45",
                )}
              >
                <span
                  className="grid size-6 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: avatarColor(s.name) }}
                >
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                {s.name}
                {s.connected === false && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {t("c_away_tag")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onKick(s)}
                  title={t("c_kick")}
                  aria-label={t("c_kick")}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={onStart}
        disabled={names.length === 0}
        className="mt-6 h-13 w-full max-w-sm text-base font-semibold"
      >
        <Play className="size-4" aria-hidden />
        {t("c_start")}
      </Button>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 flex items-center gap-2 rounded-xl border-[1.5px] border-red-300 bg-red-50 px-5 py-2.5 text-base font-semibold text-red-600 transition-colors hover:border-red-400 hover:bg-red-100"
      >
        <X className="size-5" aria-hidden />
        {t("c_close_room")}
      </button>
    </div>
  );
}

// ═══ LIVE ═══════════════════════════════════════════════════════════════

function LiveScreen({
  quizTitle,
  code,
  students,
  ladder,
  timeLeft,
  onEnd,
  onOpenQr,
  onFullscreen,
  onKick,
}: {
  quizTitle: string;
  code: string;
  students: Map<string, LiveStudent>;
  // Level rooms: the ladder the room runs — drives the distribution strip
  // and the per-card level chips. null everywhere else.
  ladder: DrillLevel[] | null;
  timeLeft: number;
  onEnd: () => void;
  onOpenQr: () => void;
  onFullscreen: () => void;
  onKick: (s: LiveStudent) => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const sorted = sortStudents(students);
  const away = sorted.filter(
    (s) => !s.focused && s.connected !== false,
  ).length;
  // Ladder distribution: how many students sit on each rung right now.
  // Students whose client hasn't reported a level yet count as rung 1.
  const rungCounts = ladder
    ? ladder.map(
        (_, i) =>
          sorted.filter((s) => (s.level ?? 1) === i + 1 && s.connected !== false)
            .length,
      )
    : null;

  return (
    <div className="w-full px-3 py-3 sm:px-4">
      <header className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="min-w-0 truncate text-sm font-bold sm:text-base">
            <MathText text={quizTitle} />
          </h1>
          <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs font-bold tracking-widest">
            {code}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums">
            <Users className="size-3.5 text-primary" aria-hidden />
            {sorted.length}
          </span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums",
              away > 0
                ? "animate-pulse border-red-200 bg-red-50 text-red-700"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            <EyeOff className="size-3.5" aria-hidden />
            {away} {t("c_out_count")}
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

      {/* Level rooms: the class ladder at a glance — one chip per rung with
          its live student count. */}
      {ladder && rungCounts && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <Trophy className="size-3.5 text-primary" aria-hidden />
            {t("c_lvl_ladder")}:
          </span>
          {ladder.map((level, i) => (
            <span
              key={i}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
                rungCounts[i] > 0
                  ? "border-primary/30 bg-accent text-primary"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {i + 1}. {locDrill(level.label, lang)}
              <span
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold",
                  rungCounts[i] > 0
                    ? "bg-primary text-white"
                    : "bg-border text-muted-foreground",
                )}
              >
                {rungCounts[i]}
              </span>
            </span>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          {t("c_no_students")}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
          {sorted.map((s, i) => (
            <StudentCard
              key={s.studentId}
              student={s}
              rank={i + 1}
              showLevel={ladder !== null}
              onKick={() => onKick(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Total time spent off-screen, compact: "55с" / "2м 5с".
function fmtAway(seconds: number) {
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}м ${s}с` : `${m}м`;
}

function StudentCard({
  student: s,
  rank,
  showLevel = false,
  onKick,
}: {
  student: LiveStudent;
  rank: number;
  // Level rooms: show the ladder-rung chip (an unreported level renders 1).
  showLevel?: boolean;
  onKick: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const pct = pctOf(s);
  const wrong = s.total - s.score;
  const left = s.connected === false;
  // Live "away" clock: an off-screen tab throttles its heartbeat (and a left
  // student's page is gone entirely), so once the student is off-screen or
  // left we tick the timer up locally from the last report rather than
  // waiting for their return for the true total to land.
  const ticking = s.awaySince != null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  const awaySeconds = ticking
    ? s.awaySeconds + (Date.now() - (s.awaySince as number)) / 1000
    : s.awaySeconds;
  const barColor =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div
      className={cn(
        "rounded-xl border-[1.5px] bg-card p-3 transition-shadow",
        rank === 1
          ? "border-amber-300 bg-gradient-to-br from-amber-50 to-card"
          : rank === 2
            ? "border-slate-300 bg-gradient-to-br from-slate-50 to-card"
            : rank === 3
              ? "border-orange-300 bg-gradient-to-br from-orange-50 to-card"
              : "border-border",
        s.finished && "border-emerald-300 bg-gradient-to-br from-emerald-50 to-card",
        left && "opacity-55 saturate-50",
        s.flash === "ok" &&
          "border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]",
        s.flash === "err" &&
          "border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-center font-mono text-sm font-bold">
          {MEDALS[rank - 1] ?? rank}
        </span>
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
          style={{ background: avatarColor(s.name) }}
        >
          {s.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {s.name}
        </span>
        {showLevel && (
          <span
            title={t("level_label")}
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-primary/30 bg-accent px-1.5 py-0.5 text-xs font-bold tabular-nums text-primary"
          >
            <Trophy className="size-3" aria-hidden />
            {s.level ?? 1}
          </span>
        )}
        <span
          className={cn(
            "font-mono text-base font-bold tabular-nums",
            pctColor(pct),
          )}
        >
          {pct}%
        </span>
        <button
          type="button"
          onClick={onKick}
          title={t("c_kick")}
          aria-label={t("c_kick")}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1">
        <MiniStat
          value={s.score}
          label={t("c_stat_correct")}
          className="text-emerald-600"
        />
        <MiniStat
          value={wrong}
          label={t("c_stat_wrong")}
          className="text-red-600"
        />
        <MiniStat
          value={s.total}
          label={t("c_stat_total")}
          className="text-amber-600"
        />
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            barColor,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-bold",
            left
              ? "text-muted-foreground"
              : s.focused
                ? "text-emerald-700"
                : "text-red-600",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              left
                ? "bg-slate-400"
                : s.focused
                  ? "animate-pulse bg-emerald-500"
                  : "animate-pulse bg-red-500",
            )}
            aria-hidden
          />
          {left
            ? t("c_away_tag")
            : s.focused
              ? t("c_on_screen")
              : t("c_off_screen")}
        </span>
        {s.finished && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100/70 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            <Flag className="size-3" aria-hidden />
            {t("c_finished_tag")}
          </span>
        )}
      </div>

      {(s.tabSwitches > 0 || awaySeconds >= 1) && (
        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-sm font-bold text-red-700">
          <EyeOff className="size-4" aria-hidden />
          {s.tabSwitches}× · {fmtAway(awaySeconds)}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-background/70 px-1 py-1.5 text-center">
      <div className={cn("font-mono text-base font-bold tabular-nums", className)}>
        {value}
      </div>
      <div className="truncate text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// ═══ RESULTS ════════════════════════════════════════════════════════════

function ResultsScreen({
  students,
  onNew,
  saveStatus,
  onRetrySave,
}: {
  students: Map<string, LiveStudent>;
  onNew: () => void;
  saveStatus: ResultSaveStatus;
  onRetrySave: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const sorted = sortStudents(students);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {sorted.length > 0 && <Confetti />}
      <h1 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
        <Trophy className="size-6 text-amber-500" aria-hidden />
        {t("c_results_title")}
      </h1>

      {sorted.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          {t("c_results_empty")}
        </p>
      ) : (
        <>
          <div className="mt-7 flex items-end justify-center gap-3">
            {sorted.slice(0, 3).map((s, i) => (
              <div
                key={s.studentId}
                className={cn(
                  "flex w-36 flex-col items-center rounded-2xl border border-border bg-card p-4 shadow-lg shadow-blue-950/5",
                  i === 0 && "order-2 -translate-y-3 border-amber-300",
                  i === 1 && "order-1",
                  i === 2 && "order-3",
                )}
              >
                <span className="text-3xl">{MEDALS[i]}</span>
                <span className="mt-1.5 w-full truncate text-center text-sm font-bold">
                  {s.name}
                </span>
                <span className="text-lg font-bold tabular-nums text-primary">
                  {s.score}/{s.total}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold tabular-nums",
                    pctColor(pctOf(s)),
                  )}
                >
                  {pctOf(s)}%
                </span>
              </div>
            ))}
          </div>

          {sorted.length > 3 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
              {sorted.slice(3).map((s, i) => (
                <div
                  key={s.studentId}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="w-6 text-right font-bold tabular-nums text-muted-foreground">
                    {i + 4}
                  </span>
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: avatarColor(s.name) }}
                  >
                    {s.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate font-semibold">{s.name}</span>
                  <span className="ml-auto font-bold tabular-nums">
                    {s.score}/{s.total}
                  </span>
                  <span
                    className={cn(
                      "w-11 text-right font-bold tabular-nums",
                      pctColor(pctOf(s)),
                    )}
                  >
                    {pctOf(s)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex min-h-7 items-center justify-center gap-2 text-xs">
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("c_results_saving")}
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
            <Check className="size-3.5" aria-hidden />
            {t("c_results_saved")}
          </span>
        )}
        {saveStatus === "error" && (
          <span className="flex items-center gap-2 font-semibold text-destructive">
            {t("c_results_save_error")}
            <Button
              size="sm"
              variant="outline"
              onClick={onRetrySave}
              className="h-7 px-2 text-xs font-semibold"
            >
              {t("c_results_retry")}
            </Button>
          </span>
        )}
        {saveStatus === "off" && (
          <span className="text-muted-foreground">{t("c_results_note")}</span>
        )}
      </div>
      <div className="mt-4 flex justify-center">
        <Button onClick={onNew} variant="outline" className="font-semibold">
          {t("c_new_session")}
        </Button>
      </div>
    </div>
  );
}

// ═══ QR OVERLAY (projector) ═════════════════════════════════════════════

function QrOverlay({
  code,
  studentUrl,
  onClose,
}: {
  code: string;
  studentUrl: string;
  onClose: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 bg-white p-6"
      onClick={onClose}
      role="dialog"
      aria-label={t("c_show_qr")}
    >
      <p className="font-mono text-5xl font-bold tracking-[0.2em] text-primary sm:text-7xl">
        {code}
      </p>
      <QrCode text={studentUrl} size={Math.min(420, typeof window !== "undefined" ? window.innerWidth - 80 : 420)} />
      <p className="text-base text-muted-foreground">{t("c_scan_hint")}</p>
      <p className="-mt-4 text-2xl font-bold tracking-tight text-primary sm:text-3xl">
        {t("c_join_host")}
      </p>
    </div>
  );
}
