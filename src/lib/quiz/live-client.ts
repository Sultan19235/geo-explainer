// Thin client for the Hetzner live-score server (server/server.js).
// Students call GET /status and POST /submit; the teacher console also
// creates/starts/ends sessions and listens on the /live SSE stream.
// Race mode (v8, docs/RACE_MODE_SPEC.md) adds /race/* endpoints and rides
// optional fields on the existing responses — everything race is additive.
// Tournament mode (v9, docs/TOURNAMENT_MODE_SPEC.md) does the same with
// /tourney/* endpoints — everything tournament is additive too.

import type { Localized } from "./pack";

export const QUIZ_BACKEND = (
  process.env.NEXT_PUBLIC_QUIZ_BACKEND_URL ?? "https://mathsabaq.online"
).replace(/\/+$/, "");

const BACKEND = QUIZ_BACKEND;

export type SessionStatus = "waiting" | "active" | "ended" | "not_found";

// Which student aids the teacher allowed for this room, chosen once at room
// start. Server-carried (v7 /status + /submit) so a student editing the join
// link can't re-enable what the teacher switched off.
export type QuizFeatures = {
  figure: boolean; // GeoGebra figure behind the "Сызба" toggle
  theory: boolean; // per-question "Формулалар" panel
  hints: boolean; // progressive hints
  calculator: boolean; // built-in calculator
};

export const ALL_FEATURES: QuizFeatures = {
  figure: true,
  theory: true,
  hints: true,
  calculator: true,
};

export const FEATURE_KEYS = [
  "figure",
  "theory",
  "hints",
  "calculator",
] as const satisfies readonly (keyof QuizFeatures)[];

// Missing keys default to true so a payload from a newer server (more flags)
// or an older console (fewer) can never lock students out of everything.
function sanitizeFeatures(raw: unknown): QuizFeatures | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out = { ...ALL_FEATURES };
  for (const key of FEATURE_KEYS) {
    if (r[key] === false) out[key] = false;
  }
  return out;
}

// ─── Race mode wire types (v8) ──────────────────────────────────────────────
// Kahoot-style lockstep rooms: the server owns the state machine, phones and
// the board just render phases. Names and field shapes here are the protocol
// contract of docs/RACE_MODE_SPEC.md §2 — keep them byte-compatible with
// server/server.js. A self-paced room never sees any of these fields, and an
// old (v7) server simply never sends them.

export type RacePhase = "idle" | "question" | "reveal" | "explain" | "podium";

// Teacher's /race/advance verbs. Illegal-for-the-current-phase actions 409
// server-side ({error:'bad_phase'}) so a double-click is harmless.
export type RaceAdvanceAction = "next" | "reveal" | "explain" | "podium" | "auto";

// One question of the race config the console sends on POST /session. The
// server re-sanitizes everything (drop-don't-reject, timeSec clamp [5,600],
// accept ≤20 entries, solution content size-capped) — these shapes mirror the
// pack so the console can build the config straight from selected questions.
export type RaceQuestionConfig = {
  id: string; // pack question id (server caps at 64 chars)
  type: "mcq" | "input";
  timeSec: number; // per-question countdown seconds
  correct?: number; // mcq only: CANONICAL option index (race forbids option shuffle)
  optionCount?: number; // mcq only: bucket count for the reveal distribution (≤6)
  accept?: string[]; // input only: answer + accepted alternates
  // Explain-phase content. Held server-side and broadcast ONLY at explain, so
  // the answer-stripped student pack never carries solutions during the
  // question. Steps use pack.ts's lesson-format SolutionStep shape; the wire
  // treats them as opaque payload (the server size-caps and re-emits verbatim).
  solutionSteps?: unknown[];
  solution?: Localized[]; // flat fallback when there are no authored steps
  solutionGeogebra?: string[]; // replayed on the student figure at explain
};

export type RaceConfig = {
  auto: boolean; // auto-advance initial value (teacher can flip it live)
  questions: RaceQuestionConfig[]; // canonical order = teacher's tray order
};

// Race resync summary riding /status and /submit responses (spec §2.7). This
// is the poll-level recovery channel: screen lock kills the student SSE, and
// the next heartbeat response carries enough to re-anchor the local timer —
// it is also how the student page learns the room is a race at all.
export type RaceSummary = {
  phase: RacePhase;
  qIndex: number; // current question, -1 before the first one opens
  qCount: number;
  qId?: string;
  openAt?: number; // epoch ms: answers accepted from here
  deadline?: number; // epoch ms: phones display this as time-up
  remainingMs?: number; // server-computed at send time — the skew-free anchor
  answered?: boolean; // only present when the request carried a studentId
  auto?: boolean;
};

