# Tournament Mode (Турнир) — Design Spec

FIFA-playoff-style duel tournament on top of the existing live-quiz stack and
the drill generator engine. This document is the protocol contract between
`server/server.js` (v9), `server/bracket.js` (new), the student page
(`/play/[quizId]`), and the teacher console (`/play/[quizId]/host`). Every
message shape here is normative. It deliberately mirrors the structure of
`docs/RACE_MODE_SPEC.md` (v8) — where this spec is silent, race-mode
precedent applies.

Decided with the product owner (2026-07-19):

- Third room mode at creation: **self-paced** / **race** / **tournament**.
- Tournament v1 runs on **drill generator packs only** (registry topics and
  uploaded `.js` generator files). Fixed-question packs and graph-quadratic
  are excluded (phase 2 adds a curated-pool feeder). This is the INVERSE of
  race mode's exclusion rule.
- A **duel** = two students, one shared problem sequence, fixed time window
  (`roundSec`). Most correct answers wins. Wrong answer = lockout freeze
  (`lockoutSec`), score never decreases.
- **Same sequence for the whole round** (every duel in a round runs the same
  server-chosen seed) — fair, reviewable, deterministic.
- Winners advance; **odd winners → lucky loser** (best-scoring loser of the
  just-settled round returns); **round-1 odd → one random bye** (bye student
  still plays, auto-advances).
- **Eliminated students keep playing** every round, randomly paired in the
  losers pool; odd losers pool → one trio. Losers-pool results feed the
  consolation standings only.
- Opponent's live score + away/left status visible on the student phone and
  the board during a duel.
- Scoring/grading is **server-side** (exact-value port); phones display, the
  server decides.
- Teacher paces the tournament: draw (жеребе) → start round → review →
  next draw. No auto-advance in v1.

## 1. Non-negotiable invariants (do not break)

- Self-paced AND race modes must behave **byte-for-byte identically** when no
  tournament fields are present. Everything tournament is additive and gated.
- `parseStatus` (live-client.ts) throws on unknown `status` strings →
  tournament state rides **new optional fields** on existing statuses, never
  new status strings.
- All v6/v7/v8 load-bearing invariants survive untouched: sticky-finished,
  kick/re-join, `/leave` beacon + unmount beacon, 45s presence sweep,
  away-clock + gone-gap reconciliation, teacher resume blob
  (`msq-live-room:*`, 75s `:alive`, not_found-is-definitive, 4h TTL),
  one-room-per-teacher 409 + owner-token `/end`, result-claims dedup, 45-min
  auto-end, rate limits, hostSecret gating, CORS.
- Student localStorage `extra` gains **no new keys** (tournament resumes
  entirely from the server `state` snapshot).
- Old-server tolerance: a v8 server ignores the `tourney` field on `/session`
  → the console MUST require the `tourney` acknowledgment in the response and
  **fail room creation loudly** (destroy the half-made room, show
  `tourney_server_unsupported`), exactly like the race qCount check.
- `useLiveSession` never remounts across phase changes: `TournamentFlow`
  renders inside the existing `phase === "active"` branch of
  `pack-quiz-client.tsx` (the same place `GeneratedFlow` and `RaceFlow`
  branch).
- Timer trust: phones anchor to `remainingMs` at event receipt
  (`performance.now() + remainingMs`), NEVER the device wall-clock.

## 2. Server v9 (`server/server.js` + `server/bracket.js` + `server/exact.js`)

`server/` becomes three files. `server.js` stays the entry point;
`bracket.js` (pure pairing/settling logic) and `exact.js` (exact-value
answer port) are `require`d siblings — both pure CommonJS modules with **no
dependencies and no side effects** so plain `node` test scripts can require
them without starting the server. Deploy copies all three (update
`server/README.md` + new `server/DEPLOY_V9_TOURNEY.md`).

### 2.1 New endpoints — all under the single path prefix `/tourney`

nginx on the prod box needs ONE new allowlist entry for the `/tourney`
prefix (mirror `server/add-race-to-nginx.sh` → `add-tourney-to-nginx.sh`).

