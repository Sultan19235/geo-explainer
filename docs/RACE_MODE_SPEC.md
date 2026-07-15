# Race Mode (Жарыс) — Design Spec

Kahoot-style synchronous quiz mode on top of the existing live-quiz stack.
This document is the protocol contract between `server/server.js` (v8), the
student page (`/play/[quizId]`), and the teacher console
(`/play/[quizId]/host`). Every message shape here is normative.

Decided with the product owner (2026-07-15):

- Room mode chosen at creation: **self-paced** (existing, unchanged) or
  **race**. Race = server-owned lockstep state machine.
- **Teacher-controlled advance** with an optional **auto-advance** mode.
- Question renders on the **student's phone** (full question); the board shows
  countdown / answered count / reveal distribution / leaderboard / podium.
- **Explain phase** (Түсіндіру) after reveal, teacher-triggered: worked
  solution in the lesson step format on the board (with teacher pen) AND on
  phones; hints/formulas collapsibles stay visible there.
- Scoring is **server-side**: speed points + streak bonus.
- **Generator quizzes and graph-quadratic questions are excluded** — race
  needs a fixed list of `mcq`/`input` questions (graph questions structurally
  leak their answer: correct is always index 0).

## 1. Non-negotiable invariants (do not break)

- Self-paced mode must behave **byte-for-byte identically** when no race
  fields are present. All race behavior is additive and gated.
- `parseStatus` (live-client.ts) throws on unknown `status` values → race
  state rides **new optional fields** on existing statuses, never new status
  strings. Session statuses stay `waiting|active|ended` (+`not_found`).
- Load-bearing invariants that must survive untouched: sticky-finished,
  kick/re-join semantics, `/leave` beacon + unmount beacon, 45s presence
  sweep, away-clock + gone-gap reconciliation, teacher resume blob
  (`msq-live-room:*`, 75s `:alive` heartbeat, not_found-is-definitive,
  4h TTL), one-room-per-teacher 409 + owner-token `/end`, result-claims
  dedup, 45-min room auto-end.
- Student localStorage `extra` spreads at the TOP level next to SavedBase
  keys (`studentId,name,correct,wrong,streak,tabSwitches,awaySeconds,wasAway,
  answers,finished,ts`) — new race keys must not collide. We add one:
  `raceAns`.
- Old clients / old server tolerance: a v7 server ignores the `race` field on
  `/session` — the console MUST detect the missing race acknowledgment in the
  response and **fail room creation loudly** (never silently open a
  self-paced room while rendering a race board).
- Rate limits, hostSecret gating and CORS behavior apply to all new
  endpoints. All new teacher actions require the room `hostSecret`.

## 2. Server v8 (`server/server.js`)

### 2.1 New endpoints — all under the single path prefix `/race`

nginx on the prod box needs ONE new allowlist entry for the `/race` prefix.

| Endpoint | Who | What |
|---|---|---|
| `GET /race/stream?code=&studentId=` | student | SSE: race phase events, individualized |
| `POST /race/answer` | student | `{code, studentId, qIndex, pick?, given?}` |
| `POST /race/advance` | teacher | `{code, hostSecret, action, value?}` |

`express.json({ limit: '1mb' })` replaces the default 100kb limit (race
config carries solution content).

### 2.2 Race config (console → server, on `POST /session`)

`/session` body gains an optional `race` object. Server sanitizes it with the
same drop-don't-reject philosophy as `features`; a malformed `race` object →
field not stored → plain self-paced room (console detects via response).

```jsonc
{
  "race": {
    "auto": false,            // auto-advance mode initial value
    "questions": [            // canonical order = teacher's tray order
      {
        "id": "q1",           // pack question id (≤64 chars)
        "type": "mcq",        // "mcq" | "input"
        "timeSec": 30,        // clamped to [5, 600]
        "correct": 2,         // mcq only: canonical option index
        "optionCount": 4,      // mcq only: for distribution buckets, ≤6
        "accept": ["2.5"],    // input only: answer + accept list, ≤20 entries ≤200 chars each
        // explain-phase content, broadcast ONLY at explain (all optional):
        "solutionSteps": [ /* lesson-format steps, see §4; size-capped */ ],
        "solution": ["…"],    // flat fallback (Localized[])
        "solutionGeogebra": ["…"]  // replayed on the student figure at explain
      }
    ]
  }
}
```