// What "correct" looks like at reveal: mcq sends the canonical option index,
// input sends the canonical answer string.
export type RaceCorrect = { pick: number } | { answer: string };

// The per-student reveal view — one shape shared by the 'reveal' event and
// the 'reveal' field of a resync 'state' snapshot (identical by spec §2.5).
export type RaceRevealView = {
  qIndex: number;
  qId: string;
  correct: RaceCorrect;
  you: {
    answered: boolean;
    ok: boolean;
    points: number; // this question's speed points (0 on wrong/miss)
    bonus: number; // streak bonus already included on top of points
    streak: number;
    totalPoints: number;
    // null for a student the standings haven't ranked yet (first contact
    // with the room happened after the current question's reveal ran).
    rank: number | null;
    of: number;
  };
};

// The explain payload — shared by the 'explain' event and the resync 'state'.
// Content shows up here for the first time (see RaceQuestionConfig).
export type RaceExplainView = {
  qIndex: number;
  qId: string;
  solutionSteps?: unknown[]; // pack SolutionStep[] — opaque on the wire
  solution?: Localized[];
  solutionGeogebra?: string[];
};

// Student SSE events (GET /race/stream). 'state' doubles as the on-connect
// snapshot AND the resync shape, so a phone that lost its stream mid-question
// lands back on the exact screen it should be showing.
export type RaceStudentEvent =
  | {
      type: "state";
      phase: RacePhase;
      qIndex: number;
      qCount: number;
      qId?: string;
      openAt?: number;
      deadline?: number;
      // Anchor the local countdown to remainingMs at receipt time
      // (performance.now() + remainingMs) — NEVER the device wall-clock.
      remainingMs?: number;
      timeSec?: number;
      answered?: boolean; // whether THIS student answered the current question
      you?: { points: number; correct: number; streak: number; rank: number | null; of: number };
      // Present only while phase is reveal/explain/podium:
      reveal?: RaceRevealView;
      explain?: RaceExplainView;
    }
  | {
      type: "question";
      qIndex: number;
      qCount: number;
      qId: string;
      openAt: number; // now + 3s get-ready countdown, baked in server-side
      deadline: number;
      remainingMs: number;
      timeSec: number;
    }
  | ({ type: "reveal" } & RaceRevealView)
  | ({ type: "explain" } & RaceExplainView)
  | {
      type: "podium";
      top: { name: string; points: number }[]; // final top 3
      // rank is null for a student the final standings never ranked (first
      // contact with the room came after the last reveal).
      you: { rank: number | null; of: number; points: number; correct: number };
    };

// One leaderboard row as the teacher 'race' reveal/podium events carry it.
export type RaceBoardRow = {
  studentId: string;
  name: string;
  points: number; // running total
  delta: number; // points earned on the just-closed question
  ok: boolean;
  streak: number;
  rank: number;
  // Feeds the board's ▲/▼ rank-change arrows. The server sends rank itself
  // (a neutral "no movement") for a row's first appearance, but the type
  // admits null so a defensive consumer never renders a fabricated drop.
  prevRank: number | null;
};

// Reveal distribution: mcq = answer counts per CANONICAL option index (race
// forces canonical option order so board bars and phone letters agree);
// input = three buckets.
export type RaceDist = number[] | { ok: number; wrong: number; none: number };

// Teacher SSE additions on the existing /live stream. Old consoles ignore
// unknown event types safely, so these ride the same connection.
export type RaceTeacherEvent =
  | {
      // Phase transition. Which fields are present varies by phase (spec
      // §2.5) — question carries the clock, reveal carries dist/board/correct,
      // podium carries the final board — hence the optionals.
      type: "race";
      phase: RacePhase;
      qIndex: number;
      qCount?: number;
      qId?: string;
      openAt?: number;
      deadline?: number;
      remainingMs?: number;
      timeSec?: number;
      answeredCount?: number;
      activeCount?: number;
      correct?: RaceCorrect;
      dist?: RaceDist;
      board?: RaceBoardRow[];
    }
  | {
      // Live answered-counter tick while a question is open.
      type: "race_answer";
      qIndex: number;
      answeredCount: number;
      activeCount: number;
    };