| Endpoint | Who | What |
|---|---|---|
| `GET /tourney/stream?code=&studentId=` | student | SSE: tournament events, individualized |
| `POST /tourney/answer` | student | `{code, studentId, round, seq, given}` |
| `POST /tourney/advance` | teacher | `{code, hostSecret, action}` |

### 2.2 Tournament config (console → server, on `POST /session`)

`/session` body gains an optional `tourney` object (mutually exclusive with
`race`; both present → 400 `{error:'mode_conflict'}`).

```jsonc
{
  "tourney": {
    "roundSec": 90,        // duel length, clamped to [30, 300]
    "lockoutSec": 4,       // wrong-answer freeze, clamped to [0, 15]
    "rounds": [            // pre-generated answer keys, one per potential round
      {
        "seed": 123456789, // 31-bit int; the round's shared sequence seed
        "answers": ["4", "−3", "2π/3", "0,5", "√2/2", …]  // plain keypad strings, index = seq-1
      }
    ]
  }
}
```

Caps (sanitize with the drop-don't-reject philosophy where possible):
2 ≤ rounds ≤ 16; 40 ≤ answers per round ≤ 400; each answer a string ≤ 24
chars; whole config ≤ 256KB serialized (oversize → 400
`{error:'tourney_too_large'}`; <2 usable rounds → 400
`{error:'tourney_invalid'}`). Console sends **12 rounds × 240 answers**.

Response when accepted: `{code, hostSecret, tourney: {rounds: N}}` — the
console REQUIRES `tourney.rounds === config.rounds.length` to proceed.

### 2.3 Session state additions

```js
session.tourney = {
  roundSec, lockoutMs, rounds,   // sanitized config
  phase: 'idle',                 // 'idle'|'pairing'|'duel'|'result'|'podium'
  round: 0,                      // 1-based once the first draw happens
  plan: null,                    // current round's RoundPlan (see §3)
  openAt: null, deadline: null,  // epoch ms while phase === 'duel'
  closeTimer: null,              // setTimeout → settleRound at deadline+1500
  scores: new Map(),             // studentId -> {correct, wrong, seqDone, lastCorrectAt, lockedUntil} — CURRENT round
  history: [],                   // settled rounds: {round, plan, outcome}
  alive: [],                     // main-bracket studentIds still in
  out: [],                       // eliminated + latecomers (losers pool)
  champion: null,                // studentId once decided
  totals: new Map(),             // studentId -> {correct, wrong, wins} — whole tournament
  watchers: new Map(),           // studentId -> Set<res> (student SSE conns)
}
```

Timers cleared on `/end`, eviction, and every transition. `/start` on a
tournament room sets `status:'active'` + `tourney.phase='idle'` (lobby → the
board shows the draw button).

### 2.4 State machine (`POST /tourney/advance`, hostSecret-gated)

Actions (illegal for the phase → 409 `{error:'bad_phase', phase, round}`):

- `pair` — from `idle` (first draw) or `result` (no champion yet). Roster in:
  every student with a roster record that is not kicked. First draw: all are
  main-bracket candidates. Later draws: `alive` = main bracket, everyone
  else (eliminated + latecomers who joined after the first draw) = losers
  pool. Runs `planRound` (§3), stores `plan`, `round++`, phase=`pairing`,
  broadcasts. Fewer than 2 eligible students on the FIRST draw → 409
  `{error:'too_few'}`. If `round` would exceed `rounds.length` → 409
  `{error:'no_rounds_left'}` (teacher must podium).
- `start` — from `pairing`: `openAt = now + 3000` (3s get-ready),
  `deadline = openAt + roundSec*1000`, phase=`duel`, arm `closeTimer` →
  `settleRound()` at `deadline + 1500` (grace absorbs in-flight answers;
  phones display `deadline`). Reset `scores` for the round.
- `podium` — from `result`, only when `champion !== null` OR no rounds left:
  phase=`podium`, broadcast final standings, mark all connected students
  finished (autosave-complete rows), update regular records one last time.

`settleRound()` (idempotent, timer-driven — there is NO manual close action;
the round always runs its full clock):
1. phase=`result`; clear `closeTimer`.
2. Settle via `settleRound` in bracket.js (§3): winners advance, kicked
   students are force-eliminated, champion detected when the main bracket is
   down to 1.
3. Update `totals` (add round correct/wrong; +1 `wins` per duel/trio winner,
   bye counts as a win).
4. Update REGULAR student records so the v7 board/results/autosave keep
   working: `student.score = totals.correct`, `student.total =
   totals.correct + totals.wrong`. `finished` untouched until podium.
5. Broadcast individualized `result` events + teacher `tourney` event.

### 2.5 Answering (`POST /tourney/answer`)

`{code, studentId, round, seq, given}` — accepted ONLY when ALL of:
- session exists, is a tournament, `phase === 'duel'`,
- `round === tourney.round`,
- studentId is in the roster and not kicked (unknown → 404
  `{error:'not_joined'}`),
- `openAt ≤ now ≤ deadline + 1500`,
- `seq === scores.get(studentId).seqDone + 1` (answers land strictly in
  sequence order; a replay or skip → 409 `{error:'bad_seq', expect}`) and
  `seq ≤ answers.length`,
- `now ≥ lockedUntil` (else 429 `{error:'locked', remainMs}`).

Grading: `given` and `answers[seq-1]` both run through the exact port
(`server/exact.js`): `parseExact` each side → `equalsExact`. If the KEY
fails to parse (should never — console generates it), fall back to
normalized string equality (trim, unicode minus → `-`, comma → `.`).
Every accepted answer settles its seq permanently (`seqDone++`): correct →
`correct++`, `lastCorrectAt = now`; wrong → `wrong++`,
`lockedUntil = now + lockoutMs`.

Response: `{ok: true, correct: n, wrong: n, right: boolean, lockRemainMs}`.
Side effects: push `tick` to the student's duel partner(s) (§2.6), push
`tourney_score` to the teacher stream.

`server/exact.js` is a line-for-line CommonJS port of
`src/lib/drill/exact.ts` (`exact`, `equalsExact`, `parseExact` and their
helpers — `toPlain`/`toKatex` not needed). Cross-reference comments BOTH
ways (same convention as the v8 `normalizeAnswer` port). Parity is enforced
by `scripts/exact-port-parity.ts` (§8).

In tournament rooms `POST /submit` **ignores** client-sent
`score`/`total`/`answers` (server-owned, same as race). Heartbeat, presence,
away, focus, joining, kick semantics unchanged. A heartbeat or `/leave` that
CHANGES a student's `connected`/`focused`/`awaySeconds` while a duel is live
→ push `presence` to their duel partner(s).

### 2.6 Events

Student SSE (`GET /tourney/stream?code=&studentId=`): on connect, an
individualized `state` snapshot; then events on every transition. `state` is
also the resync shape (SSE drop / reload / screen lock — reconnect restores
the exact screen).

```jsonc
// on connect (and resync):
{ "type": "state", "phase": "duel", "round": 2, "roundSec": 90,
  "seed": 123456789,               // current round's seed (phase pairing|duel|result)
  "openAt": …, "deadline": …, "remainingMs": 41200,
  "you": { "correct": 7, "wrong": 2, "seq": 10,     // seq = NEXT expected seq
           "lockRemainMs": 0, "role": "main",        // "main"|"losers"|"bye"|"waiting"
           "wins": 1, "totalCorrect": 15 },
  "pair": { "opponents": [ { "name": "Аружан", "correct": 6,
                             "connected": true, "away": false, "awaySeconds": 0 } ] },
  // present only in the matching phase:
  "result": { /* same shape as the result event */ },
  "podium": { /* same shape as the podium event */ } }

// draw revealed (individualized). Opponent entries everywhere (pairing /
// tick / presence / state.pair / result) also carry "id" (the studentId) —
// additive over the name so clients can merge updates without conflating
// two same-named opponents in a trio:
{ "type": "pairing", "round": 2, "role": "main",   // "main"|"losers"|"bye"|"waiting"
  "opponents": [ { "id": "stu_x", "name": "Аружан" } ],  // 0 (bye/waiting), 1, or 2 (trio) entries
  "luckyLoser": false }                              // true = YOU came back this round

// round opens:
{ "type": "duel", "round": 2, "seed": 123456789, "roundSec": 90,
  "openAt": …, "deadline": …, "remainingMs": 93000 }

// opponent scored (sent to the partner(s) of whoever answered):
{ "type": "tick", "opponents": [ { "name": "Аружан", "correct": 7 } ] }

// opponent presence changed mid-duel:
{ "type": "presence", "opponents": [ { "name": "Аружан", "connected": true,
                                       "away": true, "awaySeconds": 12 } ] }

// round settled (individualized):
{ "type": "result", "round": 2, "won": true, "eliminated": false,
  "champion": false,                // true only for the champion at the final settle
  "you": { "correct": 9, "wrong": 3 },
  "opponents": [ { "name": "Аружан", "correct": 6 } ],
  "nextRole": "main" }              // "main"|"losers"|"champion"|"waiting"

// final:
{ "type": "podium", "champion": { "name": "…" },
  "top": [ { "name": "…", "wins": 4, "correct": 31 }, …3 ],
  "you": { "rank": 7, "of": 26, "wins": 1, "correct": 18 } }
```

Teacher SSE (existing `/live` stream — new event types; old consoles ignore
unknown types):

```jsonc
{ "type": "tourney", "phase": "pairing", "round": 2,
  "openAt": …, "deadline": …, "remainingMs": …, "roundSec": 90,
  "bracket": { /* the FULL serialized bracket, §2.7 */ } }
// sent on EVERY phase transition; question-phase clock fields when relevant

{ "type": "tourney_score", "round": 2, "studentId": "stu_x",
  "correct": 7, "wrong": 2 }        // per accepted answer, board maps to duel
```

The `/live` connect `snapshot` gains an optional `tourney` field carrying the
full teacher view (phase, round, clocks, bracket) → mid-tournament console
reload restores the exact board.

### 2.7 Serialized bracket (teacher wire shape)

```jsonc
{ "phase": "duel", "round": 2, "roundCount": 12, "champion": null,
  "players": { "stu_x": { "name": "Аружан", "connected": true, "kicked": false } },
  "history": [                       // one entry per DRAWN round (current included)
    { "round": 1,
      "main":   [ { "a": "stu_x", "b": "stu_y", "scoreA": 9, "scoreB": 6, "winner": "stu_x" } ],
      "losers": [ { "a": "stu_p", "b": "stu_q", "c": "stu_r",   // trio: c present
                    "scoreA": 4, "scoreB": 7, "scoreC": 2, "winner": "stu_q" } ],
      "byeId": "stu_z",              // or null
      "luckyLoserId": null,          // promoted INTO this round's main draw
      "settled": true } ],
  "standings": [ { "studentId": "stu_x", "wins": 2, "correct": 15, "wrong": 4 } ]
}
```

`winner`/`settled` appear only after settle; the current round streams live
scores via `tourney_score`. Names are carried in `players` so the board
renders without a roster join.

### 2.8 Tournament summary on existing responses

When `session.tourney` exists, `/status` and `/submit` responses gain (poll
resync channel; also how the student page learns the room is a tournament):

```jsonc
"tourney": { "phase": "duel", "round": 2, "roundSec": 90, "seed": 123456789,
             "openAt": …, "deadline": …, "remainingMs": … }
```

`/resolve` gains `"tourney": true`. `/health` reports `version: 9`.

### 2.9 SSE accounting

`/tourney/stream` reuses the race per-IP counter pattern with its own env
cap `LIVE_MAX_TOURNEY_SSE_PER_IP` (default 200). Per-room cap:
`MAX_STUDENTS_PER_SESSION`. Keep-alive `: ping` every 25s. On close, remove
from `watchers`.

## 3. Bracket engine (`server/bracket.js`) — pure, deterministic, tested

CommonJS module, no deps, no I/O, no `Date.now`/`Math.random` — all
randomness comes from a caller-provided rng (`mulberry32(roundSeed)`; port
mulberry32 into the module). Exports (shapes normative):

```js
mulberry32(seed) -> rng
// roster: [{id, name, kicked, connected, joinedAfterFirstDraw}]
// state:  {alive: [ids], out: [ids], champion, history, firstDrawDone}
planRound(state, roster, rng) -> RoundPlan
// RoundPlan = { round-agnostic: main: [{a, b|null}], losers: [{a, b|null, c?}],
//               byeId|null, luckyLoserId|null }
settleRound(plan, scores, roster) -> Outcome
// scores: Map|obj studentId -> {correct, wrong, lastCorrectAt}
// Outcome = { winners: [ids], eliminated: [ids], duels: [settled pair rows],
//             champion: id|null }
applyOutcome(state, plan, outcome) -> newState
finalStandings(state, totalsById, roster) -> [{studentId, rank, wins, correct, wrong}]
compareScores(sa, sb) -> -1|0|1        // the tiebreak comparator, exported for tests
```

Rules (normative):

- **Tiebreak comparator** (winner of a duel): `correct` desc → `wrong` asc →
  `lastCorrectAt` asc (earlier finisher of the same score wins) → and if
  STILL tied, the student earlier in the plan's pair (`a` beats `b` beats
  `c`) — deterministic, never random at settle time.
