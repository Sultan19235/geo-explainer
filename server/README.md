# MathSabaq Live Quiz Server

The realtime backend for live quizzes (Kahoot-style rooms): teachers create a
room from the embedded console, students join by QR and POST scores, the
teacher watches an SSE stream. Runs on the Hetzner box `89.167.9.192`
(`mathsabaq.online`) as pm2 app **`mathsabaq-live`**, port **3001**, behind
nginx. Sessions live in memory only — **by product decision there is no class
history**: when a session ends (or ages out after ~4h) it is gone. Nothing is
written to any database.

Since v9 the server is **three files** deployed together: `server.js` (entry
point) plus the pure `require`d siblings `bracket.js` (tournament pairing/
settling engine) and `exact.js` (exact-value answer port). Both siblings are
dependency- and side-effect-free CommonJS so plain `node` test scripts
(`scripts/bracket-sanity.js`, `scripts/tourney-e2e.js`) can require them
without starting the server.

| Endpoint | Who | What |
|---|---|---|
| `POST /session` | teacher console | create room → `{code, hostSecret}` (token-gated when `QUIZ_TOKEN_SECRET` is set; 409 `active_room` if this teacher already has a live room — needs the token's uid). v8: optional `race` config → response adds `race:{qCount}` (the console's required ack); cap violations → 400 `race_too_large` / `race_invalid`. v9: optional `tourney` config (per-round seeds + answer keys) → response adds `tourney:{rounds}` (required ack); cap violations → 400 `tourney_too_large` / `tourney_invalid`; `race`+`tourney` together → 400 `mode_conflict` |
| `POST /start` / `POST /end` | teacher console | waiting → active → ended (`/end` also accepts an owner token instead of the hostSecret; race timers are killed on end) |
| `POST /kick` | teacher console | remove one student; passive heartbeats can't re-register them, an explicit re-join can (kicked students are excluded from race dist/board) |
| `GET /status?code=&studentId=` | student page | poll state while waiting / after (+`kicked` verdict when studentId sent; race rooms add the `race` summary — phase/qIndex/deadline/answered) |
| `GET /resolve?code=` | /join page | room code → `{status, title, studentPath}` (universal entrance; race rooms add `race:true`) |
| `POST /submit` | student page | score heartbeat (15s) + immediate on answer/focus change; `joining:true` = deliberate (re-)join. In race rooms client `score`/`total`/`answers` are IGNORED (server-owned); response adds the `race` summary |
| `POST /leave` | student page | pagehide beacon (text/plain JSON) → student shows as "left"; a >45s-silent student in an active room is swept to "left" automatically |
| `GET /live?code=` | teacher console | SSE stream: `snapshot`, `update`, `kicked`, `started`, `ended`; v8 adds `race` / `race_answer` events and a `race` field on the connect snapshot (mid-race console reload) |
| `GET /race/stream?code=&studentId=` | student page | v8 SSE stream for race rooms: individualized `state` connect snapshot, then `question` / `reveal` / `explain` / `podium` events (own per-IP cap `LIVE_MAX_RACE_SSE_PER_IP`, default 200) |
| `POST /race/answer` | student page | v8 `{code, studentId, qIndex, pick?\|given?}` — graded server-side at accept, one answer per question (first wins), 409 `bad_phase` outside the answer window |
| `POST /race/advance` | teacher console | v8 hostSecret-gated race state machine: `{action: next\|reveal\|explain\|podium\|auto, value?}`; illegal action → 409 `bad_phase` (double-click safe) |
| `GET /tourney/stream?code=&studentId=` | student page | v9 SSE stream for tournament rooms: individualized `state` connect snapshot, then `pairing` / `duel` / `tick` / `presence` / `result` / `podium` events (own per-IP cap `LIVE_MAX_TOURNEY_SSE_PER_IP`, default 200) |
| `POST /tourney/answer` | student page | v9 `{code, studentId, round, seq, given}` — graded server-side (exact-value port) at accept, strict seq order (replay/skip → 409 `bad_seq` + `expect`), wrong-answer lockout (409 window / 429 `locked` + `remainMs`); response echoes `right` + running `correct`/`wrong` |
| `POST /tourney/advance` | teacher console | v9 hostSecret-gated tournament state machine: `{action: pair\|start\|podium}`; illegal action → 409 `bad_phase`; first draw with <2 students → 409 `too_few`; keys exhausted → 409 `no_rounds_left`. Rounds settle on the clock — there is no manual close |
| `GET /health` | anyone | liveness + `"version":9`; counts/gates only with `LIVE_STATUS_KEY` |