// The teacher-side race view carried on the /live connect 'snapshot' so a
// mid-race console reload restores the exact board (current dist/board are
// included when the room sits in reveal/explain/podium).
export type TeacherRaceState = {
  phase: RacePhase;
  qIndex: number;
  qCount: number;
  qId?: string;
  openAt?: number;
  deadline?: number;
  remainingMs?: number;
  timeSec?: number;
  answeredCount?: number;
  activeCount?: number;
  auto?: boolean;
  dist?: RaceDist;
  board?: RaceBoardRow[];
  correct?: RaceCorrect;
};

const RACE_PHASES: readonly string[] = [
  "idle",
  "question",
  "reveal",
  "explain",
  "podium",
];

// Pass-through with a sanity gate. race is an OPTIONAL rider on /status and
// /submit: old servers never send it, and parseStatus must keep throwing ONLY
// on unknown status strings (that throw is load-bearing for reload recovery).
// So a missing or malformed race field quietly reads as "not a race room" —
// never an error, never a new status.
function sanitizeRaceSummary(raw: unknown): RaceSummary | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Partial<RaceSummary>;
  if (typeof r.phase !== "string" || !RACE_PHASES.includes(r.phase)) {
    return undefined;
  }
  if (typeof r.qIndex !== "number" || typeof r.qCount !== "number") {
    return undefined;
  }
  return r as RaceSummary;
}

// ─── Tournament mode wire types (v9) ────────────────────────────────────────
// FIFA-playoff duels on drill generator packs: the server owns the bracket,
// the clocks and the grading (exact-value port), phones and the board just
// render phases. Names and field shapes here are the protocol contract of
// docs/TOURNAMENT_MODE_SPEC.md — keep them byte-compatible with
// server/server.js + server/bracket.js. A self-paced or race room never sees
// any of these fields, and an old (v8) server simply never sends them.

export type TourneyPhase = "idle" | "pairing" | "duel" | "result" | "podium";

// Teacher's /tourney/advance verbs. Illegal-for-the-current-phase actions 409
// server-side ({error:'bad_phase'}) so a double-click is harmless. There is
// deliberately NO early-close verb: a round always runs its full clock.
export type TourneyAdvanceAction = "pair" | "start" | "podium";

// One pre-generated round the console sends on POST /session: the shared
// sequence seed (every duel in the round runs the same problems) plus the
// answer key — plain keypad strings, index = seq-1. The server re-sanitizes
// (2–16 rounds, 40–400 answers each, answers ≤24 chars, whole config ≤256KB);
// the console builds 12 rounds × 240 answers.
export type TourneyRoundKey = {
  seed: number; // 31-bit int; the round's shared sequence seed
  answers: string[];
};

export type TourneyConfig = {
  roundSec: number; // duel length, server-clamped to [30, 300]
  lockoutSec: number; // wrong-answer freeze, server-clamped to [0, 15]
  rounds: TourneyRoundKey[];
};

// Tournament resync summary riding /status and /submit responses (spec §2.8).
// This is the poll-level recovery channel: screen lock kills the student SSE,
// and the next heartbeat response carries enough to re-anchor the local
// timer — it is also how the student page learns the room is a tournament.
export type TourneySummary = {
  phase: TourneyPhase;
  round: number; // 1-based once the first draw happens, 0 before
  roundSec: number;
  seed?: number; // current round's sequence seed (pairing|duel|result)
  openAt?: number; // epoch ms: answers accepted from here
  deadline?: number; // epoch ms: phones display this as time-up
  remainingMs?: number; // server-computed at send time — the skew-free anchor
};

// One opponent as the student stream carries it. Which fields are present
// varies by event ('pairing' sends only the name, 'tick' adds the score,
// 'presence' the away state, 'state' everything) — hence the optionals.
export type TourneyOpponent = {
  // studentId — additive over the spec §2.6 name-only shape so tick/presence
  // merging can't conflate two same-named opponents in a trio. Optional
  // defensively (a spec-literal server would omit it); merge falls back to
  // name when absent.
  id?: string;
  name: string;
  correct?: number;
  connected?: boolean;
  away?: boolean;
  awaySeconds?: number;
};

// The student's slot in the current draw: 'main' = bracket duel, 'losers' =
// consolation pool (eliminated students keep playing), 'bye' = solo
// auto-advance round, 'waiting' = latecomer sitting out until the next draw.
export type TourneyRole = "main" | "losers" | "bye" | "waiting";

