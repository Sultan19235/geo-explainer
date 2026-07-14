# MathSabaq Live Quiz Server

The realtime backend for live quizzes (Kahoot-style rooms): teachers create a
room from the embedded console, students join by QR and POST scores, the
teacher watches an SSE stream. Runs on the Hetzner box `89.167.9.192`
(`mathsabaq.online`) as pm2 app **`mathsabaq-live`**, port **3001**, behind
nginx. Sessions live in memory only — **by product decision there is no class
history**: when a session ends (or ages out after ~4h) it is gone. Nothing is
written to any database.

| Endpoint | Who | What |
|---|---|---|
| `POST /session` | teacher console | create room → `{code}` (token-gated when `QUIZ_TOKEN_SECRET` is set; 409 `active_room` if this teacher already has a live room — needs the token's uid) |
| `POST /start` / `POST /end` | teacher console | waiting → active → ended (`/end` also accepts an owner token instead of the hostSecret) |
| `POST /kick` | teacher console | remove one student; passive heartbeats can't re-register them, an explicit re-join can |
| `GET /status?code=&studentId=` | student page | poll state while waiting / after (+`kicked` verdict when studentId sent) |
| `GET /resolve?code=` | /join page | room code → `{status, title, studentPath}` (universal entrance) |
| `POST /submit` | student page | score heartbeat (15s) + immediate on answer/focus change; `joining:true` = deliberate (re-)join |
| `POST /leave` | student page | pagehide beacon (text/plain JSON) → student shows as "left"; a >45s-silent student in an active room is swept to "left" automatically |
| `GET /live?code=` | teacher console | SSE stream: `snapshot`, `update`, `kicked`, `started`, `ended` |
| `GET /health` | anyone | counts + which features are enabled |

## Config

Env vars, or a `.env` file next to `server.js` (see `.env.example`; real env
vars win):

- `PORT` — prod is `3001` (nginx proxies to it).
- `QUIZ_TOKEN_SECRET` — enables the `/session` auth gate (PLAN.md "Gate 2").
  See rollout order below. **Setting it on the box alone breaks room creation
  for consoles that don't send tokens.**

v2's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are gone — v3 removed
results persistence. If they're still in `/root/.env`, delete them (a
service-role key has no business sitting on a box that doesn't use it).

## Deploy (from the Mac, repo root)

```bash
ssh root@89.167.9.192 'cp /root/server.js /root/server.js.bak'   # rollback copy
scp server/server.js root@89.167.9.192:/root/server.js
ssh root@89.167.9.192 'pm2 restart mathsabaq-live && pm2 save'
curl -s https://mathsabaq.online/health                          # expect "version":7
```

Rollback: `ssh root@89.167.9.192 'cp /root/server.js.bak /root/server.js && pm2 restart mathsabaq-live'`

**v7 needs NO nginx change:** the room student-aid switches (`features`) ride
the EXISTING `/session`, `/status` and `/submit` paths — no new endpoint was
added, so the three steps above are the whole deploy. (Contrast v6, which
added `/kick` and `/leave` and required adding those to the nginx allowlist.)

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
