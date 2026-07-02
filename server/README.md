# MathSabaq Live Quiz Server

The realtime backend for live quizzes (Kahoot-style rooms): teachers create a
room from the embedded console, students join by QR and POST scores, the
teacher watches an SSE stream. Runs on the Hetzner box `89.167.9.192`
(`mathsabaq.online`) as pm2 app **`mathsabaq-live`**, port **3001**, behind
nginx. Sessions live in memory; final results are persisted to Supabase
(`quiz_session_results`) when a session ends.

| Endpoint | Who | What |
|---|---|---|
| `POST /session` | teacher console | create room → `{code}` (token-gated when `QUIZ_TOKEN_SECRET` is set) |
| `POST /start` / `POST /end` | teacher console | waiting → active → ended (end persists results) |
| `GET /status?code=` | student page | poll state while waiting / after |
| `POST /submit` | student page | score heartbeat (15s) + immediate on answer/focus change |
| `GET /live?code=` | teacher console | SSE stream: `snapshot`, `update`, `started`, `ended` |
| `GET /health` | anyone | counts + which features are enabled |

## Config

Env vars, or a `.env` file next to `server.js` (see `.env.example`; real env
vars win). Every feature degrades gracefully when unconfigured:

- `PORT` — prod is `3001` (nginx proxies to it).
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — enable results persistence.
  Requires the `quiz_session_results` migration to be applied. If Supabase is
  unreachable the server retries 3× and then dumps the row into pm2 logs as
  `PERSIST_FAILED {json}` — recoverable by hand, never silently lost.
- `QUIZ_TOKEN_SECRET` — enables the `/session` auth gate (PLAN.md "Gate 2").
  See rollout order below. **Setting it on the box alone breaks room creation
  for consoles that don't send tokens.**

## Deploy (from the Mac, repo root)

```bash
ssh root@89.167.9.192 'cp /root/server.js /root/server.js.bak'   # rollback copy
scp server/server.js root@89.167.9.192:/root/server.js
ssh root@89.167.9.192 'pm2 restart mathsabaq-live && pm2 save'
curl -s https://mathsabaq.online/health                          # expect "version":2
```

Rollback: `ssh root@89.167.9.192 'cp /root/server.js.bak /root/server.js && pm2 restart mathsabaq-live'`

First deploy also needs, on the box:

1. `nano /root/.env` — set `PORT=3001` + the Supabase pair (`.env.example`).
2. Apply `supabase/migrations/20260702080000_quiz_session_results.sql`
   (`supabase db push` from the repo, or paste into the dashboard SQL editor).
3. Reboot safety: `systemctl is-enabled pm2-root` — if not `enabled`, run
   `pm2 startup` (execute the command it prints) then `pm2 save`.

## Auth-gate rollout (do in this order, later is fine)

1. Generate a secret: `openssl rand -hex 32`.
2. Vercel → env var `QUIZ_TOKEN_SECRET` → redeploy (activates `/api/quiz-token`).
3. Re-upload teacher consoles via the admin panel (v2 consoles fetch the token;
   upload also stamps `QUIZ_ID` for results attribution).
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