// The per-student settle view — one shape shared by the 'result' event and
// the 'result' field of a resync 'state' snapshot (identical by spec §2.6).
export type TourneyResultView = {
  round: number;
  won: boolean;
  eliminated: boolean; // knocked out of the main bracket this round
  champion: boolean; // true only for the champion at the final settle
  you: { correct: number; wrong: number };
  opponents: TourneyOpponent[];
  // Where the student lands at the NEXT draw ('champion' ends the road;
  // 'waiting' = latecomer still outside the bracket). 'bye' is never known
  // at settle time — byes only exist once a draw runs — so it is absent here.
  nextRole: "main" | "losers" | "champion" | "waiting";
};

// The final-standings payload — shared by the 'podium' event and the resync
// 'state'. champion is null only when the pre-generated rounds ran out
// before the bracket produced one (teacher podiumed early).
export type TourneyPodiumView = {
  champion: { name: string } | null;
  top: { name: string; wins: number; correct: number }[]; // final top 3
  you: { rank: number; of: number; wins: number; correct: number };
};

// Student SSE events (GET /tourney/stream). 'state' doubles as the on-connect
// snapshot AND the resync shape, so a phone that lost its stream mid-duel
// lands back on the exact screen it should be showing.
export type TourneyStudentEvent =
  | {
      type: "state";
      phase: TourneyPhase;
      round: number;
      roundSec: number;
      seed?: number; // current round's sequence seed (pairing|duel|result)
      openAt?: number;
      deadline?: number;
      // Anchor the local countdown to remainingMs at receipt time
      // (performance.now() + remainingMs) — NEVER the device wall-clock.
      remainingMs?: number;
      you: {
        correct: number; // current round's counts…
        wrong: number;
        seq: number; // …and the NEXT expected answer seq
        lockRemainMs: number; // >0 while the wrong-answer freeze is running
        role: TourneyRole;
        wins: number; // whole-tournament totals
        totalCorrect: number;
      };
      pair?: { opponents: TourneyOpponent[] };
      // Present only while phase is result/podium:
      result?: TourneyResultView;
      podium?: TourneyPodiumView;
    }
  | {
      // Draw revealed (individualized).
      type: "pairing";
      round: number;
      role: TourneyRole;
      opponents: TourneyOpponent[]; // 0 (bye/waiting), 1, or 2 (trio) entries
      luckyLoser: boolean; // true = YOU came back into the bracket this round
    }
  | {
      // Round opens.
      type: "duel";
      round: number;
      seed: number;
      roundSec: number;
      openAt: number; // now + 3s get-ready countdown, baked in server-side
      deadline: number;
      remainingMs: number;
    }
  // Opponent scored — sent to the partner(s) of whoever answered.
  | { type: "tick"; opponents: TourneyOpponent[] }
  // Opponent connected/away state changed mid-duel.
  | { type: "presence"; opponents: TourneyOpponent[] }
  | ({ type: "result" } & TourneyResultView)
  | ({ type: "podium" } & TourneyPodiumView);

// One duel row of the serialized bracket (spec §2.7). b is null for a solo
// row (main-bracket bye, or a one-person losers pool); c appears only on the
// losers-pool trio. winner/settled appear only once the round settles; the
// current round's rows carry the live scores at serialization time (a
// reloading console re-paints from them), with 'tourney_score' events
// keeping the numbers fresh between snapshots.
export type TourneyBracketPair = {
  a: string;
  b: string | null;
  c?: string;
  scoreA?: number;
  scoreB?: number;
  scoreC?: number;
  winner?: string;
};

// The full teacher wire bracket. Names ride in `players` so the board renders
// without a roster join; `history` holds one entry per DRAWN round, current
// round included (settled stays false until settleRound runs).
export type TourneyBracket = {
  phase: TourneyPhase;
  round: number;
  roundCount: number; // pre-generated rounds available in total
  champion: string | null;
  players: Record<
    string,
    { name: string; connected: boolean; kicked: boolean }
  >;
  history: {
    round: number;
    main: TourneyBracketPair[];
    losers: TourneyBracketPair[];
    byeId: string | null;
    luckyLoserId: string | null; // promoted INTO this round's main draw
    settled: boolean;
  }[];
  standings: {
    studentId: string;
    wins: number;
    correct: number;
    wrong: number;
  }[];
};

// Teacher SSE additions on the existing /live stream. Old consoles ignore
// unknown event types safely, so these ride the same connection.
export type TourneyTeacherEvent =
  | {
      // Phase transition, sent with the FULL bracket every time. The clock
      // fields ride along only when the phase carries one (duel) — hence the
      // optionals.
      type: "tourney";
      phase: TourneyPhase;
      round: number;
      roundSec?: number;
      openAt?: number;
      deadline?: number;
      remainingMs?: number;
      bracket?: TourneyBracket;
    }
  | {
      // Per accepted answer while a duel is live; the board maps the row to
      // its pair card.
      type: "tourney_score";
      round: number;
      studentId: string;
      correct: number;
      wrong: number;
    };