Caps: ≤200 questions; per question ≤12 solutionSteps, ≤30 blocks/step,
strings ≤2000 chars, whole race config ≤512KB serialized (oversize → reject
`/session` with 400 `{error:'race_too_large'}` — NOT silent downgrade).
A race config with 0 valid questions → 400 `{error:'race_invalid'}`.

Response when race accepted: `{code, hostSecret, race: {qCount}}` — the
console REQUIRES `race.qCount === questions.length` to proceed.

### 2.3 Session state additions

```js
session.race = {
  auto: false,
  questions: [...],          // sanitized config
  phase: 'idle',             // 'idle'|'question'|'reveal'|'explain'|'podium'
  qIndex: -1,                // current question, -1 before first open
  openAt: null,              // epoch ms: answers accepted from here
  deadline: null,            // epoch ms: phones show this as time-up
  closeTimer: null,          // setTimeout handle → doReveal
  autoTimer: null,           // setTimeout handle → auto next
  answers: [],               // per question: Map<studentId, {pick?, given?, at, ms, ok, points}>
  totals: new Map(),         // studentId -> {points, correct, streak, lastRank}
  watchers: new Map(),       // studentId -> Set<res> (student SSE conns)
}
```

Timers are cleared on `/end`, room eviction, and every phase transition.
`/start` on a race room sets `status:'active'` as today AND `race.phase='idle'`.

### 2.4 State machine (`POST /race/advance`, hostSecret-gated)

Actions (validated against current phase; illegal action → 409
`{error:'bad_phase', phase, qIndex}` so a double-click is harmless):

- `next` — from `idle`, `reveal`, `explain`: if `qIndex+1 < qCount` open
  question `qIndex+1`; else (from `reveal`/`explain`) go to `podium`.
  Opening a question: `openAt = now + 3000` (3s get-ready countdown baked
  in), `deadline = openAt + timeSec*1000`, `closeTimer` fires `doReveal()` at
  `deadline + 1500` (grace for in-flight answers; phones display `deadline`).
- `reveal` — from `question`: close early (teacher button), runs `doReveal()`.
- `explain` — from `reveal`, only if the question has solution content:
  phase=`explain`, broadcast explain payload. Cancels `autoTimer`.
- `podium` — from `reveal`/`explain` after the LAST question: phase=`podium`,
  broadcast final standings.
- `auto` — any phase: set `race.auto = Boolean(value)`; if turning on during
  `reveal`, (re)arm `autoTimer`.

Auto-advance: when `race.auto`, `doReveal()` arms `autoTimer` for 8s → acts
like `next` (question or podium). `explain` cancels it for that question.

All-answered early close: on each accepted answer, if every student with
`connected !== false` (and not kicked) has answered the current question,
schedule `doReveal()` in 700ms (feels instant, absorbs stragglers).

`doReveal()` (idempotent, runs once per question):
1. phase = `reveal`; clear `closeTimer`.
2. Grade every recorded answer (already graded at accept time); for each
   student compute points (§2.6) and update `totals` (points, correct count,
   streak). Compute ranks (points desc, ties → earlier total answer time).
3. Update the REGULAR student records so the existing board/results/autosave
   keep working: `student.score = totals.correct`, `student.total = number of
   questions closed so far`, `student.answers[qId] = 0|1`. Do NOT touch
   `finished` (finished stays a self-paced concept until podium: at podium,
   mark all present students finished so autosave rows look complete).
4. Broadcast to teacher SSE + each student stream (§2.5).
5. If `race.auto` → arm `autoTimer` (8s).

In race rooms `POST /submit` **ignores** client-sent `score`, `total`,
`answers` (server-owned); everything else (heartbeat, presence, away,
focus, joining, kicked) behaves exactly as v7. Race rooms also gain
`race` summary on `/status` and `/submit` responses (§2.7).

### 2.5 Events

Student SSE (`GET /race/stream`): on connect, an individualized `state`
snapshot; then events on every transition. All events carry `qIndex`, `qCount`.