- **First draw**: shuffle all eligible students (rng), pair sequentially.
  Odd → the last unpaired student is `byeId` (`{a, b:null}` in `main`; bye =
  auto-win, plays solo for fun, their score counts toward totals only).
- **Later draws (main)**: NOT shuffled — the one random жеребе is round 1;
  after that the bracket is a fixed FIFA tree. Candidates = previous winners
  (+bye) in PAIR ORDER (settle emits winners by pair index; applyOutcome
  preserves that order into `alive`), paired sequentially — the winner of
  pair 2i meets the winner of pair 2i+1. A kicked winner is dropped and the
  survivors shift up. If odd AND eligible losers exist: promote
  `luckyLoserId` = best loser of the JUST-SETTLED round by the same
  comparator, `connected !== false` and not kicked only, appended at the END
  (pairs with the leftover last winner). If odd and no eligible loser → the
  last winner gets the bye (same rule as round 1).
- **Losers pool**: everyone eliminated (minus a promoted lucky loser) plus
  latecomers. Shuffle, pair; odd → last THREE form a trio `{a, b, c}` (a
  1-person pool → solo `{a, b:null}`). Trio/solo winner counts for standings
  only.
- **Kicked** students are excluded from every draw and force-lose at settle
  regardless of score. **Disconnected** students still get drawn (they may
  return — recovery flows exist); their score just stays where it stopped.
