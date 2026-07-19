/**
 * MathSabaq Live Score Server — v9
 * Hetzner Node.js backend — HTTP POST + SSE
 * No Socket.io. Pure HTTP. Sessions live in memory ONLY. This server never
 * writes results anywhere — since 2026-07-10 the teacher's CONSOLE saves the
 * final scoreboard to Supabase itself (under the teacher's own login), so the
 * box stays credential-free.
 *
 * Session lifecycle:  waiting → active → ended
 *   POST /session   → creates session (status: waiting)      [token-gated*]
 *   POST /start     → teacher starts quiz (status: active, starts 45-min timer)
 *   POST /end       → teacher ends quiz   (status: ended)
 *   POST /kick      → teacher removes one student from the room
 *   GET  /status    → students poll session state (+kicked verdict via studentId)
 *   GET  /resolve   → room code → student join path (universal /join page)
 *   POST /submit    → student sends score (response includes status + timeLeft)
 *   POST /leave     → student's pagehide beacon (text/plain) → connected:false
 *   GET  /live      → teacher SSE stream
 *   GET  /health    → sessions/students counts + enabled features
 *   GET  /race/stream  → student SSE for race rooms (individualized events)
 *   POST /race/answer  → student's answer to the open race question
 *   POST /race/advance → teacher drives the race state machine (hostSecret)
 *   GET  /tourney/stream  → student SSE for tournament rooms (individualized)
 *   POST /tourney/answer  → student's duel answer (graded server-side, exact port)
 *   POST /tourney/advance → teacher drives the tournament state machine (hostSecret)
 *
 * v9 over v8: tournament mode (Турнир) — FIFA-playoff duel rooms on drill
 * generator packs. Spec: docs/TOURNAMENT_MODE_SPEC.md (normative for every
 * message shape). server/ becomes THREE files: this entry point plus two pure
 * require'd siblings — server/bracket.js (deterministic pairing/settling,
 * seeded rng only) and server/exact.js (exact-value answer port of
 * src/lib/drill/exact.ts). /session optionally accepts a sanitized `tourney`
 * config (per-round seeds + pre-generated answer keys; mutually exclusive
 * with `race` → 400 mode_conflict); when accepted the response carries
 * `tourney:{rounds}` — the ack the console REQUIRES, so a v8 server silently
 * ignoring the field can never produce a self-paced room behind a tournament
 * board. The server owns the teacher-paced state machine
 * (idle→pairing→duel→result→…→podium) driven by POST /tourney/advance,
 * grades every duel answer AT ACCEPT time (strict seq order, wrong-answer
 * lockout), and writes tournament totals back into the regular student
 * records at each settle so the v7 board, results screen and console
 * autosave keep working untouched. In tournament rooms /submit IGNORES
 * client-sent score/total/answers exactly like race rooms; every presence
 * semantic stays v7, with one addition — a presence change during a live
 * duel is relayed to the student's duel partner(s). Rooms without a valid
 * `tourney` config behave byte-for-byte as v8.
 *
 * v8 over v7: race mode (Жарыс) — Kahoot-style lockstep rooms. Spec:
 * docs/RACE_MODE_SPEC.md (normative for every message shape below).
 * /session optionally accepts a sanitized `race` config (fixed mcq/input
 * question list with per-question time limits and explain-phase solution
 * content); when accepted the response carries `race:{qCount}` — the ack the
 * console REQUIRES, so a v7 server silently ignoring the field can never
 * produce a self-paced room behind a race board. The server then owns a
 * per-room state machine (idle→question→reveal[→explain]→…→podium) driven by
 * POST /race/advance, grades every answer AT ACCEPT time (speed points +
 * streak bonus, §2.6 of the spec), and writes the graded results back into
 * the regular student records (score/total/answers) so the v7 board, results
 * screen and console autosave keep working untouched. In race rooms /submit
 * consequently IGNORES client-sent score/total/answers (server-owned) while
 * every presence semantic (heartbeat, away clock, kick, leave beacon, sweep)
 * stays exactly v7. Self-paced rooms — any /session without a valid `race`
 * config — behave byte-for-byte as v7. express.json's body limit grows to
 * 1mb because race configs carry solution steps.
 *
 * v7 over v6: room-level student-aid switches. /session accepts a `features`
 * object ({figure, theory, hints, calculator} booleans — which aids the
 * teacher allows on student screens); /status and /submit responses carry it
 * back, so the flags are server-held and a student editing the join link's
 * `off=` fallback param can't re-enable what the teacher switched off.
 * Missing/invalid → not stored, clients default to everything allowed
 * (pre-v7 consoles keep working unchanged).
 *
 * v6 over v5: honest presence + classroom moderation.
 *   - one live room per teacher: /session remembers the verified token uid as
 *     ownerUid; a second create while a room is live returns 409
 *     {error:'active_room', code, title, status}. /end additionally accepts a
 *     valid owner token in place of the hostSecret, so the console that hit
 *     the 409 can close the old room and retry. Only enforceable when
 *     QUIZ_TOKEN_SECRET is set (no uid otherwise).
 *   - POST /kick: removes a student and blocks their passive heartbeats from
 *     re-registering; an explicit re-join (/submit with joining:true) is
 *     allowed by design — the teacher can always kick again.
 *   - presence: student records carry connected:true; POST /leave (a
 *     sendBeacon fired on the student page's pagehide) flips it immediately,
 *     and a 15s sweep marks anyone silent >45s in an ACTIVE room as
 *     disconnected (lobby students poll /status, not /submit, so waiting
 *     rooms are exempt). The teacher console renders connected:false as
 *     "left".
 *   - finished is sticky: a later heartbeat can't un-finish a student.
 *
 * v5 over v4: kahoot-style universal entrance. /session stores the console's
 * `studentPath` (the room's site-relative join link) and public
 * GET /resolve?code= hands it back, so the website's /join page can turn a
 * code typed from the whiteboard into the right quiz. v4 over v3: /submit accepts an optional per-question `answers` map
 * (question id -> 0|1) and relays it to the teacher's SSE stream, so the
 * console can save per-question detail. v3 over v2: results persistence
 * removed (no Supabase — sessions evaporate when they end / age out). v2 over
 * v1: collision-checked room codes, /submit broadcasts only real changes,
 * optional auth gate, abuse limits.
 *
 * Config (env or a .env file next to this script; real env vars win):
 *   PORT                     default 3000 (prod runs 3001 behind nginx)
 *   QUIZ_TOKEN_SECRET        enables the /session auth gate. Unset → open.
 *   LIVE_ALLOWED_ORIGINS     comma-separated origin allowlist for CORS. Unset →
 *                            reflect any origin (v3 behavior). Set to the
 *                            website origin(s) to lock the API to your site.
 *   LIVE_HOST_SECRET_ENFORCED  when set, /start, /end and /live require the
 *                            per-session hostSecret returned by /session, so
 *                            only the teacher who opened a room can control or
 *                            watch it. Unset → dormant (secret still issued).
 *   LIVE_RATE_LIMIT_PER_MIN  per-IP request ceiling per minute (default 2000;
 *                            0 disables). Generous for a NAT'd classroom.
 *   LIVE_MAX_SSE_PER_IP      max concurrent /live streams per IP (default 50).
 *   LIVE_MAX_RACE_SSE_PER_IP max concurrent /race/stream connections per IP
 *                            (default 200 — a school NAT legitimately holds
 *                            several whole classes of phones at once).
 *   LIVE_MAX_TOURNEY_SSE_PER_IP max concurrent /tourney/stream connections per
 *                            IP (default 200, same NAT reasoning as race).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Tiny .env loader (no dependency; real env vars take precedence) ───────
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
} catch (_) {}

const express = require('express');
const cors = require('cors');
// v9: pure CommonJS siblings, deployed alongside this file (see
// DEPLOY_V9_TOURNEY.md — all THREE files ship together). bracket.js is the
// deterministic pairing/settling engine (spec §3), exact.js the exact-value
// grading port (spec §2.5); both are dependency- and side-effect-free.
const { mulberry32, planRound, settleRound, applyOutcome, finalStandings } = require('./bracket');
const { parseExact, equalsExact } = require('./exact');
const app = express();

// v8: race configs carry explain-phase solution content (lesson steps with
// latex), which does not fit express.json's default 100kb ceiling. 1mb still
// tightly bounds a hostile body — and the race sanitizer re-checks its own
// 512KB cap on the config itself, so the extra headroom buys nothing to abuse.
app.use(express.json({ limit: '1mb' }));

const SESSION_DURATION = 45 * 60 * 1000; // 45 minutes in ms

const QUIZ_TOKEN_SECRET = process.env.QUIZ_TOKEN_SECRET || '';
const AUTH_ENFORCED = Boolean(QUIZ_TOKEN_SECRET);

// Only the teacher who created a room may control (/start, /end) or watch
// (/live) it. /session hands the creator a per-session hostSecret; the
// student-facing code is NOT enough. Dormant until the env is set, so already
// deployed consoles keep working until they've adopted the secret.
const HOST_SECRET_ENFORCED = Boolean(process.env.LIVE_HOST_SECRET_ENFORCED);

// ─── CORS allowlist ─────────────────────────────────────────────────────────
// The website's student pages and teacher consoles call this backend
// cross-origin. Locking CORS to the site origin(s) stops arbitrary websites
// from scripting the API in a visitor's browser. Unset → reflect any origin
// (v3 behavior) so deploying this build changes nothing until the operator
// sets the list.
const ALLOWED_ORIGINS = (process.env.LIVE_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const CORS_LOCKED = ALLOWED_ORIGINS.length > 0;

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = same-origin or a non-browser client (curl, the
      // student HTML's own fetch on some engines) — always allowed. When the
      // allowlist is unset we stay permissive; otherwise only listed origins
      // get CORS headers, so other sites' browsers can't read responses.
      if (!origin || !CORS_LOCKED || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
  }),
);

// ─── Per-IP rate limiting (in-memory, best-effort) ──────────────────────────
// Blunts request floods and SSE-connection exhaustion on the single-core box.
// The default ceiling is deliberately high so a whole classroom behind one
// school NAT stays well under it while a single-host flood is still cut off.
const RATE_LIMIT_PER_MIN = Number(process.env.LIVE_RATE_LIMIT_PER_MIN ?? 2000);
const MAX_SSE_PER_IP = Number(process.env.LIVE_MAX_SSE_PER_IP ?? 50);
// v8: /race/stream gets its OWN per-IP ceiling, far above the teacher-stream
// one — every student phone in a race holds a stream open, and one school NAT
// can front several classes simultaneously (spec §2.8).
const MAX_RACE_SSE_PER_IP = Number(process.env.LIVE_MAX_RACE_SSE_PER_IP ?? 200);
// v9: /tourney/stream mirrors the race counter with its own cap (spec §2.9).
const MAX_TOURNEY_SSE_PER_IP = Number(process.env.LIVE_MAX_TOURNEY_SSE_PER_IP ?? 200);
const rlHits = new Map(); // ip -> timestamps within the trailing minute
const sseByIp = new Map(); // ip -> open /live connection count
const raceSseByIp = new Map(); // ip -> open /race/stream connection count
const tourneySseByIp = new Map(); // ip -> open /tourney/stream connection count

function clientIpOf(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimited(ip) {
  if (!RATE_LIMIT_PER_MIN) return false; // 0 disables the limiter
  const windowStart = Date.now() - 60_000;
  const arr = (rlHits.get(ip) || []).filter((t) => t > windowStart);
  arr.push(Date.now());
  rlHits.set(ip, arr);
  return arr.length > RATE_LIMIT_PER_MIN;
}

app.use((req, res, next) => {
  const ip = clientIpOf(req);
  req.clientIp = ip;
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
});

// Safety valves — generous vs. the real classroom shape (30 students/room).
const MAX_SESSIONS = 20000;
const MAX_STUDENTS_PER_SESSION = 100;
const MAX_NAME_LENGTH = 40;
const MAX_ANSWER_ENTRIES = 500;
const MAX_ANSWER_KEY_LENGTH = 64;

// Per-question outcomes from the student engine: { questionId: 0|1 }.
// Anything malformed is dropped rather than rejected so old clients (which
// never send the field) and hostile payloads degrade the same way.
function cleanAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (key.length === 0 || key.length > MAX_ANSWER_KEY_LENGTH) continue;
    if (value !== 0 && value !== 1 && value !== true && value !== false) continue;
    out[key] = value ? 1 : 0;
    if (++n >= MAX_ANSWER_ENTRIES) break;
  }
  return n > 0 ? out : undefined;
}

// Room-level student-aid switches from the console (v7): which aids the
// teacher allows on student screens. Only the four known keys are kept and
// each is coerced to a boolean (missing → true, matching the clients'
// default). Anything malformed → null, and the field is simply not stored —
// clients then fall back to "everything allowed".
const FEATURE_KEYS = ['figure', 'theory', 'hints', 'calculator'];
function cleanFeatures(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of FEATURE_KEYS) out[key] = raw[key] !== false;
  return out;
}

// ─── Race mode (v8) — config sanitization ───────────────────────────────────
// Spec: docs/RACE_MODE_SPEC.md §2.2. Shape problems follow the same
// drop-don't-reject philosophy as `features` (malformed → field not stored →
// plain self-paced room; the console detects the missing `race.qCount` ack
// and fails loudly). Cap violations are DIFFERENT: they get explicit 400s
// (race_too_large / race_invalid) because a teacher must never unknowingly
// run a self-paced room while their console renders a race board.

const RACE_GET_READY_MS = 3000; // 3s "get ready" countdown baked into openAt
const RACE_ANSWER_GRACE_MS = 1500; // answers in flight at the buzzer still land
const RACE_EARLY_CLOSE_MS = 700; // all-answered → reveal (absorbs stragglers)
const RACE_AUTO_ADVANCE_MS = 8000; // auto mode: reveal → next question/podium

const MAX_RACE_QUESTIONS = 200;
const MAX_RACE_CONFIG_BYTES = 512 * 1024; // whole config, serialized
const MAX_RACE_SOLUTION_STEPS = 12;
const MAX_RACE_BLOCKS_PER_STEP = 30;
const MAX_RACE_STRING = 2000; // any single string inside solution content
const MAX_RACE_ACCEPT_ENTRIES = 20;
const MAX_RACE_ACCEPT_LENGTH = 200;
const MAX_RACE_OPTION_COUNT = 6;
const MIN_RACE_TIME_SEC = 5;
const MAX_RACE_TIME_SEC = 600;

// Explain-phase solution content (lesson-format steps) is opaque to the
// server — the phones and the board render it — so it is size-capped rather
// than schema-validated: strings are truncated, containers are copied up to a
// bounded depth/width, anything unserializable is dropped. The 512KB
// whole-config ceiling below bounds the total regardless.
const MAX_RACE_CONTENT_DEPTH = 8;
const MAX_RACE_CONTENT_KEYS = 40;
function clampRaceContent(value, depth = 0) {
  if (typeof value === 'string') return value.slice(0, MAX_RACE_STRING);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth >= MAX_RACE_CONTENT_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const v = clampRaceContent(item, depth + 1);
      if (v !== undefined) out.push(v);
      if (out.length >= MAX_RACE_CONTENT_KEYS) break;
    }
    return out;
  }
  if (typeof value === 'object') {
    const out = {};
    let n = 0;
    for (const [k, v] of Object.entries(value)) {
      const c = clampRaceContent(v, depth + 1);
      if (c !== undefined) out[String(k).slice(0, 64)] = c;
      if (++n >= MAX_RACE_CONTENT_KEYS) break;
    }
    return out;
  }
  return undefined;
}

// One race question. Returns the sanitized question or null — an invalid
// question is dropped (the console requires qCount to match what it sent, so
// a drop still fails room creation loudly on the console side).
function sanitizeRaceQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  // Same 64-char cap as /submit's answer keys on purpose — race question ids
  // ARE the keys doReveal() writes into student.answers.
  if (!id || id.length > MAX_ANSWER_KEY_LENGTH) return null;
  if (raw.type !== 'mcq' && raw.type !== 'input') return null;
  const t = Number(raw.timeSec);
  const timeSec = Number.isFinite(t)
    ? Math.min(MAX_RACE_TIME_SEC, Math.max(MIN_RACE_TIME_SEC, Math.round(t)))
    : 30;
  const q = { id, type: raw.type, timeSec };
  if (raw.type === 'mcq') {
    // `correct` is the CANONICAL option index (race forces canonical option
    // order on phones so board distribution letters match); `optionCount`
    // sizes the reveal distribution buckets.
    const optionCount = Number(raw.optionCount);
    const correct = Number(raw.correct);
    if (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > MAX_RACE_OPTION_COUNT) return null;
    if (!Number.isInteger(correct) || correct < 0 || correct >= optionCount) return null;
    q.optionCount = optionCount;
    q.correct = correct;
  } else {
    // The console pre-merges the question's `answer` into `accept`, so this
    // list is the complete grading key for the input question.
    if (!Array.isArray(raw.accept)) return null;
    const accept = raw.accept
      .filter((a) => typeof a === 'string' && a.trim().length > 0 && a.length <= MAX_RACE_ACCEPT_LENGTH)
      .slice(0, MAX_RACE_ACCEPT_ENTRIES);
    if (accept.length === 0) return null;
    q.accept = accept;
  }
  // Explain-phase content — all optional, broadcast ONLY at explain so a
  // student sniffing the SSE stream during the question learns nothing.
  if (Array.isArray(raw.solutionSteps) && raw.solutionSteps.length > 0) {
    const steps = [];
    for (const step of raw.solutionSteps.slice(0, MAX_RACE_SOLUTION_STEPS)) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
      const blocks = Array.isArray(step.blocks)
        ? step.blocks
            .slice(0, MAX_RACE_BLOCKS_PER_STEP)
            .map((b) => clampRaceContent(b))
            .filter((b) => b !== undefined)
        : [];
      if (blocks.length === 0) continue;
      steps.push({ name: clampRaceContent(step.name), blocks });
    }
    if (steps.length > 0) q.solutionSteps = steps;
  }
  if (Array.isArray(raw.solution) && raw.solution.length > 0) {
    const flat = raw.solution
      .slice(0, MAX_RACE_BLOCKS_PER_STEP)
      .map((s) => clampRaceContent(s))
      .filter((s) => s !== undefined);
    if (flat.length > 0) q.solution = flat;
  }
  if (Array.isArray(raw.solutionGeogebra) && raw.solutionGeogebra.length > 0) {
    const gg = raw.solutionGeogebra
      .filter((s) => typeof s === 'string' && s.length > 0)
      .slice(0, 60)
      .map((s) => s.slice(0, MAX_RACE_STRING));
    if (gg.length > 0) q.solutionGeogebra = gg;
  }
  return q;
}

// Returns {race} (sanitized config), {race:null} (absent/malformed → plain
// self-paced room) or {error} (cap violation → 400, NOT silent downgrade).
function sanitizeRaceConfig(raw) {
  if (raw === undefined || raw === null) return { race: null };
  if (typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.questions)) {
    return { race: null };
  }
  if (raw.questions.length > MAX_RACE_QUESTIONS) return { error: 'race_too_large' };
  const questions = raw.questions.map(sanitizeRaceQuestion).filter(Boolean);
  if (questions.length === 0) return { error: 'race_invalid' };
  const race = { auto: raw.auto === true, questions };
  if (JSON.stringify(race).length > MAX_RACE_CONFIG_BYTES) return { error: 'race_too_large' };
  return { race };
}

// ─── Race mode (v8) — input-answer grading ──────────────────────────────────
// PORT of normalizeAnswer / checkInputAnswer from src/lib/quiz/pack.ts
// ("Answer checking (typed answers)" section). Race answers are graded HERE —
// the phone only relays the raw string — so the two implementations MUST stay
// textually in sync: if the rules change in pack.ts, mirror them here (and
// vice versa). Rules: trim, lowercase, unicode minus → '-', comma → dot,
// strip all whitespace; exact string match, else both-numeric compare with
// 1e-9 tolerance.

// "2,5" and "2.5" are the same number to a student; so are "x+1" and "x + 1".
function normalizeAnswerServer(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/−/g, '-') // unicode minus
    .replace(/,/g, '.')
    .replace(/\s+/g, '');
}

// `accept` is the sanitized question's complete grading key (answer already
// merged in by the console — see sanitizeRaceQuestion).
function checkInputAnswerServer(given, accept) {
  const normalizedGiven = normalizeAnswerServer(given);
  if (!normalizedGiven) return false;
  for (const candidate of accept) {
    const normalizedCandidate = normalizeAnswerServer(candidate);
    if (!normalizedCandidate) continue;
    if (normalizedGiven === normalizedCandidate) return true;
    const a = Number(normalizedGiven);
    const b = Number(normalizedCandidate);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9) {
      return true;
    }
  }
  return false;
}

// ─── Tournament mode (v9) — config sanitization ─────────────────────────────
// Spec: docs/TOURNAMENT_MODE_SPEC.md §2.2. Same philosophy split as race:
// malformed SHAPE → field not stored → plain self-paced room (the console
// detects the missing `tourney.rounds` ack and fails loudly); cap violations
// → explicit 400s (tourney_too_large / tourney_invalid) because a teacher
// must never unknowingly run a self-paced room behind a tournament board.

const TOURNEY_GET_READY_MS = 3000; // 3s "get ready" countdown baked into openAt
const TOURNEY_ANSWER_GRACE_MS = 1500; // answers in flight at the buzzer still land

const MIN_TOURNEY_ROUNDS = 2;
const MAX_TOURNEY_ROUNDS = 16;
const MIN_TOURNEY_ANSWERS_PER_ROUND = 40;
const MAX_TOURNEY_ANSWERS_PER_ROUND = 400;
const MAX_TOURNEY_ANSWER_LENGTH = 24; // keypad strings ("2π/3", "−0,5", "√2/2")
const MAX_TOURNEY_CONFIG_BYTES = 256 * 1024; // whole config, serialized
const MIN_TOURNEY_ROUND_SEC = 30;
const MAX_TOURNEY_ROUND_SEC = 300;
const MAX_TOURNEY_LOCKOUT_SEC = 15;
// Student `given` strings are bounded well above any parseable answer
// (parseExact caps digit runs at 9) but below abuse territory.
const MAX_TOURNEY_GIVEN_LENGTH = 64;

// One round key: {seed, answers}. Returns the sanitized round or null — an
// unusable round is dropped (drop-don't-reject), and the console's required
// rounds-count ack turns any drop into a loud room-creation failure.
function sanitizeTourneyRound(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  // The seed must be stored EXACTLY as sent: the console derives each round's
  // problem sequence from the same 31-bit number client-side, so coercing or
  // masking here would silently desync grading from what students see.
  const seed = raw.seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff) return null;
  if (!Array.isArray(raw.answers)) return null;
  const answers = [];
  for (const a of raw.answers) {
    if (answers.length >= MAX_TOURNEY_ANSWERS_PER_ROUND) break; // truncate, don't reject
    // A malformed ENTRY kills the whole round: answers are indexed by seq, so
    // dropping one entry would shift every later key off by one.
    if (typeof a !== 'string' || a.length === 0 || a.length > MAX_TOURNEY_ANSWER_LENGTH) {
      return null;
    }
    answers.push(a);
  }
  if (answers.length < MIN_TOURNEY_ANSWERS_PER_ROUND) return null;
  return { seed, answers };
}

// Returns {tourney} (sanitized config), {tourney:null} (absent/malformed →
// plain self-paced room) or {error} (cap violation → 400, NOT silent
// downgrade). Console sends 12 rounds × 240 answers.
function sanitizeTourneyConfig(raw) {
  if (raw === undefined || raw === null) return { tourney: null };
  if (typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.rounds)) {
    return { tourney: null };
  }
  const rounds = [];
  for (const r of raw.rounds) {
    if (rounds.length >= MAX_TOURNEY_ROUNDS) break; // truncate, don't reject
    const clean = sanitizeTourneyRound(r);
    if (clean) rounds.push(clean);
  }
  if (rounds.length < MIN_TOURNEY_ROUNDS) return { error: 'tourney_invalid' };
  const rs = Number(raw.roundSec);
  const roundSec = Number.isFinite(rs)
    ? Math.min(MAX_TOURNEY_ROUND_SEC, Math.max(MIN_TOURNEY_ROUND_SEC, Math.round(rs)))
    : 90;
  const ls = Number(raw.lockoutSec);
  const lockoutSec = Number.isFinite(ls)
    ? Math.min(MAX_TOURNEY_LOCKOUT_SEC, Math.max(0, Math.round(ls)))
    : 4;
  const tourney = { roundSec, lockoutMs: lockoutSec * 1000, rounds };
  if (JSON.stringify(tourney).length > MAX_TOURNEY_CONFIG_BYTES) {
    return { error: 'tourney_too_large' };
  }
  return { tourney };
}

// Client-reported numbers (score, counters) are trusted for display but not to
// be sane: a hostile or buggy page can send a string, an object, NaN, Infinity
// or a negative. Coerce to a finite value in [0, max] so garbage can't be
// stored and broadcast to every teacher stream. Absurd input degrades to 0.
function cleanNumber(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > max ? max : n;
}

// Generous ceilings vs. any real quiz — high enough never to clip a legitimate
// score, low enough to keep the scoreboard readable and bound the field.
const MAX_SCORE_VALUE = 10_000_000;   // score / total
const MAX_TELEMETRY_VALUE = 1_000_000; // tabSwitches / awaySeconds

// ─── In-memory session store ───────────────────────────────────────────────
const sessions = new Map();

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateCode() {
  // Collision-checked AND unpredictable: crypto.randomBytes (not Math.random)
  // so a live room's code can't be guessed from an observed one — guessing is
  // the only way an outsider could reach /live or /submit for a class.
  for (let i = 0; i < 20; i++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let j = 0; j < 6; j++) code += CODE_ALPHABET[bytes[j] % CODE_ALPHABET.length];
    if (!sessions.has(code)) return code;
  }
  return null; // astronomically unlikely unless the store is packed
}

// Per-session teacher credential. Returned once to the room creator; required
// to control or watch the room when LIVE_HOST_SECRET_ENFORCED is set.
function generateHostSecret() {
  return crypto.randomBytes(24).toString('base64url');
}

// The console's student join link for the room, e.g.
// "/play/algebra-7?q=a,b&shuffle=1". Stored so GET /resolve can turn a typed
// room code into the right quiz — the kahoot-style universal entrance.
// Site-RELATIVE on purpose: no origin is ever stored, so moving the website
// to a new domain invalidates nothing, and the /join page never leaves its
// own site. Invalid values are dropped silently — a bad or missing path must
// never block opening a room (old consoles don't send one at all).
const MAX_STUDENT_PATH_LENGTH = 1000;
function sanitizeStudentPath(p) {
  if (typeof p !== 'string' || p.length > MAX_STUDENT_PATH_LENGTH) return null;
  // "/play/..." plus printable non-space ASCII only (query values arrive
  // URL-encoded). Rules out protocol-relative "//", whitespace smuggling and
  // control characters wholesale.
  if (!/^\/play\/[!-~]*$/.test(p)) return null;
  // Normalize the way a browser will (dot segments, backslashes, %2e tricks)
  // and re-check the prefix on the RESULT — "/play/../admin" and friends
  // normalize right out of /play/. The normalized form is what gets stored,
  // so /resolve never serves a path this check didn't see.
  try {
    const u = new URL(p, 'http://base');
    if (u.origin !== 'http://base' || !u.pathname.startsWith('/play/')) return null;
    return u.pathname + u.search;
  } catch (_) {
    return null;
  }
}

function verifyHostSecret(session, provided) {
  if (!HOST_SECRET_ENFORCED) return true; // dormant gate
  if (!session.hostSecret) return true; // legacy session predating the secret
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(session.hostSecret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function broadcast(session, payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  session.teachers.forEach(res => {
    try { res.write(msg); } catch (_) {}
  });
}

// ─── Race mode (v8) — state machine ─────────────────────────────────────────
// Spec: docs/RACE_MODE_SPEC.md §2.3–§2.6. One lockstep state machine per race
// room: idle → question → reveal [→ explain] → … → podium, driven by
// POST /race/advance. All timers live on session.race and are cleared on
// every transition, on /end, on the 45-min auto-end and on eviction — a stale
// timer firing into a dead or moved-on room is the classic bug here.

function newRaceState(config) {
  return {
    auto: config.auto,
    questions: config.questions, // sanitized config; never mutated after create
    phase: 'idle',               // 'idle'|'question'|'reveal'|'explain'|'podium'
    qIndex: -1,                  // current question, -1 before the first open
    openAt: null,                // epoch ms: answers accepted from here
    deadline: null,              // epoch ms: phones display this as time-up
    closeTimer: null,            // setTimeout handle → doReveal
    autoTimer: null,             // setTimeout handle → auto next
    answers: [],                 // per question: Map<studentId, {pick?, given?, at, ms, ok, base, bonus, points}>
    totals: new Map(),           // studentId -> {name, points, correct, streak, timeMs, lastRank}
    watchers: new Map(),         // studentId -> Set<res> (open /race/stream conns)
    closedCount: 0,              // questions revealed so far → student.total
    lastReveal: null,            // {qIndex, qId, correct, dist, board, answeredCount, activeCount}
  };
}

function clearRaceTimers(race) {
  if (!race) return;
  if (race.closeTimer) { clearTimeout(race.closeTimer); race.closeTimer = null; }
  if (race.autoTimer) { clearTimeout(race.autoTimer); race.autoTimer = null; }
}

function isKickedIn(session, studentId) {
  return Boolean(session.kicked && session.kicked.has(String(studentId)));
}

// "Active" for race purposes = present on the board: joined, not kicked
// (kicked records are deleted from the map) and not marked left.
function raceActiveCount(session) {
  let n = 0;
  for (const s of session.students.values()) {
    if (s.connected !== false) n++;
  }
  return n;
}

// Answers on the CURRENT question, excluding kicked students (their stored
// answer stays in the map so a re-join can't double-answer, but it must not
// inflate the teacher's "answered: 17/26" counter or the reveal dist).
function raceAnsweredCount(session) {
  const race = session.race;
  const ansMap = race.qIndex >= 0 ? race.answers[race.qIndex] : null;
  if (!ansMap) return 0;
  let n = 0;
  for (const sid of ansMap.keys()) {
    if (!isKickedIn(session, sid)) n++;
  }
  return n;
}

function sendRaceEvent(session, studentId, payload) {
  const set = session.race && session.race.watchers.get(studentId);
  if (!set) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch (_) {}
  }
}

function broadcastRaceStudents(session, payload) {
  const race = session.race;
  if (!race) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const set of race.watchers.values()) {
    for (const res of set) {
      try { res.write(msg); } catch (_) {}
    }
  }
}

// totals rows are created lazily (first answer, or seeded at reveal so
// never-answering students still appear on the board with 0 points). `name`
// is cached here so a student who leaves — or is later evicted from the
// students map — keeps their name on the final board.
function ensureRaceTotals(race, studentId, name) {
  let t = race.totals.get(studentId);
  if (!t) {
    t = { name: name || 'Student', points: 0, correct: 0, streak: 0, timeMs: 0, lastRank: null };
    race.totals.set(studentId, t);
  } else if (name) {
    t.name = name;
  }
  return t;
}

// Rank rule (spec): points desc, ties broken by EARLIER cumulative answer
// time (`timeMs`: answered questions contribute their response time, missed
// ones the full question time — so at equal points, not answering never
// beats answering slowly). Kicked students are excluded entirely.
function rankedRaceTotals(session) {
  const race = session.race;
  return Array.from(race.totals.entries())
    .filter(([sid]) => !isKickedIn(session, sid))
    .sort((a, b) => b[1].points - a[1].points || a[1].timeMs - b[1].timeMs);
}

function raceHasExplainContent(q) {
  // Mirrors hasExplainContent() in src/lib/quiz/pack.ts: solutionSteps, else
  // flat solution; a lone GeoGebra command list is not explainable content.
  return Boolean(
    (q.solutionSteps && q.solutionSteps.length) || (q.solution && q.solution.length),
  );
}

// Open question `qIndex` (phase → 'question'). The 3s get-ready countdown is
// BAKED INTO openAt: phones show 3‑2‑1 between event arrival and openAt, then
// the answer window runs to `deadline`. The server keeps accepting for
// RACE_ANSWER_GRACE_MS past the deadline so an answer already on the wire at
// the buzzer isn't lost to network latency — phones display `deadline`.
function openQuestion(session, qIndex) {
  const race = session.race;
  clearRaceTimers(race);
  const q = race.questions[qIndex];
  const now = Date.now();
  race.phase = 'question';
  race.qIndex = qIndex;
  race.openAt = now + RACE_GET_READY_MS;
  race.deadline = race.openAt + q.timeSec * 1000;
  race.answers[qIndex] = new Map();
  race.closeTimer = setTimeout(() => {
    race.closeTimer = null;
    doReveal(session);
  }, race.deadline + RACE_ANSWER_GRACE_MS - now);

  // remainingMs is the skew-free anchor: phones must never trust their own
  // wall clock, only "this many ms left as of receipt" (SSE latency ≈ ms).
  const base = {
    qIndex,
    qCount: race.questions.length,
    qId: q.id,
    openAt: race.openAt,
    deadline: race.deadline,
    remainingMs: Math.max(0, race.deadline - Date.now()),
    timeSec: q.timeSec,
  };
  broadcastRaceStudents(session, { type: 'question', ...base });
  broadcast(session, {
    type: 'race',
    phase: 'question',
    ...base,
    answeredCount: 0,
    activeCount: raceActiveCount(session),
  });
}

// The 8s auto-advance after a reveal. Only ever acts out of 'reveal' — the
// teacher pressing «Түсіндіру» (explain) cancels it for that question, and a
// manual advance clears it via the transition's clearRaceTimers.
function armAutoTimer(session) {
  const race = session.race;
  if (race.autoTimer) clearTimeout(race.autoTimer);
  race.autoTimer = setTimeout(() => {
    race.autoTimer = null;
    if (session.status !== 'active' || race.phase !== 'reveal') return;
    if (race.qIndex + 1 < race.questions.length) openQuestion(session, race.qIndex + 1);
    else goPodium(session);
  }, RACE_AUTO_ADVANCE_MS);
}

// Close the current question and score it (phase → 'reveal'). IDEMPOTENT by
// the phase guard — the deadline timer, the all-answered 700ms timer and a
// teacher's early-reveal button can all race each other harmlessly.
function doReveal(session) {
  const race = session.race;
  if (!race || race.phase !== 'question') return;
  if (race.closeTimer) { clearTimeout(race.closeTimer); race.closeTimer = null; }
  race.phase = 'reveal';

  const qIndex = race.qIndex;
  const q = race.questions[qIndex];
  const ansMap = race.answers[qIndex] || new Map();
  const fullMs = q.timeSec * 1000;
  const answeredCount = raceAnsweredCount(session);
  const activeCount = raceActiveCount(session);

  // Seed totals for every currently-joined student so the board includes the
  // ones who never answered anything (0 points beats being invisible).
  for (const [sid, s] of session.students.entries()) {
    ensureRaceTotals(race, String(sid), s.name);
  }

  // Settle scores. Speed points (`base`) were fixed at accept time (§2.6);
  // only the history-dependent streak bonus is decided here. prevRank is
  // captured BEFORE re-ranking so the board can show ▲/▼ movement.
  const prevRanks = new Map();
  for (const [sid, t] of race.totals.entries()) {
    if (isKickedIn(session, sid)) continue;
    prevRanks.set(sid, t.lastRank);
    const rec = ansMap.get(sid);
    if (rec && rec.ok) {
      t.streak += 1;
      rec.bonus = t.streak >= 2 ? 100 * Math.min(t.streak - 1, 5) : 0;
      rec.points = rec.base + rec.bonus;
      t.points += rec.points;
      t.correct += 1;
      t.timeMs += rec.ms;
    } else {
      t.streak = 0; // wrong OR missed resets the streak
      if (rec) {
        rec.bonus = 0;
        rec.points = 0;
        t.timeMs += rec.ms;
      } else {
        t.timeMs += fullMs; // missing beats nobody on the time tiebreak
      }
    }
  }

  const ranked = rankedRaceTotals(session);
  ranked.forEach(([, t], i) => { t.lastRank = i + 1; });

  // Write the graded outcome into the REGULAR student records so the v7
  // board, results screen and console autosave keep working unchanged:
  // score = correct count, total = questions closed so far, answers[qId] =
  // 0|1. `finished` is NOT touched here — it stays a self-paced concept
  // until the podium. updatedAt is left alone on purpose: it is the
  // presence-sweep signal and a server-side write must not mask a dead page.
  race.closedCount += 1;
  for (const [sid, s] of session.students.entries()) {
    const t = race.totals.get(String(sid));
    if (!t) continue;
    const rec = ansMap.get(String(sid));
    s.score = t.correct;
    s.total = race.closedCount;
    s.answers = { ...(s.answers || {}), [q.id]: rec && rec.ok ? 1 : 0 };
    broadcast(session, { type: 'update', studentId: sid, ...s });
  }

  // The correct answer only leaves the server NOW — never before reveal.
  const correct = q.type === 'mcq' ? { pick: q.correct } : { answer: q.accept[0] };

  // Distribution buckets (kicked students excluded — spec §2 rank/dist rule).
  let dist;
  if (q.type === 'mcq') {
    dist = new Array(q.optionCount).fill(0);
    for (const [sid, rec] of ansMap.entries()) {
      if (isKickedIn(session, sid)) continue;
      if (Number.isInteger(rec.pick) && rec.pick >= 0 && rec.pick < q.optionCount) {
        dist[rec.pick] += 1;
      }
    }
  } else {
    let okCount = 0;
    let wrongCount = 0;
    for (const [sid, rec] of ansMap.entries()) {
      if (isKickedIn(session, sid)) continue;
      if (rec.ok) okCount += 1;
      else wrongCount += 1;
    }
    dist = { ok: okCount, wrong: wrongCount, none: Math.max(0, activeCount - okCount - wrongCount) };
  }

  const board = ranked.map(([sid, t]) => {
    const rec = ansMap.get(sid);
    const s = session.students.get(sid);
    return {
      studentId: sid,
      name: (s && s.name) || t.name,
      points: t.points,
      delta: rec ? rec.points : 0,
      ok: Boolean(rec && rec.ok),
      streak: t.streak,
      rank: t.lastRank,
      // First appearance on a board (first reveal of the race, or a student's
      // first scored reveal after joining mid-race) has no previous rank —
      // send the CURRENT rank so the console renders a neutral dot, never a
      // fabricated ▲/▼ movement.
      prevRank: prevRanks.get(sid) ?? t.lastRank,
    };
  });

  // Kept around for late joiners' connect snapshots, the /live snapshot
  // (mid-race console reload) and the podium's final board.
  race.lastReveal = { qIndex, qId: q.id, correct, dist, board, answeredCount, activeCount };

  broadcast(session, {
    type: 'race',
    phase: 'reveal',
    qIndex,
    qCount: race.questions.length,
    qId: q.id,
    correct,
    dist,
    board,
    answeredCount,
    activeCount,
  });

  // Individualized: each phone sees only ITS own result + the shared correct
  // answer — a student's stream never carries classmates' scores.
  for (const sid of race.watchers.keys()) {
    const ev = buildStudentReveal(session, sid);
    if (ev) sendRaceEvent(session, sid, ev);
  }

  if (race.auto) armAutoTimer(session);
}

// The per-student view of the last reveal — used both as the live 'reveal'
// event and embedded in the connect 'state' snapshot for resyncing phones.
function buildStudentReveal(session, studentId) {
  const race = session.race;
  const lr = race.lastReveal;
  if (!lr) return null;
  const ansMap = race.answers[lr.qIndex];
  const rec = ansMap ? ansMap.get(studentId) : undefined;
  const t = race.totals.get(studentId);
  return {
    type: 'reveal',
    qIndex: lr.qIndex,
    qCount: race.questions.length,
    qId: lr.qId,
    correct: lr.correct,
    you: {
      answered: Boolean(rec),
      ok: Boolean(rec && rec.ok),
      points: rec ? rec.base : 0, // speed points; streak bonus rides separately
      bonus: rec ? rec.bonus || 0 : 0,
      streak: t ? t.streak : 0,
      totalPoints: t ? t.points : 0,
      rank: t && t.lastRank != null ? t.lastRank : null,
      of: lr.board.length,
    },
  };
}

// Explain payload: the stored solution content finally leaves the server.
// Shared shape between the live 'explain' event and the connect snapshot.
function buildExplainEvent(session) {
  const race = session.race;
  const q = race.questions[race.qIndex];
  return {
    type: 'explain',
    qIndex: race.qIndex,
    qCount: race.questions.length,
    qId: q.id,
    ...(q.solutionSteps ? { solutionSteps: q.solutionSteps } : {}),
    ...(q.solution ? { solution: q.solution } : {}),
    ...(q.solutionGeogebra ? { solutionGeogebra: q.solutionGeogebra } : {}),
  };
}

function doExplain(session) {
  const race = session.race;
  race.phase = 'explain';
  // Explain cancels auto-advance for THIS question: the teacher is talking,
  // the room must not move on under them. (Re-armed at the next reveal.)
  if (race.autoTimer) { clearTimeout(race.autoTimer); race.autoTimer = null; }
  // The console renders solution content from its local pack — the teacher
  // event only signals the transition; phones get the full payload.
  broadcast(session, {
    type: 'race',
    phase: 'explain',
    qIndex: race.qIndex,
    qCount: race.questions.length,
  });
  broadcastRaceStudents(session, buildExplainEvent(session));
}

function buildStudentPodium(session, studentId) {
  const race = session.race;
  const board = race.lastReveal ? race.lastReveal.board : [];
  const t = race.totals.get(studentId);
  return {
    type: 'podium',
    qIndex: race.qIndex,
    qCount: race.questions.length,
    top: board.slice(0, 3).map((r) => ({ name: r.name, points: r.points })),
    you: {
      rank: t && t.lastRank != null ? t.lastRank : null,
      of: board.length,
      points: t ? t.points : 0,
      correct: t ? t.correct : 0,
    },
  };
}

function goPodium(session) {
  const race = session.race;
  clearRaceTimers(race);
  race.phase = 'podium';

  // Mark everyone still present as finished so the console's autosave rows
  // look complete (score/total were already server-written at each reveal).
  // Left students keep finished=false — the same signal self-paced gives.
  for (const [studentId, student] of session.students.entries()) {
    if (student.connected === false || student.finished) continue;
    student.finished = true;
    broadcast(session, { type: 'update', studentId, ...student });
  }

  // Totals haven't moved since the last reveal, so its board IS the final
  // standings (podium is only reachable from reveal/explain of the last q).
  const board = race.lastReveal ? race.lastReveal.board : [];
  broadcast(session, {
    type: 'race',
    phase: 'podium',
    qIndex: race.qIndex,
    qCount: race.questions.length,
    board,
  });
  for (const sid of race.watchers.keys()) {
    sendRaceEvent(session, sid, buildStudentPodium(session, sid));
  }
}

// The individualized connect snapshot for /race/stream — also THE resync
// shape: a phone that lost its stream (screen lock kills SSE) reopens and
// this restores the exact phase, its own answered flag and running totals.
function buildStudentState(session, studentId) {
  const race = session.race;
  const now = Date.now();
  const state = {
    type: 'state',
    phase: race.phase,
    qIndex: race.qIndex,
    qCount: race.questions.length,
  };
  if (race.qIndex >= 0) {
    const q = race.questions[race.qIndex];
    const ansMap = race.answers[race.qIndex];
    state.qId = q.id;
    state.openAt = race.openAt;
    state.deadline = race.deadline;
    state.remainingMs = Math.max(0, (race.deadline || now) - now);
    state.timeSec = q.timeSec;
    state.answered = Boolean(ansMap && ansMap.has(studentId));
  }
  const t = race.totals.get(studentId);
  state.you = {
    points: t ? t.points : 0,
    correct: t ? t.correct : 0,
    streak: t ? t.streak : 0,
    rank: t && t.lastRank != null ? t.lastRank : null,
    of: race.lastReveal ? race.lastReveal.board.length : 0,
  };
  if (race.phase === 'reveal' || race.phase === 'explain' || race.phase === 'podium') {
    const reveal = buildStudentReveal(session, studentId);
    if (reveal) state.reveal = reveal;
  }
  if (race.phase === 'explain') state.explain = buildExplainEvent(session);
  // Additive beyond the spec's state example: a phone connecting DURING the
  // podium needs the top-3 too, not just its own `you` line.
  if (race.phase === 'podium') state.podium = buildStudentPodium(session, studentId);
  return state;
}

// §2.7 — the poll-level resync channel riding /status and /submit responses:
// how a student page learns the room is a race before opening the stream, and
// how it recovers after an SSE drop. `answered` only when a studentId is known.
function raceSummary(session, studentId) {
  const race = session.race;
  const now = Date.now();
  const out = {
    phase: race.phase,
    qIndex: race.qIndex,
    qCount: race.questions.length,
    auto: race.auto,
  };
  if (race.qIndex >= 0) {
    const q = race.questions[race.qIndex];
    out.qId = q.id;
    out.openAt = race.openAt;
    out.deadline = race.deadline;
    out.remainingMs = Math.max(0, (race.deadline || now) - now);
  }
  if (studentId !== undefined && studentId !== null && studentId !== '') {
    const ansMap = race.qIndex >= 0 ? race.answers[race.qIndex] : null;
    out.answered = Boolean(ansMap && ansMap.has(String(studentId)));
  }
  return out;
}

// The teacher-side race view embedded in the /live connect snapshot — a
// mid-race console reload restores the exact board (dist + standings) from it.
function teacherRaceState(session) {
  const race = session.race;
  const now = Date.now();
  const out = {
    phase: race.phase,
    qIndex: race.qIndex,
    qCount: race.questions.length,
    auto: race.auto,
    answeredCount: raceAnsweredCount(session),
    activeCount: raceActiveCount(session),
  };
  if (race.qIndex >= 0) {
    const q = race.questions[race.qIndex];
    out.qId = q.id;
    out.openAt = race.openAt;
    out.deadline = race.deadline;
    out.remainingMs = Math.max(0, (race.deadline || now) - now);
    out.timeSec = q.timeSec;
  }
  if (race.lastReveal) {
    // The standings board rides EVERY snapshot (not just reveal/explain/
    // podium): a console reloading mid-question re-stamps each card's race
    // points from it, so an end-before-next-reveal (teacher End, 45-min
    // clock) still autosaves the points earned so far. correct/dist stay
    // gated to the post-close phases — they describe the CLOSED question and
    // must not sit next to an open one.
    out.board = race.lastReveal.board;
    if (race.phase === 'reveal' || race.phase === 'explain' || race.phase === 'podium') {
      out.correct = race.lastReveal.correct;
      out.dist = race.lastReveal.dist;
    }
  }
  return out;
}

// ─── Tournament mode (v9) — state machine ───────────────────────────────────
// Spec: docs/TOURNAMENT_MODE_SPEC.md §2.3–§2.7. One teacher-paced state
// machine per tournament room: idle → (pair) pairing → (start) duel →
// [settle at deadline+grace] result → … → podium, driven by
// POST /tourney/advance. There is NO manual early-close of a round — the
// clock always runs its full length so every duel is the same length. All
// pairing/settling math lives in bracket.js (pure, seeded); this section owns
// timers, wire shapes and the glue into the regular student records.

function newTourneyState(config) {
  return {
    roundSec: config.roundSec,
    lockoutMs: config.lockoutMs,
    rounds: config.rounds,   // sanitized [{seed, answers}]; never mutated
    phase: 'idle',           // 'idle'|'pairing'|'duel'|'result'|'podium'
    round: 0,                // 1-based once the first draw happens
    plan: null,              // current round's RoundPlan (bracket.js §3)
    openAt: null,            // epoch ms while phase === 'duel'
    deadline: null,          // epoch ms while phase === 'duel'
    closeTimer: null,        // setTimeout → settleTourneyRound at deadline+grace
    scores: new Map(),       // studentId -> {correct, wrong, seqDone, lastCorrectAt, lockedUntil} — CURRENT round
    // bracket-engine state (§3) — the spec fixes this initial literal; only
    // applyOutcome (at settle) ever produces the next one.
    alive: [],               // main-bracket studentIds still in
    out: [],                 // eliminated + losers-pool players
    champion: null,          // studentId once decided
    history: [],             // settled rounds: {round, plan, outcome}
    firstDrawDone: false,
    totals: new Map(),       // studentId -> {name, correct, wrong, wins} — whole tournament
    late: new Set(),         // ids whose first roster contact came after the first draw
    watchers: new Map(),     // studentId -> Set<res> (open /tourney/stream conns)
    standings: null,         // final ranked rows (+names), set at podium
  };
}

// The five bracket-state fields live flat on session.tourney (§2.3) but the
// engine wants them as one object — this view is what planRound/applyOutcome
// read; the settle copies the new state back field by field.
function bracketStateOf(t) {
  return {
    alive: t.alive,
    out: t.out,
    champion: t.champion,
    history: t.history,
    firstDrawDone: t.firstDrawDone,
  };
}

function clearTourneyTimers(t) {
  if (!t) return;
  if (t.closeTimer) { clearTimeout(t.closeTimer); t.closeTimer = null; }
}

// Names are cached in totals rows (race precedent) so kicked students — whose
// roster records are deleted — keep their names on the bracket and standings.
function ensureTourneyTotals(t, studentId, name) {
  let row = t.totals.get(studentId);
  if (!row) {
    row = { name: name || 'Student', correct: 0, wrong: 0, wins: 0 };
    t.totals.set(studentId, row);
  } else if (name) {
    row.name = name;
  }
  return row;
}

function tourneyNameOf(session, studentId) {
  const rec = session.students.get(studentId);
  if (rec) return rec.name;
  const cached = session.tourney.totals.get(studentId);
  return cached ? cached.name : 'Student';
}

// The bracket engine's roster view: every joined student, PLUS the kicked ids
// (their records were deleted by /kick, but settleRound needs kicked:true
// entries to force-lose them, and finalStandings ranks every participant —
// kicked included).
function tourneyRoster(session) {
  const t = session.tourney;
  const roster = [];
  const seen = new Set();
  for (const [sid, s] of session.students.entries()) {
    const id = String(sid);
    seen.add(id);
    roster.push({
      id,
      name: s.name,
      kicked: false,
      connected: s.connected !== false,
      joinedAfterFirstDraw: t.late.has(id),
    });
  }
  if (session.kicked) {
    for (const id of session.kicked) {
      if (seen.has(id)) continue;
      roster.push({
        id,
        name: tourneyNameOf(session, id),
        kicked: true,
        connected: false,
        joinedAfterFirstDraw: t.late.has(id),
      });
    }
  }
  return roster;
}

function tourneyRowMembers(row) {
  const members = [row.a];
  if (row.b != null) members.push(row.b);
  if (row.c != null) members.push(row.c);
  return members;
}

// The plan row a student plays in this round (main pair, bye row, losers
// pair/trio/solo) — null when they are not drawn (latecomer, kicked).
function tourneyRowOf(plan, studentId) {
  if (!plan) return null;
  for (const row of plan.main) {
    if (tourneyRowMembers(row).includes(studentId)) return row;
  }
  for (const row of plan.losers) {
    if (tourneyRowMembers(row).includes(studentId)) return row;
  }
  return null;
}

function tourneyPartners(plan, studentId) {
  const row = tourneyRowOf(plan, studentId);
  if (!row) return [];
  return tourneyRowMembers(row).filter((id) => id !== studentId);
}

// Role in the CURRENT round (§2.6): bye beats main (the bye row sits in
// plan.main with b:null); a solo losers row still reads 'losers'.
function tourneyRoleOf(t, studentId) {
  if (!t.plan) return 'waiting';
  if (t.plan.byeId === studentId) return 'bye';
  for (const row of t.plan.main) {
    if (tourneyRowMembers(row).includes(studentId)) return 'main';
  }
  for (const row of t.plan.losers) {
    if (tourneyRowMembers(row).includes(studentId)) return 'losers';
  }
  return 'waiting';
}

function sendTourneyEvent(session, studentId, payload) {
  const set = session.tourney && session.tourney.watchers.get(studentId);
  if (!set) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch (_) {}
  }
}

function broadcastTourneyStudents(session, payload) {
  const t = session.tourney;
  if (!t) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const set of t.watchers.values()) {
    for (const res of set) {
      try { res.write(msg); } catch (_) {}
    }
  }
}

// This round's opponents of a student, as the wire shows them. Presence
// fields ride the state snapshot and presence relays; the pairing event
// carries names only (the reveal must not leak live scores early).
function tourneyOpponentsOf(session, studentId, withPresence) {
  const t = session.tourney;
  return tourneyPartners(t.plan, studentId).map((pid) => {
    const sc = t.scores.get(pid);
    // id is additive on the wire (spec §2.6 shows name-only): clients merge
    // tick/presence by it so two same-named opponents in a trio can't
    // conflate; old clients ignore the extra field.
    const entry = { id: pid, name: tourneyNameOf(session, pid), correct: sc ? sc.correct : 0 };
    if (withPresence) {
      const rec = session.students.get(pid);
      entry.connected = rec ? rec.connected !== false : false;
      entry.away = rec ? rec.focused === false : false;
      entry.awaySeconds = rec ? rec.awaySeconds || 0 : 0;
    }
    return entry;
  });
}

// §2.6 'pairing' — the individualized draw reveal.
function buildTourneyPairing(session, studentId) {
  const t = session.tourney;
  return {
    type: 'pairing',
    round: t.round,
    role: tourneyRoleOf(t, studentId),
    opponents: tourneyPartners(t.plan, studentId).map((pid) => ({
      id: pid,
      name: tourneyNameOf(session, pid),
    })),
    luckyLoser: t.plan.luckyLoserId === studentId,
  };
}

// §2.6 'result' — built from the last settled round in history, so the same
// function serves the live event and the resync snapshot. null for a student
// who played in no row (latecomer waiting for their first draw).
function buildTourneyResult(session, studentId) {
  const t = session.tourney;
  const last = t.history[t.history.length - 1];
  if (!last) return null;
  const row = last.outcome.duels.find((r) => tourneyRowMembers(r).includes(studentId));
  if (!row) return null;
  const you = row.scores[studentId];
  const champion = last.outcome.champion === studentId;
  let nextRole;
  if (champion) nextRole = 'champion';
  else if (t.champion != null || t.round >= t.rounds.length) nextRole = 'waiting';
  else if (t.alive.includes(studentId)) nextRole = 'main';
  else nextRole = 'losers';
  return {
    type: 'result',
    round: last.round,
    won: row.winner === studentId,
    eliminated: last.outcome.eliminated.includes(studentId),
    champion,
    you: { correct: you.correct, wrong: you.wrong },
    opponents: tourneyRowMembers(row)
      .filter((id) => id !== studentId)
      .map((id) => ({
        id,
        name: tourneyNameOf(session, id),
        correct: row.scores[id].correct,
      })),
    nextRole,
  };
}

// §2.6 'podium' — final standings were frozen (with names) at the podium
// transition; champion falls back to the rank-1 row on the no_rounds_left
// path, where the bracket never crowned anyone.
function buildTourneyPodium(session, studentId) {
  const t = session.tourney;
  const rows = t.standings || [];
  const championRow = t.champion != null
    ? rows.find((r) => r.studentId === t.champion)
    : rows[0];
  const you = rows.find((r) => r.studentId === studentId);
  return {
    type: 'podium',
    champion: { name: championRow ? championRow.name : 'Student' },
    top: rows.slice(0, 3).map((r) => ({ name: r.name, wins: r.wins, correct: r.correct })),
    you: {
      rank: you ? you.rank : null,
      of: rows.length,
      wins: you ? you.wins : 0,
      correct: you ? you.correct : 0,
    },
  };
}

// §2.7 — one wire row per drawn round. Settled rounds read from the
// self-contained history rows; the live (current) round reads the running
// scores and carries no winner/settled:true yet.
function serializeTourneyRound(session, roundNo, plan, duels, settled) {
  const t = session.tourney;
  const liveScore = (id) => {
    const sc = t.scores.get(id);
    return sc ? sc.correct : 0;
  };
  const rowScore = (row, id) =>
    settled ? row.scores[id].correct : liveScore(id);
  const mapRow = (row) => {
    const out = {
      a: row.a,
      b: row.b == null ? null : row.b,
      scoreA: rowScore(row, row.a),
      scoreB: row.b == null ? null : rowScore(row, row.b),
    };
    if (row.c != null) {
      out.c = row.c;
      out.scoreC = rowScore(row, row.c);
    }
    if (settled) out.winner = row.winner;
    return out;
  };
  const mainRows = settled ? duels.filter((d) => d.bracket === 'main') : plan.main;
  const loserRows = settled ? duels.filter((d) => d.bracket === 'losers') : plan.losers;
  return {
    round: roundNo,
    main: mainRows.map(mapRow),
    losers: loserRows.map(mapRow),
    byeId: plan.byeId,
    luckyLoserId: plan.luckyLoserId,
    settled,
  };
}

// §2.7 — the FULL serialized bracket (teacher wire shape). Names ride in
// `players` so the board renders without a roster join; `standings` is the
// running total order (rank included — additive over the spec shape).
function serializeTourneyBracket(session) {
  const t = session.tourney;
  const roster = tourneyRoster(session);
  const players = {};
  for (const r of roster) {
    players[r.id] = { name: r.name, connected: r.connected, kicked: r.kicked };
  }
  const history = t.history.map((h) =>
    serializeTourneyRound(session, h.round, h.plan, h.outcome.duels, true),
  );
  // pairing/duel = the current round is drawn but unsettled → append it live.
  // At result/podium the just-settled round is already the last history row.
  if (t.plan && (t.phase === 'pairing' || t.phase === 'duel')) {
    history.push(serializeTourneyRound(session, t.round, t.plan, null, false));
  }
  return {
    phase: t.phase,
    round: t.round,
    roundCount: t.rounds.length,
    champion: t.champion,
    players,
    history,
    standings: finalStandings(bracketStateOf(t), t.totals, roster),
  };
}

// Teacher 'tourney' event — sent on EVERY phase transition (§2.6); the clock
// fields ride only while a duel is open, mirroring the student events.
function broadcastTourneyTeacher(session) {
  const t = session.tourney;
  const payload = {
    type: 'tourney',
    phase: t.phase,
    round: t.round,
    roundSec: t.roundSec,
    bracket: serializeTourneyBracket(session),
  };
  if (t.phase === 'duel') {
    payload.openAt = t.openAt;
    payload.deadline = t.deadline;
    payload.remainingMs = Math.max(0, t.deadline - Date.now());
  }
  broadcast(session, payload);
}

// The teacher-side tournament view embedded in the /live connect snapshot —
// a mid-tournament console reload restores the exact board from it.
function teacherTourneyState(session) {
  const t = session.tourney;
  const out = {
    phase: t.phase,
    round: t.round,
    roundSec: t.roundSec,
    bracket: serializeTourneyBracket(session),
  };
  if (t.phase === 'duel') {
    out.openAt = t.openAt;
    out.deadline = t.deadline;
    out.remainingMs = Math.max(0, t.deadline - Date.now());
  }
  return out;
}

// §2.8 — the poll-level resync summary riding /status and /submit responses;
// also how the student page learns the room is a tournament at all.
function tourneySummary(session) {
  const t = session.tourney;
  const out = { phase: t.phase, round: t.round, roundSec: t.roundSec };
  if (t.round >= 1) out.seed = t.rounds[t.round - 1].seed;
  if (t.phase === 'duel') {
    out.openAt = t.openAt;
    out.deadline = t.deadline;
    out.remainingMs = Math.max(0, t.deadline - Date.now());
  }
  return out;
}

// The individualized connect snapshot for /tourney/stream — also THE resync
// shape (§2.6): SSE drop / reload / screen lock → reconnect restores the
// exact screen. `you.seq` is the NEXT expected seq.
function buildTourneyStudentState(session, studentId) {
  const t = session.tourney;
  const now = Date.now();
  const state = { type: 'state', phase: t.phase, round: t.round, roundSec: t.roundSec };
  if (t.round >= 1) state.seed = t.rounds[t.round - 1].seed;
  if (t.phase === 'duel') {
    state.openAt = t.openAt;
    state.deadline = t.deadline;
    state.remainingMs = Math.max(0, t.deadline - now);
  }
  const sc = t.scores.get(studentId);
  const tot = t.totals.get(studentId);
  state.you = {
    correct: sc ? sc.correct : 0,
    wrong: sc ? sc.wrong : 0,
    seq: (sc ? sc.seqDone : 0) + 1,
    lockRemainMs: sc ? Math.max(0, sc.lockedUntil - now) : 0,
    role: tourneyRoleOf(t, studentId),
    wins: tot ? tot.wins : 0,
    totalCorrect: tot ? tot.correct : 0,
  };
  if (t.plan) {
    state.pair = { opponents: tourneyOpponentsOf(session, studentId, true) };
  }
  if (t.phase === 'result') {
    const result = buildTourneyResult(session, studentId);
    if (result) state.result = result;
  }
  if (t.phase === 'podium') state.podium = buildTourneyPodium(session, studentId);
  return state;
}

// A presence change (connected / focused / awaySeconds) while a duel is live
// is relayed to the student's duel partner(s) — §2.5. Fired from /submit
// heartbeats, /leave beacons and the 45s staleness sweep.
function relayTourneyPresence(session, studentId) {
  const t = session.tourney;
  if (!t || t.phase !== 'duel' || !t.plan) return;
  const partners = tourneyPartners(t.plan, studentId);
  if (partners.length === 0) return;
  const rec = session.students.get(studentId);
  const payload = {
    type: 'presence',
    opponents: [{
      id: studentId,
      name: tourneyNameOf(session, studentId),
      connected: rec ? rec.connected !== false : false,
      away: rec ? rec.focused === false : false,
      awaySeconds: rec ? rec.awaySeconds || 0 : 0,
    }],
  };
  for (const pid of partners) sendTourneyEvent(session, pid, payload);
}

// Draw a round (§2.4 'pair'). The rng is a FRESH mulberry32 of the round's
// configured seed, so the whole draw replays bit-for-bit from the config —
// the same seed the phones use to generate the round's problem sequence.
function doTourneyPair(session) {
  const t = session.tourney;
  clearTourneyTimers(t);
  const rng = mulberry32(t.rounds[t.round].seed); // rounds[N-1] for new round N
  t.plan = planRound(bracketStateOf(t), tourneyRoster(session), rng);
  t.round += 1;
  t.phase = 'pairing';
  t.openAt = null;
  t.deadline = null;
  // Reset per-round scores at the DRAW, not just at start: every wire shape
  // read during 'pairing' (student state you.*, pair opponents' correct,
  // the serialized round's live rows) must show the fresh round's zeros,
  // not the settled previous round's numbers.
  t.scores = new Map();
  for (const sid of t.watchers.keys()) {
    sendTourneyEvent(session, sid, buildTourneyPairing(session, sid));
  }
  broadcastTourneyTeacher(session);
}

// Open the round (§2.4 'start'). The 3s get-ready countdown is BAKED INTO
// openAt (race precedent); the settle timer runs at deadline+grace so an
// answer already on the wire at the buzzer still lands — phones display
// `deadline`.
function doTourneyStart(session) {
  const t = session.tourney;
  clearTourneyTimers(t);
  const now = Date.now();
  t.phase = 'duel';
  t.openAt = now + TOURNEY_GET_READY_MS;
  t.deadline = t.openAt + t.roundSec * 1000;
  t.scores = new Map(); // fresh per-round scores
  t.closeTimer = setTimeout(() => {
    t.closeTimer = null;
    settleTourneyRound(session);
  }, t.deadline + TOURNEY_ANSWER_GRACE_MS - now);
  broadcastTourneyStudents(session, {
    type: 'duel',
    round: t.round,
    seed: t.rounds[t.round - 1].seed,
    roundSec: t.roundSec,
    openAt: t.openAt,
    deadline: t.deadline,
    remainingMs: Math.max(0, t.deadline - Date.now()),
  });
  broadcastTourneyTeacher(session);
}

// Settle the round (§2.4) — timer-driven only, IDEMPOTENT by the phase guard
// (an /end or auto-end clears the timer, so a stale settle can never fire
// into a moved-on room; the guard covers the rest).
function settleTourneyRound(session) {
  const t = session.tourney;
  if (!t || t.phase !== 'duel') return;
  clearTourneyTimers(t);
  t.phase = 'result';

  const roster = tourneyRoster(session);
  const outcome = settleRound(t.plan, t.scores, roster);
  const next = applyOutcome(bracketStateOf(t), t.plan, outcome);
  t.alive = next.alive;
  t.out = next.out;
  t.champion = next.champion;
  t.history = next.history;
  t.firstDrawDone = next.firstDrawDone;

  // Totals (§2.4 step 3): every duelist banks the round's correct/wrong; +1
  // win per duel/trio winner — read from the duels rows so bye and solo rows
  // count too (a bye IS a win).
  for (const row of outcome.duels) {
    for (const id of tourneyRowMembers(row)) {
      const tot = ensureTourneyTotals(t, id, tourneyNameOf(session, id));
      tot.correct += row.scores[id].correct;
      tot.wrong += row.scores[id].wrong;
    }
    ensureTourneyTotals(t, row.winner, tourneyNameOf(session, row.winner)).wins += 1;
  }

  // §2.4 step 4: write totals into the REGULAR student records so the v7
  // board, results screen and console autosave keep working. `finished` is
  // untouched until podium; updatedAt stays alone (presence-sweep signal).
  for (const [sid, s] of session.students.entries()) {
    const tot = t.totals.get(String(sid));
    if (!tot) continue;
    const score = tot.correct;
    const total = tot.correct + tot.wrong;
    if (s.score === score && s.total === total) continue;
    s.score = score;
    s.total = total;
    broadcast(session, { type: 'update', studentId: sid, ...s });
  }

  // §2.4 step 5: individualized results (only students who played a row this
  // round — a waiting latecomer's screen has nothing to settle) + teacher.
  for (const sid of t.watchers.keys()) {
    const ev = buildTourneyResult(session, sid);
    if (ev) sendTourneyEvent(session, sid, ev);
  }
  broadcastTourneyTeacher(session);
}

// §2.4 'podium'. Standings are frozen HERE (with names) so podium snapshots
// stay stable even as students leave; connected students are marked finished
// so the console's autosave rows look complete (race precedent).
function doTourneyPodium(session) {
  const t = session.tourney;
  clearTourneyTimers(t);
  t.phase = 'podium';

  const roster = tourneyRoster(session);
  t.standings = finalStandings(bracketStateOf(t), t.totals, roster).map((row) => ({
    ...row,
    name: tourneyNameOf(session, row.studentId),
  }));

  // Update the regular records one last time, then mark everyone still
  // present as finished. Left students keep finished=false — the same signal
  // self-paced gives.
  for (const [studentId, student] of session.students.entries()) {
    const tot = t.totals.get(String(studentId));
    let changed = false;
    if (tot) {
      const score = tot.correct;
      const total = tot.correct + tot.wrong;
      if (student.score !== score || student.total !== total) {
        student.score = score;
        student.total = total;
        changed = true;
      }
    }
    if (student.connected !== false && !student.finished) {
      student.finished = true;
      changed = true;
    }
    if (changed) broadcast(session, { type: 'update', studentId, ...student });
  }

  broadcastTourneyTeacher(session);
  for (const sid of t.watchers.keys()) {
    sendTourneyEvent(session, sid, buildTourneyPodium(session, sid));
  }
}

// §2.5 grading: both sides run through the exact port. If the KEY fails to
// parse (should never — the console generates it from toPlain output), fall
// back to normalized string equality: trim, unicode minus → '-', comma → '.'.
function gradeTourneyAnswer(given, key) {
  const parsedKey = parseExact(key);
  if (parsedKey) {
    const parsedGiven = parseExact(given);
    return parsedGiven != null && equalsExact(parsedGiven, parsedKey);
  }
  const norm = (v) => String(v).trim().replace(/−/g, '-').replace(/,/g, '.');
  return norm(given) === norm(key);
}

// ─── Auth gate (PLAN.md "Gate 2") ──────────────────────────────────────────
// Token format: base64url(JSON {uid, exp}) + '.' + base64url(HMAC-SHA256).
// Issued by the website's /api/quiz-token for signed-in teachers; verified
// here with the shared secret. No secret configured → gate is open (v1
// behavior) so already-uploaded consoles keep working — and no uid can be
// trusted, so the one-room-per-teacher rule stays dormant with it.
// Returns { ok, uid }: ok=false only when the gate is ENFORCED and the token
// is missing/invalid; uid is non-null only for a signature-verified token.
function parseQuizToken(token) {
  if (!AUTH_ENFORCED) return { ok: true, uid: null };
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, uid: null };
  const [payloadB64, sig] = token.split('.');
  try {
    const expected = crypto
      .createHmac('sha256', QUIZ_TOKEN_SECRET)
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, uid: null };
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, uid: null };
    }
    return { ok: true, uid: typeof payload.uid === 'string' ? payload.uid : null };
  } catch (_) {
    return { ok: false, uid: null };
  }
}

// "The teacher who owns this room is asking": a verified token whose uid
// matches the room's creator. Lets the console end its owner's OTHER room
// (whose hostSecret lives in a different tab/device) after an active_room 409.
function isOwnerToken(session, token) {
  if (!session.ownerUid) return false;
  const auth = parseQuizToken(token);
  return auth.ok && auth.uid !== null && auth.uid === session.ownerUid;
}

// Check if session should auto-end (45 min elapsed)
function checkAutoEnd(session) {
  if (session.status === 'active' && session.startedAt) {
    if (Date.now() - session.startedAt >= SESSION_DURATION) {
      session.status = 'ended';
      // v8: a pending race timer must never reveal/advance into an ended room.
      if (session.race) clearRaceTimers(session.race);
      // v9: same rule for the tournament settle timer.
      if (session.tourney) clearTourneyTimers(session.tourney);
      broadcast(session, { type: 'ended', reason: 'timeout' });
    }
  }
}

// Helper: get time left in seconds
function getTimeLeft(session) {
  if (!session.startedAt || session.status !== 'active') return SESSION_DURATION / 1000;
  return Math.max(0, Math.round((SESSION_DURATION - (Date.now() - session.startedAt)) / 1000));
}

// Periodic auto-end check (every 30 seconds)
setInterval(() => {
  for (const session of sessions.values()) {
    checkAutoEnd(session);
  }
}, 30 * 1000);

// Clean up sessions older than 4 hours
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [code, session] of sessions.entries()) {
    if (session.createdAt < cutoff && session.teachers.size === 0) {
      // v8: kill race timers and close any student race streams still open —
      // a lingering socket in `watchers` would pin the evicted session (and
      // its per-IP SSE slot) in memory forever.
      if (session.race) {
        clearRaceTimers(session.race);
        for (const set of session.race.watchers.values()) {
          for (const res of set) {
            try { res.end(); } catch (_) {}
          }
        }
      }
      // v9: same eviction hygiene for tournament rooms.
      if (session.tourney) {
        clearTourneyTimers(session.tourney);
        for (const set of session.tourney.watchers.values()) {
          for (const res of set) {
            try { res.end(); } catch (_) {}
          }
        }
      }
      sessions.delete(code);
    }
  }
}, 30 * 60 * 1000);

// Evict stale rate-limit buckets so the map doesn't grow with unique IPs.
setInterval(() => {
  const windowStart = Date.now() - 60_000;
  for (const [ip, hits] of rlHits.entries()) {
    const recent = hits.filter((t) => t > windowStart);
    if (recent.length === 0) rlHits.delete(ip);
    else rlHits.set(ip, recent);
  }
}, 5 * 60 * 1000);

// ─── Routes ───────────────────────────────────────────────────────────────

// Teacher creates a session → gets a code (status: waiting).
// Body: { title, token?, studentPath? } — old consoles send only title and
// still work while the gate is open. (quizId from older v2 consoles is
// ignored; v5 consoles send studentPath for the universal /join page.)
app.post('/session', (req, res) => {
  const auth = parseQuizToken(req.body.token);
  if (!auth.ok) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // One live room per teacher (only when the auth gate gives us a verified
  // uid). The linear scan is fine: creates are rare and the map is small
  // relative to a single-core box's real limits.
  if (auth.uid) {
    for (const existing of sessions.values()) {
      if (existing.ownerUid !== auth.uid) continue;
      checkAutoEnd(existing);
      if (existing.status !== 'ended') {
        return res.status(409).json({
          error: 'active_room',
          code: existing.code,
          title: existing.title,
          status: existing.status
        });
      }
    }
  }

  if (sessions.size >= MAX_SESSIONS) {
    return res.status(503).json({ error: 'Server full' });
  }

  // v9: race and tournament are mutually exclusive room modes — a body
  // carrying both is a confused console, refused before either sanitizer
  // gets to pick a winner (spec §2.2).
  if (req.body.race != null && req.body.tourney != null) {
    return res.status(400).json({ error: 'mode_conflict' });
  }

  // v8: optional race config. Malformed SHAPE → not stored (self-paced room;
  // the console detects the missing race ack below). Cap violations → loud
  // 400s, never a silent downgrade (spec §2.2).
  const raceResult = sanitizeRaceConfig(req.body.race);
  if (raceResult.error) {
    return res.status(400).json({ error: raceResult.error });
  }

  // v9: optional tournament config — same shape/cap philosophy as race.
  const tourneyResult = sanitizeTourneyConfig(req.body.tourney);
  if (tourneyResult.error) {
    return res.status(400).json({ error: tourneyResult.error });
  }

  const code = generateCode();
  if (!code) return res.status(503).json({ error: 'Server full' });

  const hostSecret = generateHostSecret();
  sessions.set(code, {
    code,
    hostSecret,
    ownerUid: auth.uid,
    createdAt: Date.now(),
    title: String(req.body.title || 'Math Quiz').slice(0, 200),
    studentPath: sanitizeStudentPath(req.body.studentPath),
    // v7: which student aids the teacher allows; null = console predates the
    // field (clients treat that as "everything allowed").
    features: cleanFeatures(req.body.features),
    status: 'waiting',
    startedAt: null,
    students: new Map(),
    kicked: new Set(),
    teachers: new Set(),
    // v8: race rooms carry the whole lockstep state machine; absent for
    // self-paced rooms so every existing code path sees the exact v7 shape.
    ...(raceResult.race ? { race: newRaceState(raceResult.race) } : {}),
    // v9: tournament rooms carry the teacher-paced duel state machine.
    ...(tourneyResult.tourney ? { tourney: newTourneyState(tourneyResult.tourney) } : {})
  });
  // hostSecret goes ONLY to the creator here; students never receive it.
  // The race ack is load-bearing: the console REQUIRES race.qCount to equal
  // the question count it sent — a v7 server (which ignores the field) omits
  // it and the console fails room creation loudly instead of opening a
  // self-paced room behind a race board (spec §1). The v9 tourney ack works
  // the same way: the console requires tourney.rounds to equal the round
  // count it sent (spec §2.2).
  res.json({
    code,
    hostSecret,
    ...(raceResult.race ? { race: { qCount: raceResult.race.questions.length } } : {}),
    ...(tourneyResult.tourney
      ? { tourney: { rounds: tourneyResult.tourney.rounds.length } }
      : {})
  });
});

// Teacher starts the quiz (waiting → active)
app.post('/start', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!verifyHostSecret(session, req.body.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Replayed /start on an already-active room is a no-op. Without this guard
  // a stale console tab's start button resets race/tourney phase to 'idle'
  // mid-round — in a tournament that silently loses the live round (the
  // armed settle timer bails on the phase check and the scores never fold).
  if (session.status === 'active') {
    return res.json({ ok: true, startedAt: session.startedAt });
  }

  session.status = 'active';
  session.startedAt = Date.now();
  // v8: a race room starts in the 'idle' race phase — the teacher opens the
  // first question explicitly via POST /race/advance {action:'next'}.
  if (session.race) session.race.phase = 'idle';
  // v9: a tournament room starts in the 'idle' tourney phase (lobby → the
  // board shows the draw button; POST /tourney/advance {action:'pair'} next).
  if (session.tourney) session.tourney.phase = 'idle';

  // Broadcast to all teacher SSE streams
  broadcast(session, { type: 'started', startedAt: session.startedAt });

  res.json({ ok: true, startedAt: session.startedAt });
});

// Teacher ends the quiz (active → ended). Accepts the room's hostSecret OR a
// verified owner token — the latter is how a console resolves an active_room
// 409 for a room whose hostSecret lives in another tab or device.
app.post('/end', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (
    !verifyHostSecret(session, req.body.hostSecret) &&
    !isOwnerToken(session, req.body.token)
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  session.status = 'ended';
  // v8: a pending race timer must never reveal/advance into an ended room.
  if (session.race) clearRaceTimers(session.race);
  // v9: a pending tournament settle must never fire into an ended room.
  if (session.tourney) clearTourneyTimers(session.tourney);

  // Broadcast to all teacher SSE streams
  broadcast(session, { type: 'ended', reason: 'teacher' });

  res.json({ ok: true });
});

// Teacher removes one student from the room. The record disappears from the
// board at once (broadcast below); the student's page learns on its next poll
// or heartbeat. Passive heartbeats can't re-register a kicked studentId, but
// an explicit re-join (/submit with joining:true) is allowed by design — the
// teacher can always kick again.
app.post('/kick', (req, res) => {
  const { code, studentId } = req.body;
  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!verifyHostSecret(session, req.body.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!session.kicked) session.kicked = new Set(); // pre-v6 session in memory
  session.kicked.add(String(studentId));
  const removed = session.students.delete(studentId);
  broadcast(session, { type: 'kicked', studentId });
  // A mid-duel kick must reach the duel partner's phone: the record is gone,
  // so no later heartbeat/sweep will ever relay for this id again.
  // relayTourneyPresence reports a missing record as connected:false.
  if (session.tourney) relayTourneyPresence(session, String(studentId));

  res.json({ ok: true, removed });
});

// Student polls session status (used while waiting + to check if ended).
// With a studentId the response also carries the kicked verdict — lobby
// students only ever poll here, so it's their one channel to learn it.
app.get('/status', (req, res) => {
  const { code, studentId } = req.query;
  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });

  checkAutoEnd(session);

  const kicked = Boolean(
    studentId && session.kicked && session.kicked.has(String(studentId)),
  );
  res.json({
    status: session.status,
    timeLeft: getTimeLeft(session),
    ...(session.features ? { features: session.features } : {}),
    // v8: the race summary is the poll-level resync channel (spec §2.7) —
    // it's also how the student page learns the room is a race at all.
    ...(session.race ? { race: raceSummary(session, studentId) } : {}),
    // v9: same role for the tournament summary (spec §2.8).
    ...(session.tourney ? { tourney: tourneySummary(session) } : {}),
    ...(kicked ? { kicked: true } : {})
  });
});

// Universal join: the site's /join page turns a room code the teacher wrote
// on the board into this room's student link. Public by design — it reveals
// no more than the QR already hands every student in the class. The code is
// normalized here so phones may lowercase or pad it freely.
app.get('/resolve', (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });

  checkAutoEnd(session);

  res.json({
    status: session.status,
    title: session.title,
    // null for rooms opened by pre-v5 consoles — the join page tells those
    // students to use the teacher's QR instead.
    studentPath: session.studentPath || null,
    // v8: lets the /join page show that this room is a race (no UI required).
    ...(session.race ? { race: true } : {}),
    // v9: same flag for tournament rooms (spec §2.8).
    ...(session.tourney ? { tourney: true } : {})
  });
});

// Student submits score (heartbeat + on every answer / focus change).
// joining:true marks a deliberate (re-)join, which clears a kick verdict and
// resets the sticky finished flag for a fresh run.
app.post('/submit', (req, res) => {
  const { code, studentId, name, score, total, finished,
          focused, tabSwitches, awaySeconds, answers } = req.body;
  const joining = req.body.joining === true;

  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });

  checkAutoEnd(session);

  if (session.kicked && session.kicked.has(String(studentId))) {
    if (joining) {
      session.kicked.delete(String(studentId));
    } else {
      // A kicked student's passive heartbeat must not re-register them.
      return res.json({
        ok: false,
        kicked: true,
        status: session.status,
        timeLeft: getTimeLeft(session),
        ...(session.features ? { features: session.features } : {}),
        ...(session.race ? { race: raceSummary(session, studentId) } : {}),
        ...(session.tourney ? { tourney: tourneySummary(session) } : {})
      });
    }
  }

  const prev = session.students.get(studentId);
  if (!prev && session.students.size >= MAX_STUDENTS_PER_SESSION) {
    return res.status(429).json({ error: 'Session full' });
  }

  // v8: in race rooms score/total/answers are SERVER-owned — doReveal()
  // writes the graded results into these fields, so client-sent values are
  // ignored (a tampered phone can't inflate the board). v9: tournament rooms
  // are server-owned the same way (settleTourneyRound writes them). Everything
  // else — heartbeat, presence, away clock, focus, sticky finished,
  // kick/re-join — behaves exactly as v7 in every mode.
  const isRace = Boolean(session.race);
  const serverOwned = isRace || Boolean(session.tourney);
  const student = {
    name:        String(name || 'Student').slice(0, MAX_NAME_LENGTH),
    score:       serverOwned ? (prev ? prev.score : 0) : cleanNumber(score, MAX_SCORE_VALUE),
    total:       serverOwned ? (prev ? prev.total : 0) : cleanNumber(total, MAX_SCORE_VALUE),
    // Sticky: once a student reported finished, a later heartbeat (which
    // defaults the field to false) can't silently un-finish them.
    finished:    Boolean(finished) || Boolean(prev && !joining && prev.finished),
    focused:     focused     !== undefined ? focused     : true,
    tabSwitches: cleanNumber(tabSwitches, MAX_TELEMETRY_VALUE),
    awaySeconds: cleanNumber(awaySeconds, MAX_TELEMETRY_VALUE),
    // Any real submit proves the page is open — clears a leave/staleness mark.
    connected:   true,
    // Keep the last known map when a heartbeat omits/garbles the field, so a
    // brief bad submit can't wipe detail the console already relies on.
    answers:     serverOwned
      ? (prev ? prev.answers : undefined)
      : cleanAnswers(answers) || (prev ? prev.answers : undefined),
    updatedAt:   Date.now()
  };

  session.students.set(studentId, student);

  if (session.tourney) {
    // v9: a first roster contact AFTER the first draw is a latecomer — they
    // join the losers pool at the next draw and can never become champion.
    if (!prev && session.tourney.round >= 1) {
      session.tourney.late.add(String(studentId));
    }
    // Cache the name in totals so a later kick (which deletes the record)
    // doesn't blank them on the bracket or the standings.
    ensureTourneyTotals(session.tourney, String(studentId), student.name);
    // A presence change mid-duel is relayed to the duel partner(s) — §2.5.
    // The awaySeconds step matches the board broadcast below (≥15s) so the
    // partner's ticking away-clock stays in sync without extra chatter.
    if (
      prev &&
      (prev.connected !== student.connected ||
        prev.focused !== student.focused ||
        Math.abs(student.awaySeconds - prev.awaySeconds) >= 15)
    ) {
      relayTourneyPresence(session, String(studentId));
    }
  }

  // Broadcast only when something the teacher can see actually changed —
  // idle heartbeats (lobby waits, thinking time) produce no SSE traffic.
  // awaySeconds ticks are relayed in ≥15s steps so away timers still move.
  const changed = !prev
    || prev.score !== student.score
    || prev.total !== student.total
    || prev.finished !== student.finished
    || prev.focused !== student.focused
    || prev.connected !== student.connected
    || prev.tabSwitches !== student.tabSwitches
    || Math.abs(student.awaySeconds - prev.awaySeconds) >= 15;

  if (changed) {
    broadcast(session, {
      type: 'update',
      studentId,
      ...student
    });
  }

  res.json({
    ok: true,
    status: session.status,
    timeLeft: getTimeLeft(session),
    ...(session.features ? { features: session.features } : {}),
    // v8: heartbeat responses double as the race resync channel (spec §2.7) —
    // screen lock kills the SSE stream, the next heartbeat re-anchors the UI.
    ...(session.race ? { race: raceSummary(session, studentId) } : {}),
    // v9: and as the tournament resync channel (spec §2.8).
    ...(session.tourney ? { tourney: tourneySummary(session) } : {})
  });
});

// Student's parting beacon (navigator.sendBeacon on pagehide). text/plain on
// purpose: a cross-origin application/json beacon needs a CORS preflight that
// sendBeacon can't perform, while text/plain is a "simple request" that always
// goes through. The beacon never reads the response, so CORS visibility is
// irrelevant. Always answers 200 — a leave for a vanished room means nothing.
app.post('/leave', express.text({ type: '*/*' }), (req, res) => {
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { data = null; }
  }
  const code = data && data.code;
  const studentId = data && data.studentId;
  if (code && studentId) {
    const session = sessions.get(code);
    const student = session && session.students.get(studentId);
    if (student && student.connected !== false) {
      student.connected = false;
      student.updatedAt = Date.now();
      broadcast(session, { type: 'update', studentId, ...student });
      // v9: a duel partner sees the "left" badge immediately, not on the
      // next heartbeat cycle.
      if (session.tourney) relayTourneyPresence(session, String(studentId));
    }
  }
  res.json({ ok: true });
});