// The teacher-side tournament view carried on the /live connect 'snapshot' so
// a mid-tournament console reload restores the exact board.
export type TeacherTourneyState = {
  phase: TourneyPhase;
  round: number;
  roundSec?: number;
  openAt?: number;
  deadline?: number;
  remainingMs?: number;
  bracket?: TourneyBracket;
};

const TOURNEY_PHASES: readonly string[] = [
  "idle",
  "pairing",
  "duel",
  "result",
  "podium",
];

// Pass-through with a sanity gate — same contract as sanitizeRaceSummary.
// tourney is an OPTIONAL rider on /status and /submit: old servers never send
// it, and parseStatus must keep throwing ONLY on unknown status strings (that
// throw is load-bearing for reload recovery). So a missing or malformed
// tourney field quietly reads as "not a tournament room" — never an error,
// never a new status.
function sanitizeTourneySummary(raw: unknown): TourneySummary | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Partial<TourneySummary>;
  if (typeof r.phase !== "string" || !TOURNEY_PHASES.includes(r.phase)) {
    return undefined;
  }
  if (typeof r.round !== "number" || typeof r.roundSec !== "number") {
    return undefined;
  }
  return r as TourneySummary;
}

export type StatusResponse = {
  status: SessionStatus;
  timeLeft?: number; // seconds, present while a session exists
  // v6: the teacher removed this student from the room. Rides /status (lobby
  // polls) and /submit (heartbeats); old servers never send it.
  kicked?: boolean;
  // v7: the room's student-aid switches; absent on old servers.
  features?: QuizFeatures;
  // v8: present only on race rooms — the student's poll-level resync channel.
  race?: RaceSummary;
  // v9: present only on tournament rooms — same resync role as `race`.
  tourney?: TourneySummary;
};

// Per-question outcomes, question id -> 1 (correct) | 0 (wrong). Only quizzes
// with stable question ids send it (pack quizzes); generator quizzes make a
// fresh question per student, so there is nothing comparable to key on.
export type AnswerMap = Record<string, 0 | 1>;

export type SubmitPayload = {
  code: string;
  studentId: string;
  name: string;
  score: number;
  total: number;
  finished: boolean;
  focused: boolean;
  tabSwitches: number;
  awaySeconds: number;
  answers?: AnswerMap;
  // v10: level-mode drill rooms — the ladder rung the student is on (1-based).
  // Omitted everywhere else; a v9 server simply drops the field.
  level?: number;
  // Deliberate (re-)join, not a passive heartbeat: clears a kick verdict and
  // the server's sticky finished flag for a fresh run.
  joining?: boolean;
};

// "not_found" is a load-bearing verdict: the teacher hook deletes its
// reload-recovery blob on it, and the student page ends the quiz. So only a
// response that explicitly carries a known status may produce one — anything
// else (the rate-limiter's 429 {error}, JSON error pages) throws and is
// handled like a network blip by every caller.
function parseStatus(data: Partial<StatusResponse>, httpStatus: number) {
  const s = data.status;
  if (s !== "waiting" && s !== "active" && s !== "ended" && s !== "not_found") {
    throw new Error(`quiz backend: unexpected status response (${httpStatus})`);
  }
  return {
    status: s,
    timeLeft: data.timeLeft,
    kicked: data.kicked === true,
    features: sanitizeFeatures(data.features),
    race: sanitizeRaceSummary(data.race),
    tourney: sanitizeTourneySummary(data.tourney),
  };
}

// studentId lets the server attach the kicked verdict — the lobby's only
// channel for it, since waiting students poll here and never /submit.
export async function fetchStatus(
  code: string,
  studentId?: string,
): Promise<StatusResponse> {
  const params = new URLSearchParams({ code });
  if (studentId) params.set("studentId", studentId);
  const res = await fetch(`${BACKEND}/status?${params.toString()}`);
  // The server 404s unknown codes but still sends { status: "not_found" }.
  return parseStatus((await res.json()) as Partial<StatusResponse>, res.status);
}