- **Champion**: settle leaves `winners.length === 1` AND that player won a
  duel (not a bye) in a round where they were the only main pair — i.e. the
  final. Concretely: when `alive` would become 1, `champion` = that id.
- **Latecomers** (first heartbeat after the first draw): flagged
  `joinedAfterFirstDraw`, join the losers pool at the next draw, can never
  become champion.
- **Standings**: champion rank 1; then by elimination round desc (later
  elimination = higher), then `wins` desc, then `correct` desc, `wrong` asc,
  studentId asc (total order, stable).

## 4. Wire types (`src/lib/quiz/live-client.ts`)

New exported types (names normative): `TourneyPhase`
(`'idle'|'pairing'|'duel'|'result'|'podium'`), `TourneyAdvanceAction`
(`'pair'|'start'|'podium'`), `TourneyRoundKey` (`{seed: number; answers:
string[]}`), `TourneyConfig` (`{roundSec, lockoutSec, rounds:
TourneyRoundKey[]}`), `TourneySummary` (§2.8 shape), `TourneyOpponent`,
`TourneyStudentEvent` (discriminated union of §2.6 student events),
`TourneyTeacherEvent` (`tourney` / `tourney_score`), `TourneyBracket`,
`TourneyBracketPair`, `TeacherTourneyState`.