## Config

Env vars, or a `.env` file next to `server.js` (see `.env.example`; real env
vars win):

- `PORT` — prod is `3001` (nginx proxies to it).
- `QUIZ_TOKEN_SECRET` — enables the `/session` auth gate (PLAN.md "Gate 2").
  See rollout order below. **Setting it on the box alone breaks room creation
  for consoles that don't send tokens.**

- `LIVE_MAX_RACE_SSE_PER_IP` — v8, max concurrent `/race/stream` connections
  per IP (default 200 — every racing phone holds one, and a single school NAT
  can front several whole classes; the teacher-stream cap stays separate).
- `LIVE_MAX_TOURNEY_SSE_PER_IP` — v9, max concurrent `/tourney/stream`
  connections per IP (default 200, same NAT reasoning as race).

v2's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are gone — v3 removed
results persistence. If they're still in `/root/.env`, delete them (a
service-role key has no business sitting on a box that doesn't use it).

## Deploy (from the Mac, repo root)

Since v9 THREE files ship together — `server.js` requires its two siblings at
boot, so a lone `server.js` copy will crash-loop pm2:

```bash
ssh root@89.167.9.192 'cp /root/server.js /root/server.js.bak'   # rollback copy
scp server/server.js server/bracket.js server/exact.js root@89.167.9.192:/root/
ssh root@89.167.9.192 'pm2 restart mathsabaq-live && pm2 save'
curl -s https://mathsabaq.online/health                          # expect "version":9
```

Rollback: `ssh root@89.167.9.192 'cp /root/server.js.bak /root/server.js && pm2 restart mathsabaq-live'`
(the stale `bracket.js`/`exact.js` can stay — pre-v9 servers never load them).

## v9 deploy — tournament mode (Турнир)

Spec: `docs/TOURNAMENT_MODE_SPEC.md`. Plain-language walkthrough for the
operator: `server/DEPLOY_V9_TOURNEY.md`. **v9 needs ONE nginx allowlist
entry**: all three new endpoints deliberately live under the single `/tourney`
path prefix (`/tourney/stream`, `/tourney/answer`, `/tourney/advance`), so one
prefix location covers the whole feature — helper script:
`server/add-tourney-to-nginx.sh` (mirrors the race one; inserts next to the
existing `/race` rule). Add it BEFORE restarting pm2 — a v9 site talking to a
box whose nginx still blocks `/tourney` fails room creation with the explicit
`tourney_server_unsupported` error (self-paced and race rooms are unaffected).

```nginx
location /tourney {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # /tourney/stream is SSE — buffering kills it
    proxy_read_timeout 24h;       # SSE connections are long-lived
}
```

Then the three-file deploy above; `curl -s https://mathsabaq.online/health`
must show `"version":9`.

Notes:

- **Three files**: `server.js` now does `require('./bracket')` and
  `require('./exact')` — deploy all three together or pm2 crash-loops.
- Tournament rooms are additive: a `/session` without a `tourney` field
  behaves byte-for-byte as v8, and the console REQUIRES the `tourney:{rounds}`
  ack in the `/session` response — a stale v8 box can never silently open a
  self-paced room behind a tournament board.
- Grading is server-side: `/tourney/answer` runs both the student's string and
  the console-pregenerated key through `exact.js` — a line-for-line port of
  `src/lib/drill/exact.ts`. Keep the two textually in sync (parity fuzz:
  `scripts/exact-port-parity.ts`). `/submit` ignores client
  `score`/`total`/`answers` in tournament rooms, same as race.