// Presence sweep: a student in an ACTIVE room heartbeats /submit every 15s,
// so >45s of silence means the page is gone (closed tab, crashed browser,
// dead battery) even when the pagehide beacon never fired. Waiting rooms are
// exempt — lobby students poll /status and legitimately never /submit.
const PRESENCE_STALE_MS = 45 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.status !== 'active') continue;
    for (const [studentId, student] of session.students.entries()) {
      if (student.connected !== false && now - student.updatedAt > PRESENCE_STALE_MS) {
        student.connected = false;
        broadcast(session, { type: 'update', studentId, ...student });
        // v9: the sweep is the third way presence can change mid-duel.
        if (session.tourney) relayTourneyPresence(session, String(studentId));
      }
    }
  }
}, 15 * 1000);

// Teacher opens SSE stream → receives live updates
app.get('/live', (req, res) => {
  const { code } = req.query;
  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // The live stream carries every student's name, score and anti-cheat
  // telemetry — teacher-only. hostSecret rides the query string because
  // EventSource can't set headers.
  if (!verifyHostSecret(session, req.query.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = req.clientIp || clientIpOf(req);
  const openForIp = sseByIp.get(ip) || 0;
  if (openForIp >= MAX_SSE_PER_IP) {
    return res.status(429).json({ error: 'Too many live streams' });
  }
  sseByIp.set(ip, openForIp + 1);

  checkAutoEnd(session);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send full current snapshot immediately (includes session status)
  const snapshot = Array.from(session.students.entries()).map(([id, s]) => ({
    studentId: id, ...s
  }));
  res.write(`data: ${JSON.stringify({
    type: 'snapshot',
    students: snapshot,
    status: session.status,
    timeLeft: getTimeLeft(session),
    // v8: mid-race console reload — the snapshot carries the full teacher
    // race view (phase, timing, and the current dist+board when revealed) so
    // the board is restored exactly. Absent for self-paced rooms; old
    // consoles ignore unknown snapshot fields safely.
    ...(session.race ? { race: teacherRaceState(session) } : {}),
    // v9: mid-tournament console reload — phase, clocks and the full bracket.
    ...(session.tourney ? { tourney: teacherTourneyState(session) } : {})
  })}\n\n`);

  // Keep-alive ping every 25 seconds
  const ping = setInterval(() => {
    try {
      checkAutoEnd(session);
      res.write(`: ping\n\n`);
    } catch (_) { clearInterval(ping); }
  }, 25000);

  session.teachers.add(res);

  req.on('close', () => {
    session.teachers.delete(res);
    clearInterval(ping);
    const n = (sseByIp.get(ip) || 1) - 1;
    if (n <= 0) sseByIp.delete(ip);
    else sseByIp.set(ip, n);
  });
});

// ─── Race mode (v8) — routes ────────────────────────────────────────────────
// All three live under the single `/race` prefix ON PURPOSE: the prod nginx
// allowlist needs exactly ONE new entry for the whole feature (spec §2.1).

// Student race stream. Individualized SSE: the connect snapshot and every
// reveal/podium event are computed PER student — a phone's stream never
// carries classmates' picks or scores, only its own result + shared phase
// timing. Public like /status (knowing the code + a studentId reveals no
// more than the phone already shows its holder).
app.get('/race/stream', (req, res) => {
  const code = String(req.query.code || '');
  const studentId = String(req.query.studentId || '');
  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });
  if (!session.race) return res.status(400).json({ error: 'not_race' });

  checkAutoEnd(session);
  const race = session.race;

  // Own per-IP counter, SEPARATE from /live's teacher cap: every student
  // phone holds one of these, and one school NAT fronts several classes.
  const ip = req.clientIp || clientIpOf(req);
  const openForIp = raceSseByIp.get(ip) || 0;
  if (openForIp >= MAX_RACE_SSE_PER_IP) {
    return res.status(429).json({ error: 'Too many race streams' });
  }
  // Per-room cap mirrors the /submit roster cap: no more distinct streaming
  // students than the room can hold students (reconnects of a known student
  // are always allowed — that's the screen-lock recovery path).
  if (!race.watchers.has(studentId) && race.watchers.size >= MAX_STUDENTS_PER_SESSION) {
    return res.status(429).json({ error: 'Session full' });
  }
  raceSseByIp.set(ip, openForIp + 1);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Individualized connect snapshot — also THE resync path after a dropped
  // stream: reopening restores the exact phase, own answered flag and totals.
  res.write(`data: ${JSON.stringify(buildStudentState(session, studentId))}\n\n`);

  // Keep-alive ping every 25 seconds (same cadence as /live)
  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (_) { clearInterval(ping); }
  }, 25000);

  let set = race.watchers.get(studentId);
  if (!set) {
    set = new Set();
    race.watchers.set(studentId, set);
  }
  set.add(res);

  req.on('close', () => {
    set.delete(res);
    if (set.size === 0) race.watchers.delete(studentId);
    clearInterval(ping);
    const n = (raceSseByIp.get(ip) || 1) - 1;
    if (n <= 0) raceSseByIp.delete(ip);
    else raceSseByIp.set(ip, n);
  });
});