New functions (mirror the race ones exactly in style):
- `createSession(..., tourney?: TourneyConfig)` — fifth optional arg; the
  response type gains `tourney?: {rounds: number}`.
- `tourneyAnswer(code, studentId, round, seq, given)` → `Promise<{ok: boolean;
  right?: boolean; correct?: number; wrong?: number; lockRemainMs?: number}>`
  (parse the JSON body; network error → `{ok: false}`).
- `tourneyAdvance(code, hostSecret, action)` — fire-and-forget like
  `raceAdvance`.
- `tourneyStreamUrl(code, studentId)`.
- `StatusResponse` gains `tourney?: TourneySummary` (sanitizer:
  `sanitizeTourneySummary`, same defensive shape-check style as
  `sanitizeRaceSummary`); `LiveEvent` gains the teacher events; `snapshot`
  gains `tourney?: TeacherTourneyState`.

## 5. Student page (`pack-quiz-client.tsx` + new `use-tourney-session.ts`)

Detection: `?tourney=1` in the join link AND `tourney` summary present on
`/status`/`/submit` (server truth wins). Join/lobby/kicked/ended flows
UNCHANGED (`useLiveSession` keeps running underneath).

New hook `src/lib/quiz/use-tourney-session.ts` — clone the architecture of
`use-race-session.ts` verbatim: owns the EventSource to `tourneyStreamUrl`,
pure `applyTourneyEvent(prev, ev)` reducer, 2s reopen backoff, resync from
the `/submit` response summary + `visibilitychange` reopen, clock anchoring
via `performance.now() + remainingMs`.