// Registers presence and reports the score; the response doubles as a status
// check so an ended session is noticed on the next heartbeat. keepalive lets
// a report outlive the page: a phone backgrounded via the back button (QR
// students have no in-app history, so back leaves the browser) freezes the
// page right after visibilitychange and a plain fetch dies mid-flight — the
// teacher's board then never learns the student went off-screen.
export async function submitScore(
  payload: SubmitPayload,
  opts?: { keepalive?: boolean },
): Promise<StatusResponse> {
  const res = await fetch(`${BACKEND}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: opts?.keepalive === true,
  });
  const data = (await res.json()) as Partial<StatusResponse & { ok: boolean }>;
  return parseStatus(data, res.status);
}

export type ResolveResult =
  | { status: SessionStatus; studentPath: string | null }
  | { error: "network" };

// Universal join: turns a room code the teacher wrote on the board into that
// room's student join path (GET /resolve, server v5+). On older servers the
// route is missing entirely — the HTML 404 fails JSON parsing and reports as
// "network", which the /join page shows as a retryable error.
export async function resolveCode(code: string): Promise<ResolveResult> {
  try {
    const res = await fetch(
      `${BACKEND}/resolve?code=${encodeURIComponent(code)}`,
    );
    // 404 is a real answer (unknown code; v5 sends a JSON body). Anything
    // else non-ok — 429 from the shared per-IP limiter, 5xx — is a retryable
    // failure, NOT "wrong code": a whole school can share one NAT'd IP.
    if (!res.ok && res.status !== 404) return { error: "network" };
    const data = (await res.json()) as {
      status?: SessionStatus;
      studentPath?: unknown;
    };
    return {
      status: data.status ?? "not_found",
      studentPath:
        typeof data.studentPath === "string" ? data.studentPath : null,
    };
  } catch {
    return { error: "network" };
  }
}

// The student page is closing (browser back, tab close): one best-effort
// parting shot so the teacher's board flips to "left" instantly instead of
// waiting out the server's 45s staleness sweep. text/plain on purpose — a
// cross-origin application/json beacon needs a preflight sendBeacon can't do.
export function sendLeaveBeacon(code: string, studentId: string): void {
  const body = JSON.stringify({ code, studentId });
  try {
    if (
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(`${BACKEND}/leave`, new Blob([body], { type: "text/plain" }))
    ) {
      return;
    }
  } catch {
    // sendBeacon unavailable/refused — fall through to keepalive fetch
  }
  try {
    void fetch(`${BACKEND}/leave`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // page is going away — nothing else to try
  }
}

// The student race SSE stream URL (GET /race/stream). studentId is mandatory:
// the stream is individualized (your answered flag, your points, your rank).
export function raceStreamUrl(code: string, studentId: string): string {
  const params = new URLSearchParams({ code, studentId });
  return `${QUIZ_BACKEND}/race/stream?${params.toString()}`;
}

// Submits the student's answer for the current race question. The server
// accepts one answer per student per question (first wins) and only while the
// question is open (+1.5s grace) — so `false` here just means the press
// didn't land (network blip, phase already closed). The reveal event is the
// source of truth for whether an answer counted; callers may flip to the
// "accepted" screen optimistically but can retry the POST on false.
export async function raceAnswer(
  code: string,
  studentId: string,
  qIndex: number,
  payload: { pick?: number; given?: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND}/race/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, studentId, qIndex, ...payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The student tournament SSE stream URL (GET /tourney/stream). studentId is
// mandatory: the stream is individualized (your draw, your scores, your
// lockout).
export function tourneyStreamUrl(code: string, studentId: string): string {
  const params = new URLSearchParams({ code, studentId });
  return `${QUIZ_BACKEND}/tourney/stream?${params.toString()}`;
}

// Submits one duel answer. Answers land strictly in sequence order and the
// SERVER grades them (exact-value port) — the response is authoritative for
// the student's correct/wrong counts. ok:false covers everything the press
// didn't survive: network blip, closed phase, replayed seq, lockout — when
// the body still parsed, error/expect/remainMs say how to recover (bad_seq →
// silently jump to the server's `expect`; locked → keep the freeze overlay
// up for `remainMs`).
export async function tourneyAnswer(
  code: string,
  studentId: string,
  round: number,
  seq: number,
  given: string,
): Promise<{
  ok: boolean;
  right?: boolean; // this answer graded correct
  correct?: number; // the round's running counts, server-owned
  wrong?: number;
  lockRemainMs?: number; // >0 right after a wrong answer (freeze the keypad)
  error?: string; // server verdict on ok:false ('bad_seq', 'locked', …)
  expect?: number; // bad_seq only: the seq the server wants next
  remainMs?: number; // locked only: freeze left on the rejected press
}> {
  try {
    const res = await fetch(`${BACKEND}/tourney/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, studentId, round, seq, given }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    // Field-by-field copy instead of a cast: error pages and rate-limiter
    // bodies share this path, so nothing untyped may leak through.
    const out: {
      ok: boolean;
      right?: boolean;
      correct?: number;
      wrong?: number;
      lockRemainMs?: number;
      error?: string;
      expect?: number;
      remainMs?: number;
    } = { ok: res.ok && data.ok === true };
    if (typeof data.right === "boolean") out.right = data.right;
    if (typeof data.correct === "number") out.correct = data.correct;
    if (typeof data.wrong === "number") out.wrong = data.wrong;
    if (typeof data.lockRemainMs === "number") {
      out.lockRemainMs = data.lockRemainMs;
    }
    if (typeof data.error === "string") out.error = data.error;
    if (typeof data.expect === "number") out.expect = data.expect;
    if (typeof data.remainMs === "number") out.remainMs = data.remainMs;
    return out;
  } catch {
    return { ok: false };
  }
}