// Student answers the open race question. Graded AT ACCEPT (a replayed
// request can't be re-scored against a different clock); the verdict stays
// on the server until reveal — the response deliberately never echoes it.
app.post('/race/answer', (req, res) => {
  const { code } = req.body;
  const studentId = req.body.studentId != null ? String(req.body.studentId) : '';
  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });
  if (!session.race) return res.status(400).json({ error: 'not_race' });

  checkAutoEnd(session);
  const race = session.race;

  // Kicked students can't score points passively — same rule as /submit
  // heartbeats (an explicit re-join via /submit is their way back in).
  if (session.kicked && session.kicked.has(studentId)) {
    return res.json({ ok: false, kicked: true });
  }

  // Only students actually in the room may score. /submit (joining:true) is
  // the front door and enforces MAX_STUDENTS_PER_SESSION — an id the roster
  // has never seen must not mint totals rows or move the answered count
  // (phantom students would also grow race memory without bound).
  if (!session.students.has(studentId)) {
    return res.status(404).json({ error: 'not_joined' });
  }

  // Accept window: right question, 'question' phase, openAt..deadline+grace.
  // A stale answer (a page lagging one transition behind, or landing just
  // after the reveal fired) gets a 409 that tells the phone where the room
  // really is — harmless to retry-happy clients.
  const qIndex = Number(req.body.qIndex);
  const now = Date.now();
  if (
    session.status !== 'active' ||
    race.phase !== 'question' ||
    !Number.isInteger(qIndex) ||
    qIndex !== race.qIndex ||
    now < race.openAt ||
    now > race.deadline + RACE_ANSWER_GRACE_MS
  ) {
    return res.status(409).json({ error: 'bad_phase', phase: race.phase, qIndex: race.qIndex });
  }

  const ansMap = race.answers[race.qIndex];
  // One answer per student per question — the FIRST wins. A duplicate
  // (double-tap, retry after a flaky response) is acknowledged, not re-graded.
  if (ansMap.has(studentId)) return res.json({ ok: true, already: true });

  const q = race.questions[race.qIndex];
  const ms = Math.min(Math.max(now - race.openAt, 0), q.timeSec * 1000);
  const rec = { at: now, ms, ok: false, base: 0, bonus: 0, points: 0 };
  if (q.type === 'mcq') {
    const pick = Number(req.body.pick);
    if (!Number.isInteger(pick) || pick < 0 || pick >= q.optionCount) {
      return res.status(400).json({ error: 'bad_answer' });
    }
    rec.pick = pick;
    rec.ok = pick === q.correct;
  } else {
    const given = typeof req.body.given === 'string'
      ? req.body.given.slice(0, MAX_RACE_ACCEPT_LENGTH)
      : '';
    rec.given = given;
    rec.ok = checkInputAnswerServer(given, q.accept);
  }
  // Speed points are fixed now (§2.6: 500 base + up to 500 for speed); the
  // history-dependent streak bonus is settled in doReveal().
  if (rec.ok) {
    rec.base = Math.round(500 + 500 * Math.max(0, 1 - ms / (q.timeSec * 1000)));
  }
  ansMap.set(studentId, rec);

  const existing = session.students.get(studentId);
  ensureRaceTotals(race, studentId, existing ? existing.name : undefined);
  // An answer proves the page is open — refresh presence like a heartbeat
  // would, so the 45s sweep can't mark an actively racing student "left".
  if (existing) {
    existing.updatedAt = now;
    if (existing.connected === false) {
      existing.connected = true;
      broadcast(session, { type: 'update', studentId, ...existing });
    }
  }

  const answeredCount = raceAnsweredCount(session);
  const activeCount = raceActiveCount(session);
  broadcast(session, { type: 'race_answer', qIndex: race.qIndex, answeredCount, activeCount });

  // All-answered early close: don't make the class stare at a dead countdown.
  // 700ms feels instant on the board but still absorbs a straggler answer
  // already on the wire. Replaces the deadline timer — doReveal is idempotent
  // anyway, so even a missed clear here couldn't double-reveal.
  let allAnswered = activeCount > 0;
  for (const [sid, s] of session.students.entries()) {
    if (s.connected === false) continue;
    if (!ansMap.has(String(sid))) {
      allAnswered = false;
      break;
    }
  }
  if (allAnswered) {
    if (race.closeTimer) clearTimeout(race.closeTimer);
    race.closeTimer = setTimeout(() => {
      race.closeTimer = null;
      doReveal(session);
    }, RACE_EARLY_CLOSE_MS);
  }

  // NEVER echo rec.ok — correctness stays secret until the reveal phase.
  res.json({ ok: true });
});