```jsonc
// on connect (and reused as the resync shape):
{ "type": "state", "phase": "question", "qIndex": 3, "qCount": 10,
  "qId": "q7", "openAt": 1784112000000, "deadline": 1784112030000,
  "remainingMs": 12345,            // server-computed at send time (skew-free anchor)
  "timeSec": 30,
  "answered": true,                 // THIS student answered current q
  "you": { "points": 2450, "correct": 3, "streak": 2, "rank": 5, "of": 26 },
  // present only in phase 'reveal'/'explain'/'podium':
  "reveal": { /* same shape as the reveal event's per-student view */ },
  "explain": { /* same shape as explain event */ } }

{ "type": "question", "qIndex": 4, "qCount": 10, "qId": "q9",
  "openAt": …, "deadline": …, "remainingMs": …, "timeSec": 30 }

// individualized per student:
{ "type": "reveal", "qIndex": 4, "qId": "q9",
  "correct": { "pick": 2 } /* mcq */  /* or input: { "answer": "2.5" } */,
  "you": { "answered": true, "ok": true, "points": 845, "bonus": 100,
            "streak": 3, "totalPoints": 3295, "rank": 4, "of": 26 } }
// you.rank is null for a student the standings haven't ranked yet (first
// contact with the room after this question's reveal) — clients hide the
// rank line, never render the null.

{ "type": "explain", "qIndex": 4, "qId": "q9",
  "solutionSteps": [...], "solution": [...], "solutionGeogebra": [...] }

{ "type": "podium", "top": [ { "name": "…", "points": 9120 }, …3 ],
  "you": { "rank": 7, "of": 26, "points": 5230, "correct": 6 } }
```

Teacher SSE (`GET /live`, existing stream — new event types; old consoles
ignore unknown types safely):

```jsonc
{ "type": "race", "phase": "question", "qIndex": 4, "qCount": 10, "qId": "q9",
  "openAt": …, "deadline": …, "remainingMs": …, "timeSec": 30,
  "answeredCount": 0, "activeCount": 26 }

{ "type": "race_answer", "qIndex": 4, "answeredCount": 17, "activeCount": 26 }

{ "type": "race", "phase": "reveal", "qIndex": 4, "qId": "q9",
  "correct": { "pick": 2 },
  "dist": [3, 1, 17, 5],          // mcq: counts per canonical option index
                                    // input: { "ok": 17, "wrong": 6, "none": 3 }
  "board": [ { "studentId": "…", "name": "…", "points": 3295, "delta": 845,
               "ok": true, "streak": 3, "rank": 1, "prevRank": 3 }, … ],
  "answeredCount": 23, "activeCount": 26 }
// prevRank equals rank on a row's FIRST appearance (first reveal of the
// race, or a mid-race joiner's first scored reveal) — a neutral "no
// movement", never a fabricated drop.

{ "type": "race", "phase": "explain", "qIndex": 4 }   // content is in the pack, console renders locally

{ "type": "race", "phase": "podium",
  "board": [ …final ranked list, same row shape… ] }
```

The `/live` connect `snapshot` event gains an optional `race` field carrying
the teacher `state` view (phase, qIndex, deadline/remainingMs, answeredCount;
`correct`+`dist` when in reveal/explain/podium; `board` — the last reveal's
standings — in EVERY phase once a reveal has happened, so a mid-question
console reload re-stamps race points and an end-before-next-reveal still
autosaves them) → mid-race console reload restores the exact board.

### 2.6 Scoring (server-side only)

```
correct:  points = round(500 + 500 * max(0, 1 - responseMs / (timeSec*1000)))
          // instant ≈ 1000, at the buzzer ≈ 500
wrong/no answer: 0
streak bonus (added to points): streak ≥ 2 → +100 × min(streak - 1, 5)
          // streak = consecutive correct, resets on wrong/miss
responseMs = serverNow_at_accept - openAt   (clamped to [0, timeSec*1000])
```

Answers accepted only while `phase === 'question'` and `openAt ≤ now ≤
deadline + 1500` (grace), and only from studentIds already in the room
roster (`/submit` with `joining:true` is the front door and enforces the
room cap — unknown ids get 404 `{error:'not_joined'}`, so phantom ids can't
mint scoreboard rows). One answer per student per question (first wins).
Input answers are graded with a **server port of `normalizeAnswer` /
`checkInputAnswer`** from `src/lib/quiz/pack.ts` (trim, lowercase, unicode
minus, comma→dot, strip spaces, numeric tolerance 1e-9) — keep the two
implementations textually in sync (comment cross-references both ways).

### 2.7 Race summary on existing responses

When `session.race` exists, `/status` and `/submit` responses gain:

```jsonc
"race": { "phase": "question", "qIndex": 3, "qCount": 10, "qId": "q7",
          "openAt": …, "deadline": …, "remainingMs": …,
          "answered": false,      // only when studentId was sent
          "auto": false }
```

This is the poll-level resync channel (SSE drop, screen lock, reload) and how
the student page learns the room is a race before opening the stream.
`/resolve` also gains `"race": true` so the /join page could show it (no UI
requirement now).

### 2.8 SSE accounting