**Problem source — the seed injection.** `GeneratedFlow` and
`UploadedDrillLoader` gain an optional `seed` prop (and `UploadedDrillLoader`
regenerates when it changes): when present it replaces the current
`Math.random()` seed. Tournament passes the round seed from the server; the
sequence position is the server-confirmed `seq`. Registry topics:
`generateDrillPackQuestion(topic, config, roundSeed, seq)` (already
deterministic). Uploaded files: batch-generate `min(240, answers.length)`
problems for the round's seed via the existing worker path. Self-paced
generator rooms (no `seed` prop) behave exactly as today.

TournamentFlow screens (inside the existing card layout; reuse
`DrillKeypad`, `DrillVisualView`, `MathText`):

1. **idle/waiting**: "Жеребені күтіңіз" pulse screen (+ your wins so far).
2. **pairing**: opponent reveal card — role-aware: main duel («Қарсыласың:
   Аружан»), losers pool, trio (two names), bye («Бұл айналымда тікелей
   өтесің — жаттығу ретінде ойна»), lucky loser («Сен турнирге қайттың!»),
   waiting (latecomer before their first draw).
3. **get-ready**: 3‑2‑1 between `duel` event arrival and `openAt`.
4. **duel**: the drill loop — problem, keypad, submit → `tourneyAnswer`.
   Correct → green flash, next problem. Wrong → red flash + full-keypad
   lockout overlay with a ticking countdown (`lockRemainMs`), then next
   problem. Score header: `Сен 8 ▓▓▓░░ 6 Аружан` bar with numbers, opponent
   away/left badge (from `presence`), slim round-timer bar. The server's
   answer response is authoritative for correct/wrong counts; `tick` events
   update the opponent side. `seq` desync (409 `bad_seq`) → silently jump to
   the server's `expect`.
5. **result**: won/lost/eliminated/champion card; lucky-loser and
   trio-winner variants; your score vs opponent's.
6. **podium**: champion name + top-3 + your rank; confetti for top-3 (reuse
   `Confetti`). Room `ended` still routes to the existing EndedScreen.

The visual brick (`DrillVisualView`) renders with the problem as in drill
practice; the `solution` line is NOT shown during a duel (speed context).

`src/app/play/[quizId]/page.tsx`: pass `tourney` flag through like `race`;
no answer stripping needed (generator packs carry no answers). Accepted v1
risk (document in spec §11): the generator code + round seed are both
client-visible, so a determined student could precompute answers; classroom
risk accepted, lockout limits the damage.