// Teacher drives the race state machine. hostSecret-gated like /start; every
// action is validated against the CURRENT phase and an illegal one gets a 409
// so a double-clicked button (or an auto-timer racing a click) is harmless —
// the console silently drops bad_phase responses (spec §2.4).
app.post('/race/advance', (req, res) => {
  const { code, action } = req.body;
  if (!code || !action) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!session.race) return res.status(400).json({ error: 'not_race' });
  if (!verifyHostSecret(session, req.body.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  checkAutoEnd(session);
  const race = session.race;
  const badPhase = () =>
    res.status(409).json({ error: 'bad_phase', phase: race.phase, qIndex: race.qIndex });

  // `auto` is a toggle, not a transition — legal in ANY phase (including an
  // ended room, where it's a no-op setting). Turning it on mid-reveal arms
  // the timer as if the reveal had just happened; turning it off disarms.
  if (action === 'auto') {
    race.auto = Boolean(req.body.value);
    if (race.auto && race.phase === 'reveal' && session.status === 'active') {
      armAutoTimer(session);
    }
    if (!race.auto && race.autoTimer) {
      clearTimeout(race.autoTimer);
      race.autoTimer = null;
    }
    return res.json({ ok: true, auto: race.auto, phase: race.phase, qIndex: race.qIndex });
  }

  // Every real transition needs a live room — a waiting or ended room has no
  // legal race moves, and 409 (not 403/404) keeps the console's handling
  // uniform: drop and resync.
  if (session.status !== 'active') return badPhase();

  switch (action) {
    case 'next':
      if (race.phase !== 'idle' && race.phase !== 'reveal' && race.phase !== 'explain') {
        return badPhase();
      }
      if (race.qIndex + 1 < race.questions.length) {
        openQuestion(session, race.qIndex + 1);
      } else if (race.phase === 'reveal' || race.phase === 'explain') {
        goPodium(session); // past the last question, «Келесі» means podium
      } else {
        return badPhase(); // idle with nothing to open (can't happen: ≥1 q)
      }
      break;
    case 'reveal':
      if (race.phase !== 'question') return badPhase();
      doReveal(session); // teacher's early-close button
      break;
    case 'explain': {
      if (race.phase !== 'reveal') return badPhase();
      // No solution content → no explain phase (console hides the button;
      // this guard covers a stale console).
      if (!raceHasExplainContent(race.questions[race.qIndex])) return badPhase();
      doExplain(session);
      break;
    }
    case 'podium':
      if (
        (race.phase !== 'reveal' && race.phase !== 'explain') ||
        race.qIndex + 1 < race.questions.length
      ) {
        return badPhase(); // podium only after the LAST question's reveal
      }
      goPodium(session);
      break;
    default:
      return res.status(400).json({ error: 'bad_action' });
  }

  res.json({ ok: true, phase: race.phase, qIndex: race.qIndex });
});

// ─── Tournament mode (v9) — routes ──────────────────────────────────────────
// All three live under the single `/tourney` prefix ON PURPOSE: the prod
// nginx allowlist needs exactly ONE new entry for the whole feature
// (spec §2.1; helper: server/add-tourney-to-nginx.sh).

// Student tournament stream. Individualized SSE like /race/stream: the
// connect snapshot and every pairing/result/podium event are computed PER
// student — a phone's stream carries its own duel only, never the whole
// bracket. Public like /status (code + studentId reveal no more than the
// phone already shows its holder).
app.get('/tourney/stream', (req, res) => {
  const code = String(req.query.code || '');
  const studentId = String(req.query.studentId || '');
  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });
  if (!session.tourney) return res.status(400).json({ error: 'not_tourney' });

  checkAutoEnd(session);
  const tourney = session.tourney;

  // Own per-IP counter, SEPARATE from the /live and /race caps: every duel
  // phone holds one of these, and one school NAT fronts several classes.
  const ip = req.clientIp || clientIpOf(req);
  const openForIp = tourneySseByIp.get(ip) || 0;
  if (openForIp >= MAX_TOURNEY_SSE_PER_IP) {
    return res.status(429).json({ error: 'Too many tourney streams' });
  }
  // Per-room cap mirrors the /submit roster cap; reconnects of a known
  // student are always allowed — that's the screen-lock recovery path.
  if (!tourney.watchers.has(studentId) && tourney.watchers.size >= MAX_STUDENTS_PER_SESSION) {
    return res.status(429).json({ error: 'Session full' });
  }
  tourneySseByIp.set(ip, openForIp + 1);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Individualized connect snapshot — also THE resync path after a dropped
  // stream: reopening restores the exact phase, seq position and lockout.
  res.write(`data: ${JSON.stringify(buildTourneyStudentState(session, studentId))}\n\n`);

  // Keep-alive ping every 25 seconds (same cadence as /live and /race/stream)
  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (_) { clearInterval(ping); }
  }, 25000);

  let set = tourney.watchers.get(studentId);
  if (!set) {
    set = new Set();
    tourney.watchers.set(studentId, set);
  }
  set.add(res);

  req.on('close', () => {
    set.delete(res);
    if (set.size === 0) tourney.watchers.delete(studentId);
    clearInterval(ping);
    const n = (tourneySseByIp.get(ip) || 1) - 1;
    if (n <= 0) tourneySseByIp.delete(ip);
    else tourneySseByIp.set(ip, n);
  });
});