`/race/stream` uses its own per-IP counter with cap
`LIVE_MAX_RACE_SSE_PER_IP` (default **200**; a school NAT can hold several
classes). Per-room cap: `MAX_STUDENTS_PER_SESSION`. Keep-alive `: ping` every
25s. On `close`, remove from `watchers`. `/health` reports `version: 8`.

## 3. Wire types (`src/lib/quiz/live-client.ts`)

New exported types (names normative): `RaceQuestionConfig`, `RaceConfig`
(`{auto: boolean, questions: RaceQuestionConfig[]}`), `RacePhase`
(`'idle'|'question'|'reveal'|'explain'|'podium'`), `RaceSummary` (the §2.7
shape), `RaceStudentEvent` (discriminated union of §2.5 student events),
`RaceTeacherEvent` (the `race` / `race_answer` teacher events), `RaceBoardRow`.

New functions:
- `createSession(title, studentPath?, features?, race?)` — adds `race` to the
  body; returns `{code, hostSecret, race?: {qCount}}`.
- `raceAnswer(code, studentId, qIndex, payload: {pick?: number; given?: string})`
- `raceAdvance(code, hostSecret, action: RaceAdvanceAction, value?: boolean)`
- `raceStreamUrl(code, studentId)` → `${QUIZ_BACKEND}/race/stream?...`
- `StatusResponse` and `SubmitResponse` gain `race?: RaceSummary`.
- `LiveEvent` union gains the teacher race events; `snapshot` gains
  `race?: TeacherRaceState`.

## 4. Pack schema (`src/lib/quiz/pack.ts` + docs)

New optional per-question fields:

- `solutionSteps?: SolutionStep[]` where
  `SolutionStep = { name: Localized; blocks: Block[] }` and `Block` is the
  lesson union (`p|given|find|formula|callout|answer`) imported from
  `src/lib/lesson/types.ts` (types-only import; single source of truth).
  Validation mirrors the lesson shapes: `name` Localized required, `blocks`
  non-empty array, each block a known type with its required fields
  (`text` Localized / `latex` string); ≤12 steps, ≤30 blocks per step.
- `timeSec?: number` — author-suggested race time limit, integer clamp
  [5, 600]; used by the console tray as the per-question default.

Existing flat `solution?: Localized[]` keeps its exact semantics (self-paced
post-answer reveal). Explain-phase precedence: `solutionSteps` → flat
`solution` → question has no explain content (no Түсіндіру button).

`hasExplainContent(q)` helper exported from pack.ts (used by console).

Document both fields in `docs/QUIZ_PACK_FORMAT.md` ("Optional per-question
fields" section), with a bilingual example.

**Deploy-order warning (put in the doc):** `validatePack` strips unknown
fields on every Storage download — packs using `solutionSteps` must only be
uploaded AFTER this code is live, or the field silently vanishes.

## 5. Answer stripping (`src/app/play/[quizId]/page.tsx`)

When the join link carries `race=1` (`searchParams`), the server component
deep-strips from every question before passing the pack to the client:
`correct`, `answer`, `accept`, `solution`, `solutionSteps`,
`solutionGeogebra`. (`hints`, `theory`, `image`, `geogebra`, `options`, text
stay — needed during the question.) Self-paced links are untouched.
Residual risk (documented, accepted for v1): the raw pack JSON is publicly
fetchable from the `quizzes-public` bucket by a determined student; a private
race bucket / signed URL is future work.

## 6. Student page (`pack-quiz-client.tsx` + new `use-race-session.ts`)

Join/lobby/kicked/ended flows are UNCHANGED (same `useLiveSession`, same
heartbeats, same beacons — the session hook keeps running underneath race
mode so presence/away tracking work identically).

Race detection: `?race=1` in the URL AND `race` summary present on
`/status`/`/submit` responses (server truth wins; if the server says race but
the pack still has answers — link tampering — proceed: server grades anyway).

New hook `use-race-session.ts` (client): owns the EventSource to
`raceStreamUrl`, exposes `{connected, state}` where state mirrors §2.5
`state`; resyncs from the periodic `/submit` response race summary and on
`visibilitychange` (screen lock kills SSE on phones — reopen + the connect
snapshot restores). SSE retry: 2s backoff. The unmount-beacon invariant: the
race hook must NOT remount `useLiveSession` — RaceFlow renders inside the
existing `phase === "active"` branch (the same place GeneratedFlow branches),
so the session component tree stays mounted.

RaceFlow screens (all inside the existing card layout, reusing QuestionCard,
AidChips, MathText, calculator FAB):

1. **idle / waiting**: "Сұрақты күтіңіз" pulse screen (shows your points so far).
2. **get-ready**: between event arrival and `openAt` — big 3‑2‑1 countdown.
3. **question**: QuestionCard with the two-step select→Check flow; a slim
   countdown bar anchored to `remainingMs` (local anchor: `deadlineLocal =
   performance.now() + remainingMs`, NOT device clock). On Check →
   `raceAnswer(...)`; store `{pick|given}` in `extra.raceAns[qId]`
   (collision-safe key, survives reload); screen flips to "Жауап қабылданды —
   күтіңіз" with the ticking bar. At local 0: "Уақыт бітті" (server will
   reveal). Answered-state and own pick restore from `raceAns` after reload.
   Hints/theory/figure collapsibles available per teacher feature flags
   (existing gating), hints NOT hidden after answering in race (mode-scoped
   prop — self-paced behavior unchanged).