// ─── Teacher side ───────────────────────────────────────────────────────────

// One student row as the /live SSE stream reports it.
export type StudentRecord = {
  studentId: string;
  name: string;
  score: number;
  total: number;
  finished: boolean;
  focused: boolean;
  tabSwitches: number;
  awaySeconds: number;
  answers?: AnswerMap;
  updatedAt: number;
  // v6: false once the student's page is gone (leave beacon or >45s of
  // heartbeat silence). Absent on old servers — treat as connected.
  connected?: boolean;
  // v10: ladder rung in level-mode drill rooms; absent everywhere else.
  level?: number;
};

export type LiveEvent =
  | {
      type: "snapshot";
      students: StudentRecord[];
      status: SessionStatus;
      timeLeft: number;
      // v8: present only on race rooms — the full teacher race view, so a
      // console reload mid-race restores the exact board.
      race?: TeacherRaceState;
      // v9: present only on tournament rooms — the full teacher tournament
      // view, so a console reload mid-tournament restores the exact board.
      tourney?: TeacherTourneyState;
    }
  | ({ type: "update" } & StudentRecord)
  | { type: "kicked"; studentId: string }
  | { type: "started"; startedAt: number }
  | { type: "ended"; reason: "teacher" | "timeout" }
  // v8 race phase events; old consoles ignore unknown types safely.
  | RaceTeacherEvent
  // v9 tournament phase events, same tolerance rule.
  | TourneyTeacherEvent;

// The teacher already has a live room; the server refused to open a second.
export type ActiveRoomConflict = {
  code: string;
  title: string;
  status: "waiting" | "active";
};

// Opens a room. Fetches the site's short-lived auth token first (same-origin;
// returns token:null while the gate is dormant) and passes it to /session.
// The server returns a per-session hostSecret that proves this browser owns the
// room; it must be sent with /start, /end and /live. Older servers omit it, so
// it's optional here (null → the server's host-secret gate is dormant anyway).
export async function createSession(
  title: string,
  // The room's student join link, site-relative and WITHOUT the code (it
  // doesn't exist yet), e.g. "/play/algebra-7?q=a,b". The server (v5+) stores
  // it so the universal /join page can turn a typed room code back into this
  // exact quiz; older servers simply ignore the field.
  studentPath?: string,
  // The room's student-aid switches (v7 servers store and serve them back on
  // /status and /submit; older servers ignore the field).
  features?: QuizFeatures,
  // Race mode config (v8). A v7 server ignores the field and opens a plain
  // self-paced room — which is why the RESPONSE carries the race
  // acknowledgment back (see below): the console must fail loudly rather
  // than run a race board on top of a self-paced room.
  race?: RaceConfig,
  // Tournament config (v9), mutually exclusive with race (both → 400
  // {error:'mode_conflict'}). Same old-server hazard, same cure: a v8 server
  // ignores the field, so the console must require the tourney
  // acknowledgment below before letting anyone into the "room".
  tourney?: TourneyConfig,
): Promise<
  | {
      code: string;
      hostSecret: string | null;
      race?: { qCount: number };
      tourney?: { rounds: number };
    }
  | { error: "unauthorized" | "network" }
  | { error: "active_room"; room: ActiveRoomConflict }