// Student answers the current duel problem. Graded AT ACCEPT with the exact
// port; the verdict IS echoed here (unlike race) — a duel shows right/wrong
// instantly, that's the game. Answers land strictly in seq order, and every
// accepted answer settles its seq permanently: a replay or skip can only 409.
app.post('/tourney/answer', (req, res) => {
  const { code } = req.body;
  const studentId = req.body.studentId != null ? String(req.body.studentId) : '';
  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });
  if (!session.tourney) return res.status(400).json({ error: 'not_tourney' });

  checkAutoEnd(session);
  const tourney = session.tourney;

  // Kicked students can't score — same rule as /race/answer (an explicit
  // re-join via /submit is their way back in, as a latecomer).
  if (session.kicked && session.kicked.has(studentId)) {
    return res.json({ ok: false, kicked: true });
  }

  // Only students actually in the room may score (spec §2.5: unknown → 404).
  // /submit (joining:true) is the front door and enforces the roster cap.
  if (!session.students.has(studentId)) {
    return res.status(404).json({ error: 'not_joined' });
  }

  // Accept window (§2.5): live room, duel phase, right round, openAt..
  // deadline+grace. A stale answer gets a 409 that tells the phone where the
  // room really is — harmless to retry-happy clients.
  const round = Number(req.body.round);
  const now = Date.now();
  if (
    session.status !== 'active' ||
    tourney.phase !== 'duel' ||
    !Number.isInteger(round) ||
    round !== tourney.round ||
    now < tourney.openAt ||
    now > tourney.deadline + TOURNEY_ANSWER_GRACE_MS
  ) {
    return res.status(409).json({ error: 'bad_phase', phase: tourney.phase, round: tourney.round });
  }

  let sc = tourney.scores.get(studentId);
  if (!sc) {
    sc = { correct: 0, wrong: 0, seqDone: 0, lastCorrectAt: null, lockedUntil: 0 };
    tourney.scores.set(studentId, sc);
  }

  // Strict sequence order: seq must be exactly the next one, and the round's
  // key list bounds how many there are. `expect` lets a desynced phone jump
  // straight to the right problem instead of guessing.
  const answers = tourney.rounds[tourney.round - 1].answers;
  const seq = Number(req.body.seq);
  if (!Number.isInteger(seq) || seq !== sc.seqDone + 1 || seq > answers.length) {
    return res.status(409).json({ error: 'bad_seq', expect: sc.seqDone + 1 });
  }

  // Wrong-answer freeze: the keypad is locked out client-side; this is the
  // server-side truth a tampered phone can't skip.
  if (now < sc.lockedUntil) {
    return res.status(429).json({ error: 'locked', remainMs: sc.lockedUntil - now });
  }

  const given = typeof req.body.given === 'string'
    ? req.body.given.slice(0, MAX_TOURNEY_GIVEN_LENGTH)
    : '';
  const right = gradeTourneyAnswer(given, answers[seq - 1]);
  sc.seqDone += 1; // every accepted answer settles its seq permanently
  if (right) {
    sc.correct += 1;
    sc.lastCorrectAt = now; // the settle tiebreak: earlier finisher wins
  } else {
    sc.wrong += 1;
    sc.lockedUntil = now + tourney.lockoutMs;
  }

  // An answer proves the page is open — refresh presence like a heartbeat
  // would, so the 45s sweep can't mark an actively dueling student "left".
  const existing = session.students.get(studentId);
  ensureTourneyTotals(tourney, studentId, existing ? existing.name : undefined);
  if (existing) {
    existing.updatedAt = now;
    if (existing.connected === false) {
      existing.connected = true;
      broadcast(session, { type: 'update', studentId, ...existing });
      relayTourneyPresence(session, studentId);
    }
  }

  // Side effects (§2.5): the duel partner(s) see the score move at once, and
  // the teacher stream maps the tick to the right pair card.
  const partners = tourneyPartners(tourney.plan, studentId);
  if (partners.length > 0) {
    const tick = {
      type: 'tick',
      opponents: [{ id: studentId, name: tourneyNameOf(session, studentId), correct: sc.correct }],
    };
    for (const pid of partners) sendTourneyEvent(session, pid, tick);
  }
  broadcast(session, {
    type: 'tourney_score',
    round: tourney.round,
    studentId,
    correct: sc.correct,
    wrong: sc.wrong,
  });

  res.json({
    ok: true,
    correct: sc.correct,
    wrong: sc.wrong,
    right,
    lockRemainMs: right ? 0 : tourney.lockoutMs,
  });
});