4. **reveal**: your result — correct/wrong flash (reuse `revealed` prop
   rendering), "+845" points fly-in, streak flame when ≥2, rank line
   ("4-орын / 26"). For mcq, the correct option highlights (canonical index →
   display index via the option order map — race forces canonical option
   order, see below).
5. **explain**: solution steps rendered with `LessonBlocks`
   (`solutionSteps` from the explain event; flat list fallback rendered as
   numbered steps like the existing self-paced block), `solutionGeogebra`
   replayed on the figure, hints/formulas collapsibles open-able.
6. **podium**: final rank card + top-3; confetti for top-3 (existing
   component). Room `ended` still routes to the existing EndedScreen.

Option order: race mode forces canonical option order (no per-student option
shuffle) so the board distribution and phone letters match; `?shuffle=1` is
never emitted for race links and is ignored if present. Question order comes
ONLY from server events (`qId` lookup in the local pack); local `extra.idx`
is not used in race mode. A `qId` missing from the local pack (pack edited
mid-room) → full-screen "Пакет жаңарды — қайта кіріңіз" error.

Timer: never trust device wall-clock; anchor to `remainingMs` at event
receipt (SSE latency ≈ ms). Server grace (+1500ms) absorbs the rest.

`sanitizeExtra` learns `raceAns` (`Record<string, {pick?: number; given?:
string}>`, ≤200 entries).

## 7. Teacher console (`pack-console-client.tsx`, `use-teacher-session.ts`, new `race-board.tsx`)

### Setup
- Mode switch in the settings card beside orderMode: «Өз қарқынымен» /
  «Жарыс» (RU: «В своём темпе» / «Соревнование»). Hidden for generator packs.
- Race selected → orderMode forced to `custom` (shuffle radio disabled with a
  hint), default time selector (10/20/30/45/60/90/120с, default 30), auto
  toggle («Автоматты өту»), and per-question seconds shown next to each tray
  item (pre-filled from `question.timeSec` ?? default; editable, clamp 5–600).
  Questions of type `graph-quadratic` are not selectable for race (chip
  disabled + tooltip); selecting race with graph questions already in the
  tray drops them with a visible notice.
- Join link gains `&race=1`; `shuffle` never emitted in race mode.
- `RoomCtx` gains `{mode: 'self'|'race', raceSec, raceAuto, raceQSec:
  Record<qid, number>}` — mirrored in the resumeRoom whitelist and the
  conflict-replay tuple (all three createRoom signature sites in lockstep).
- `createRoom` builds `RaceConfig` from the pack (correct/accept/timeSec/
  solutionSteps/solution/solutionGeogebra per selected question, teacher's
  tray order) and passes it to `createSession`; missing `race.qCount` in the
  response → destroy the half-made room (`/end`) and show "Сервер жарыс
  режимін қолдамайды" error. Saved quizzes (`saved_quizzes`) keep working —
  mode is NOT saved in them (per-run choice).

### Live board (`race-board.tsx`, replaces LiveScreen when ctx.mode==='race')
Driven by race events handled in `applyEvent` (new `race`/`race_answer`
cases; snapshot ingests `race` state for mid-race reload):

- **idle**: room summary + big «Бастау → 1-сұрақ» button.
- **question**: question text (large, MathText), countdown ring anchored to
  `remainingMs`, live «Жауап берді: 17/26», button «Жауаптарды ашу» (early
  reveal). Students strip (compact presence row with away/left badges — kick
  still available) collapsible below.