## 6. Teacher console (`pack-console-client.tsx`, `use-teacher-session.ts`, new `host/tourney-board.tsx`)

### Setup
- Mode switch gains «Турнир» — shown ONLY for drill generator packs
  (registry or uploaded file); for those packs «Жарыс» stays hidden (as
  today) and «Турнир» appears beside «Өз қарқынымен».
- Tournament selected → settings: round length select (60/90/120/180s,
  default 90), lockout select (Жоқ/3/5/8с, default 4с shown as «Қате
  жауап: 4с тайм-аут»), and the pack's existing drill option ticks
  (generator config) apply as today.
- `RoomCtx` gains `{mode: 'self'|'race'|'tourney', tourneySec,
  tourneyLockSec}` — mirrored in the resume-blob whitelist and the
  conflict-replay tuple (all createRoom signature sites in lockstep).
- `buildTourneyConfig(): Promise<TourneyConfig>` — 12 rounds, each: fresh
  31-bit random seed; generate 240 problems (registry: `topic.generate` under
  `mulberry32((seed + seq*2654435761)>>>0)` per seq, seq 1..240; uploaded:
  `UploadedDrillSource.load(generatorCode)` then `generate(seed, config, 1,
  240)`); answers = `toPlain(problem.answer, problem.answerStyle)`. Runs
  before `createSession` with a spinner; a generator error → visible failure,
  no room.
- Join link gains `&tourney=1`. Response missing `tourney.rounds` → destroy
  room + `tourney_server_unsupported` error (race precedent).

### Live board (`tourney-board.tsx`, replaces LiveScreen when mode==='tourney')
Driven by `tourney`/`tourney_score` events in `applyEvent` (+ snapshot
ingest for reload recovery). The projector centerpiece — style it like the
FIFA playoff screenshot (columns of rounded pair cards, connector lines,
flags→avatars = first letter circles):

- **idle**: room summary + roster count + big «Жеребе тарту» button.
- **pairing**: animated bracket columns (1/16 → финал structure as deep as
  the roster needs); current round's new pairs highlighted; lucky-loser
  callout banner («X турнирге қайтты!»); losers-pool pairs in a side panel;
  «Айналымды бастау» button.
- **duel**: countdown ring (anchored `remainingMs`), every pair card shows
  live `9 : 6` scores (from `tourney_score`), away/left badges on player
  names; students strip below (kick available as today).
- **result**: settled bracket (winners bolded, connector advances), champion
  banner at the final; «Келесі жеребе» or (champion decided) «Марапаттау».
- **podium**: top-3 podium + full consolation standings table (place, name,
  wins, correct); Confetti; «Аяқтау» → `session.end()` → existing
  ResultsScreen + autosave.
- Actions in `use-teacher-session.ts`: `tourneyPair/tourneyStart/
  tourneyPodium` → `tourneyAdvance(...)`; 409s silently ignored.
- The 45-min room clock stays; firing mid-tournament ends the room exactly
  as today.

## 7. Strings (`src/lib/quiz/engine-strings.ts`)

All keys in BOTH `kz` and `ru`. KZ: «есептер қоры» never «банкі»; the mode
is «Турнир» in both languages. Key list (normative):
`tourney_mode`, `tourney_round_len`, `tourney_lockout`,
`tourney_server_unsupported`, `tourney_waiting_draw`, `tourney_your_opponent`,
`tourney_bye`, `tourney_lucky_loser`, `tourney_losers_pool`, `tourney_trio`,
`tourney_waiting_next`, `tourney_get_ready`, `tourney_locked`,
`tourney_you_won`, `tourney_you_lost`, `tourney_eliminated`,
`tourney_champion`, `tourney_draw_btn`, `tourney_start_round`,
`tourney_next_draw`, `tourney_podium_btn`, `tourney_finish`,
`tourney_round_n`, `tourney_final`, `tourney_semifinal`, `tourney_standings`,
`tourney_wins`, `tourney_away_badge`, `tourney_left_badge`,
`tourney_too_few`.

## 8. Tests (all must pass before commit)