// Teacher paces the tournament: draw (жеребе) → start round → review → next
// draw. hostSecret-gated like /race/advance; an illegal action for the phase
// gets a 409 the console silently drops (double-click safe). There is no
// manual round close — the clock always runs out (settle is timer-driven).
app.post('/tourney/advance', (req, res) => {
  const { code, action } = req.body;
  if (!code || !action) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!session.tourney) return res.status(400).json({ error: 'not_tourney' });
  if (!verifyHostSecret(session, req.body.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  checkAutoEnd(session);
  const tourney = session.tourney;
  const badPhase = () =>
    res.status(409).json({ error: 'bad_phase', phase: tourney.phase, round: tourney.round });

  // Every transition needs a live room — a waiting or ended room has no
  // legal tournament moves (same uniform-handling reasoning as race).
  if (session.status !== 'active') return badPhase();

  switch (action) {
    case 'pair':
      // From idle (first draw) or result — but never once a champion stands,
      // and never past the pre-generated answer keys (§2.4).
      if (tourney.phase !== 'idle' && tourney.phase !== 'result') return badPhase();
      if (tourney.phase === 'result' && tourney.champion != null) return badPhase();
      if (tourney.round + 1 > tourney.rounds.length) {
        return res.status(409).json({
          error: 'no_rounds_left',
          phase: tourney.phase,
          round: tourney.round,
        });
      }
      // The first draw needs at least one real pair. Kicked records are
      // already deleted from the map, so its size IS the eligible count.
      if (tourney.phase === 'idle' && session.students.size < 2) {
        return res.status(409).json({ error: 'too_few' });
      }
      doTourneyPair(session);
      break;
    case 'start':
      if (tourney.phase !== 'pairing') return badPhase();
      doTourneyStart(session);
      break;
    case 'podium':
      // Only from result, and only when the bracket is actually over: a
      // champion stands OR the pre-generated rounds ran out (§2.4).
      if (
        tourney.phase !== 'result' ||
        (tourney.champion == null && tourney.round < tourney.rounds.length)
      ) {
        return badPhase();
      }
      doTourneyPodium(session);
      break;
    default:
      return res.status(400).json({ error: 'bad_action' });
  }

  res.json({ ok: true, phase: tourney.phase, round: tourney.round });
});

// Quick health check. Public response is liveness only — `version` is what the
// deploy step verifies. The live counts and which security gates are on are a
// reconnaissance aid (they tell an attacker exactly what's off), so they're
// disclosed only to a request carrying the operator key. With LIVE_STATUS_KEY
// unset the detail is unavailable to everyone, which is the safe default.
app.get('/health', (req, res) => {
  const body = { ok: true, version: 9 };
  const statusKey = process.env.LIVE_STATUS_KEY;
  if (statusKey && req.query.key === statusKey) {
    body.sessions = sessions.size;
    body.students = Array.from(sessions.values()).reduce((n, s) => n + s.students.size, 0);
    body.authGate = AUTH_ENFORCED;
    body.hostSecretGate = HOST_SECRET_ENFORCED;
    body.corsLocked = CORS_LOCKED;
  }
  res.json(body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MathSabaq server v9 running on port ${PORT}`);
  console.log(`   class history: not saved HERE — the teacher console saves to Supabase`);
  console.log(`   race streams:       ${MAX_RACE_SSE_PER_IP}/IP (LIVE_MAX_RACE_SSE_PER_IP)`);
  console.log(`   tourney streams:    ${MAX_TOURNEY_SSE_PER_IP}/IP (LIVE_MAX_TOURNEY_SSE_PER_IP)`);
  console.log(`   /session auth gate: ${AUTH_ENFORCED ? 'ENFORCED' : 'OPEN — set QUIZ_TOKEN_SECRET to enforce'}`);
  console.log(`   host-secret gate:   ${HOST_SECRET_ENFORCED ? 'ENFORCED' : 'DORMANT — set LIVE_HOST_SECRET_ENFORCED to enforce'}`);
  console.log(`   CORS:               ${CORS_LOCKED ? `locked to ${ALLOWED_ORIGINS.join(', ')}` : 'OPEN — set LIVE_ALLOWED_ORIGINS to lock'}`);
  console.log(`   rate limit:         ${RATE_LIMIT_PER_MIN ? `${RATE_LIMIT_PER_MIN}/min per IP, ${MAX_SSE_PER_IP} live streams/IP` : 'disabled'}`);
});