- Pairing/settling is deterministic: `bracket.js` takes all randomness from
  `mulberry32(roundSeed)`, so a bracket replays bit-for-bit from the config
  seeds (sanity battery: `scripts/bracket-sanity.js`; live-protocol e2e:
  `scripts/tourney-e2e.js`).
- Rounds settle on a server timer at `deadline + 1500ms` grace — there is no
  manual early-close; `/end`, the 45-min clock and eviction all clear it.

## v8 deploy — race mode (Жарыс)

Spec: `docs/RACE_MODE_SPEC.md`. **v8 needs ONE nginx allowlist entry**: all
three new endpoints deliberately live under the single `/race` path prefix
(`/race/stream`, `/race/answer`, `/race/advance`), so one prefix location
covers the whole feature. Add it BEFORE restarting pm2 — a v8 site talking to
a box whose nginx still blocks `/race` fails room creation with the explicit
"server doesn't support race" error (self-paced rooms are unaffected).

Prefix-location variant (preferred — future `/race/*` endpoints ride free):

```nginx
location /race {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # /race/stream is SSE — buffering kills it
    proxy_read_timeout 24h;       # SSE connections are long-lived
}
```

If the existing allowlist is built from exact locations instead, add all three
(`/race/stream` needs the SSE settings; the two POSTs can share the plain
proxy block the other POST endpoints use):

```nginx
location = /race/stream  { proxy_pass http://127.0.0.1:3001; proxy_http_version 1.1; proxy_set_header Connection ''; proxy_buffering off; proxy_read_timeout 24h; }
location = /race/answer  { proxy_pass http://127.0.0.1:3001; }
location = /race/advance { proxy_pass http://127.0.0.1:3001; }
```

Then the standard three deploy steps above; `curl -s
https://mathsabaq.online/health` must show at least `"version":8`.

Notes:

- **Body limit**: v8 raises `express.json` from the default 100kb to **1mb** —
  race configs carry explain-phase solution steps. If nginx caps request
  bodies (`client_max_body_size`), it must allow ≥1m on `/session`.
- Race rooms are additive: a `/session` without a `race` field behaves
  byte-for-byte as v7, and the console REQUIRES the `race:{qCount}` ack in
  the `/session` response — so a stale v7 box can never silently open a
  self-paced room behind a race board.
- Scoring, grading and per-question results are server-side in race rooms;
  `/submit` ignores client `score`/`total`/`answers` there. Input answers are
  graded by a port of `normalizeAnswer`/`checkInputAnswer` from
  `src/lib/quiz/pack.ts` — keep the two textually in sync.

**v7 needed NO nginx change:** the room student-aid switches (`features`) rode
the EXISTING `/session`, `/status` and `/submit` paths — no new endpoint was
added. (Like v6, which added `/kick` and `/leave`, v8 requires the nginx
allowlist step above.)

First deploy on a fresh box also needs:

1. `nano /root/.env` — set `PORT=3001` (see `.env.example`).
2. Reboot safety: `systemctl is-enabled pm2-root` — if not `enabled`, run
   `pm2 startup` (execute the command it prints) then `pm2 save`.

## Auth-gate rollout (do in this order, later is fine)

1. Generate a secret: `openssl rand -hex 32`.
2. Vercel → env var `QUIZ_TOKEN_SECRET` → redeploy (activates `/api/quiz-token`).
3. Re-upload teacher consoles via the admin panel (token-aware consoles fetch
   `/api/quiz-token` before POST `/session`).
4. Only then set the same `QUIZ_TOKEN_SECRET` in `/root/.env` + restart. From
   here room creation requires a signed-in teacher.

## Scale notes (target: ~5000 rooms / 150k students concurrent)

Room state is per-code and independent, so the design shards cleanly. In order:
1. Done in v2/clients: 15s heartbeats + skip-unchanged broadcasts (~3-4×).
2. Next wall is the single Node process (a few hundred rooms is fine; national
   scale is not): move `sessions` to Redis (state + pub/sub for SSE fan-out),
   run N workers. pm2 cluster mode alone will NOT work — workers wouldn't share
   the in-memory Map.
3. Then: second box + failover; nginx rate-limiting on /session and /status.