> {
  const token = await fetchOwnerToken();
  try {
    const res = await fetch(`${BACKEND}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, token, studentPath, features, race, tourney }),
    });
    if (res.status === 401) return { error: "unauthorized" };
    if (res.status === 409) {
      // v6 one-room-per-teacher rule: the server names the live room so the
      // console can offer "end it and start the new one".
      const data = (await res.json()) as {
        code?: string;
        title?: string;
        status?: string;
      };
      if (data.code) {
        return {
          error: "active_room",
          room: {
            code: data.code,
            title: data.title ?? "",
            status: data.status === "active" ? "active" : "waiting",
          },
        };
      }
      return { error: "network" };
    }
    const data = (await res.json()) as {
      code?: string;
      hostSecret?: string;
      race?: { qCount?: unknown };
      tourney?: { rounds?: unknown };
    };
    if (!data.code) return { error: "network" };
    const out: {
      code: string;
      hostSecret: string | null;
      race?: { qCount: number };
      tourney?: { rounds: number };
    } = { code: data.code, hostSecret: data.hostSecret ?? null };
    // The race acknowledgment: a v8 server that stored the race config echoes
    // {race:{qCount}}. Only a well-typed echo is surfaced — the console
    // treats its absence (old server, or the config was dropped as malformed)
    // as "this room is NOT a race" and destroys the half-made room.
    if (
      data.race &&
      typeof data.race === "object" &&
      typeof data.race.qCount === "number"
    ) {
      out.race = { qCount: data.race.qCount };
    }
    // The tourney acknowledgment mirrors the race one: a v9 server that
    // stored the config echoes {tourney:{rounds}}, and the console REQUIRES
    // rounds === config.rounds.length before proceeding — absence means an
    // old server silently opened a plain self-paced room instead.
    if (
      data.tourney &&
      typeof data.tourney === "object" &&
      typeof data.tourney.rounds === "number"
    ) {
      out.tourney = { rounds: data.tourney.rounds };
    }
    return out;
  } catch {
    return { error: "network" };
  }
}

// The site-issued teacher token (null while the gate is dormant). Fetched
// same-origin so it carries the auth cookies.
async function fetchOwnerToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/quiz-token");
    if (res.ok) return ((await res.json()) as { token: string | null }).token;
  } catch {
    // gate dormant or endpoint unreachable — the server decides
  }
  return null;
}

// The teacher SSE stream URL, carrying the hostSecret in the query string
// because EventSource can't set request headers.
export function liveStreamUrl(code: string, hostSecret: string | null): string {
  const params = new URLSearchParams({ code });
  if (hostSecret) params.set("hostSecret", hostSecret);
  return `${BACKEND}/live?${params.toString()}`;
}

export async function startSession(
  code: string,
  hostSecret: string | null = null,
): Promise<void> {
  await fetch(`${BACKEND}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret }),
  });
}

export async function endSession(
  code: string,
  hostSecret: string | null = null,
): Promise<void> {
  await fetch(`${BACKEND}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret }),
  });
}

// End a room this console does NOT hold the hostSecret for (it lives in
// another tab or device) by proving ownership with a fresh teacher token —
// the resolution path for an active_room conflict.
export async function endSessionAsOwner(code: string): Promise<void> {
  const token = await fetchOwnerToken();
  await fetch(`${BACKEND}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, token }),
  });
}

// Teacher removes one student from the room (v6). The SSE 'kicked' event
// echoes back to every console tab, so the caller may also drop the card
// optimistically.
export async function kickStudent(
  code: string,
  hostSecret: string | null,
  studentId: string,
): Promise<void> {
  await fetch(`${BACKEND}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret, studentId }),
  });
}

// Drives the race state machine (POST /race/advance, hostSecret-gated).
// `value` only means something for action 'auto' (the on/off switch). The
// resulting phase change comes back over the /live SSE stream, so the return
// is deliberately void; a 409 {error:'bad_phase'} from a double-clicked
// button is exactly as harmless as it should be — the console ignores it.
export async function raceAdvance(
  code: string,
  hostSecret: string | null,
  action: RaceAdvanceAction,
  value?: boolean,
): Promise<void> {
  await fetch(`${BACKEND}/race/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret, action, value }),
  });
}

// Drives the tournament state machine (POST /tourney/advance, hostSecret-
// gated). Same contract as raceAdvance: the resulting phase change comes
// back over the /live SSE stream, so the return is deliberately void, and a
// 409 {error:'bad_phase'} from a double-clicked button is exactly as
// harmless as it should be — the console ignores it.
export async function tourneyAdvance(
  code: string,
  hostSecret: string | null,
  action: TourneyAdvanceAction,
): Promise<void> {
  await fetch(`${BACKEND}/tourney/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret, action }),
  });
}