- **reveal**: correct answer highlighted; distribution as horizontal bars
  (mcq: per option with letters + counts, correct bar in green; input:
  correct/wrong/no-answer bars); top-5 leaderboard with rank-change arrows
  (▲2/▼1 from `prevRank`); buttons: «Түсіндіру» (only when
  `hasExplainContent`), «Келесі» (or «Марапаттау» after the last question);
  auto badge with countdown when auto mode is on.
- **explain**: solution steps via `LessonBlocks` in a large panel,
  `PenOverlay` mounted over it (`position:relative` wrapper; advance buttons
  OUTSIDE the overlayed region so the pen never blocks them); «Келесі» /
  «Марапаттау».
- **podium**: animated top-3 (reuse ResultsScreen podium styling + Confetti),
  full ranked list with points; «Аяқтау» → `session.end()` → existing
  ResultsScreen + autosave (score/total = correct/asked, so `quiz_results`
  and the admin analytics stay consistent; `racePoints` added per student row
  — additive JSONB, harmless to existing readers).
- Race actions in `use-teacher-session.ts`: `raceNext/raceReveal/raceExplain/
  racePodium/raceSetAuto` → `raceAdvance(...)` with hostSecretRef; 409
  `bad_phase` responses are silently ignored (double-click safety).
- The 45-min room clock stays; if it fires mid-race the room ends exactly as
  today (results screen; autosave has whatever was closed).

## 8. Strings (`src/lib/quiz/engine-strings.ts`)

All new keys exist in BOTH `kz` and `ru`. KZ terminology: «есептер қоры»
(never «банкі»). Key list (normative, agents add exactly these):
`race_mode_self`, `race_mode_race`, `race_default_time`, `race_auto`,
`race_per_q_sec`, `race_graph_excluded`, `race_server_unsupported`,
`race_waiting`, `race_get_ready`, `race_answered_wait`, `race_time_up`,
`race_points`, `race_streak`, `race_rank_line`, `race_correct_answer`,
`race_reveal_now`, `race_answered_count`, `race_next`, `race_explain`,
`race_podium`, `race_finish`, `race_auto_badge`, `race_pack_changed`,
`race_first_question`, `race_your_result`, `race_leaderboard`.

## 9. File-change map

| File | Change |
|---|---|
| `server/server.js` | v8: race config sanitize, state machine, 3 `/race/*` endpoints, race fields on /status /submit /session /resolve /live-snapshot, scoring, input-answer port, json limit 1mb, version 8 |
| `server/README.md` | v8 section, endpoint table, nginx `/race` prefix note, deploy steps |
| `src/lib/quiz/pack.ts` | `solutionSteps` + `timeSec` validation/types, `hasExplainContent` |
| `docs/QUIZ_PACK_FORMAT.md` | document new fields + deploy-order warning |
| `src/lib/quiz/live-client.ts` | race wire types + functions (§3) |
| `src/app/play/[quizId]/page.tsx` | `race=1` answer stripping |
| `src/lib/quiz/use-race-session.ts` | NEW: student race SSE hook |
| `src/app/play/[quizId]/pack-quiz-client.tsx` | RaceFlow branch + screens (§6), `raceAns` in sanitizeExtra, mode-scoped hint gate |
| `src/lib/quiz/use-live-session.ts` | pass-through of `race` summary from /status + /submit responses (minimal, additive) |
| `src/lib/quiz/use-teacher-session.ts` | race events in applyEvent + snapshot, race actions, createRoom race param, conflict tuple |
| `src/app/play/[quizId]/host/pack-console-client.tsx` | setup mode UI, tray per-question seconds, race link build, RoomCtx + resume whitelist |
| `src/app/play/[quizId]/host/race-board.tsx` | NEW: race board phases (§7) |
| `src/lib/quiz/engine-strings.ts` | §8 keys (kz + ru) |
| `src/lib/quiz/use-result-autosave.ts` / `quiz-result-actions.ts` | additive `racePoints` on student rows (only if shape allows; else skip) |
| `packs/dev-preview.json`, `packs/cylinder-volume-grade11.json` | example `solutionSteps` + `timeSec` content |

## 10. Deploy order (for the user, after merge)

1. Vercel deploy (site understands race + new pack fields).
2. Hetzner: nginx allowlist add `/race` prefix → `scp server/server.js` →
   `pm2 restart mathsabaq-live` → `curl /health` expects `"version":8`.
3. Re-upload packs with `solutionSteps` via /admin/quizzes (only after 1).

Until 2, creating a race room fails with the explicit "server doesn't
support race" error; self-paced is unaffected throughout.