- `scripts/bracket-sanity.js` (plain node): drives `server/bracket.js`
  through full tournaments at every roster size 2–35, plus: kicked mid-round,
  disconnected lucky-loser skipped, latecomer lands in losers pool, trio
  formation, bye chains (3 students → 2 rounds), determinism (same seeds →
  identical brackets), and the invariant sweep — every player appears in
  exactly one pair per round; winners+eliminated partition the duelists; the
  champion emerges at exactly `ceil(log2(N))`±lucky-loser-extension rounds;
  standings are a total order over all participants.
- `scripts/exact-port-parity.ts` (tsx, like `drill-sanity.ts`): fuzz ≥5000
  cases through BOTH `src/lib/drill/exact.ts` and `server/exact.js` —
  parse/equals results must match exactly (glyph strings: digits, `,`, `−`,
  `π`, `√`, `/`, malformed junk).
- `scripts/tourney-e2e.js` (plain node): starts `server/server.js` on a free
  port (env override), then drives the FULL protocol as 1 teacher + 5
  students over real HTTP+SSE: create session (config ack), join, draw
  (bye for the 5th), start, answers (correct/wrong/lockout-429/bad_seq-409/
  replay), settle at deadline, lucky loser next draw, kick, run to champion,
  podium, standings — asserting every event shape along the way.
- `npx tsc --noEmit` and `next build` clean.

## 9. File-change map

| File | Change |
|---|---|
| `server/server.js` | v9: tourney config sanitize, state machine, 3 `/tourney/*` endpoints, riders on /status /submit /session /resolve /live-snapshot, answer pipeline, presence relay, version 9 |
| `server/bracket.js` | NEW: pure bracket engine (§3) |
| `server/exact.js` | NEW: exact-value port (§2.5) |
| `server/add-tourney-to-nginx.sh` | NEW: allowlist helper (mirror race one) |
| `server/README.md` + `server/DEPLOY_V9_TOURNEY.md` | v9 section, 3-file deploy, endpoint table |
| `src/lib/quiz/live-client.ts` | §4 types + functions |
| `src/lib/quiz/use-tourney-session.ts` | NEW: student SSE hook |
| `src/lib/quiz/use-live-session.ts` | pass-through of `tourney` summary (additive) |
| `src/app/play/[quizId]/page.tsx` | `tourney=1` flag pass-through |
| `src/app/play/[quizId]/pack-quiz-client.tsx` | TournamentFlow + screens (§5), `seed` prop on GeneratedFlow/UploadedDrillLoader |
| `src/lib/quiz/use-teacher-session.ts` | tourney events/snapshot, actions, createRoom param, conflict tuple |
| `src/app/play/[quizId]/host/pack-console-client.tsx` | «Турнир» mode UI, buildTourneyConfig, link, ack check |
| `src/app/play/[quizId]/host/tourney-board.tsx` | NEW: bracket board (§6) |
| `src/lib/quiz/engine-strings.ts` | §7 keys (kz + ru) |
| `scripts/bracket-sanity.js`, `scripts/exact-port-parity.ts`, `scripts/tourney-e2e.js` | NEW: §8 |

## 10. Deploy order (for the user, after merge)

1. Vercel deploy (site understands tournament).
2. Hetzner: nginx allowlist add `/tourney` prefix → copy
   `server/server.js`, `server/bracket.js`, `server/exact.js` → `pm2 restart
   mathsabaq-live` → `curl /health` expects `"version":9`.
3. Nothing pack-side: existing drill generator quizzes work as-is.

Until 2, creating a tournament room fails with the explicit
`tourney_server_unsupported` error; self-paced and race are unaffected
throughout.

## 11. Accepted v1 risks (documented, deliberate)

- Generator code + round seed are client-visible → a determined student
  could precompute answers (typed input + lockout + 90s rounds keep the
  practical risk classroom-acceptable).
- No auto-advance / no manual early-close of a round: the clock always runs
  out (keeps every duel the same length; teacher paces everything else).
- Tournament state is memory-only like all rooms: a server restart mid-final
  loses the bracket (same durability waiver as every mode).
