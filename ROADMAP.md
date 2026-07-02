# MathSabaq — Live Quiz Roadmap

Status of the live-quiz system (teacher launches a room → students join by QR →
scores stream to the teacher's dashboard in realtime). Covers the Hetzner
realtime backend ([server/](server/)) and the website pieces that talk to it.

_Last updated: 2026-07-02._

**Architecture at a glance:** Express + SSE backend on Hetzner (`89.167.9.192`,
pm2 `mathsabaq-live`, port 3001 behind nginx) · Next.js site on Vercel ·
Supabase for auth, content, and now quiz results. Sessions live in memory;
final results persist to Supabase on end. See [server/README.md](server/README.md).

---

## ✅ Done

### Safety / durability
- [x] Backend source recovered from the box and committed to git — v1 baseline
      (`8978f7b`), so it can never be lost to a wiped server again.
- [x] **Results persistence** — finished classes write to `quiz_session_results`
      (per-student scores, focus/tab-switch stats, reason ended). Migration
      [supabase/migrations/20260702080000_quiz_session_results.sql](supabase/migrations/20260702080000_quiz_session_results.sql).
      Live on the box (`/health` → `persistence:true`). Failed writes retry 3×
      then dump the row to pm2 logs as `PERSIST_FAILED` — never silently lost.
- [x] Reboot safety verified (pm2 resurrect) + documented `.bak` rollback path.

### Security
- [x] Auth gate ("Gate 2") built end-to-end: website [/api/quiz-token](src/app/api/quiz-token/route.ts)
      issues short-lived HMAC tokens to signed-in teachers; server verifies on
      `/session`. **Deployed but dormant** — activates only when `QUIZ_TOKEN_SECRET`
      is set on both sides (see rollout order below).
- [x] Abuse limits: max sessions, max students per room, name/title length caps.

### Efficiency
- [x] Server skips broadcasts when a student's visible state is unchanged.
- [x] Student heartbeat 5s → 15s (answers / focus changes still sent instantly).
      Together: ~3–4× less realtime load.

### Plumbing
- [x] Room codes collision-checked (v1 could overwrite a live class).
- [x] Admin upload stamps `QUIZ_ID` into consoles (attributes results to a quiz);
      optional `QUIZ_BACKEND_URL` rewrites `BACKEND` so the host can move via one
      env var. [src/app/admin/quizzes/actions.ts](src/app/admin/quizzes/actions.ts)
- [x] `server/README.md` runbook; `/health` reports version + enabled features.
- [x] Verified (lint, build, server smoke tests), shipped to Vercel prod (`917993b`).

---

## 🔜 Planned — near-term (small)

- [ ] **Confidence test** — run one real class, confirm a row lands in
      `quiz_session_results` (check the table, or pm2 logs for `PERSIST_FAILED`).
- [ ] **Re-upload the graph-quadratic console** through the admin panel so it
      gets `QUIZ_ID` stamped (results link to the quiz; works without it as
      `quiz_id: null`).
- [ ] **Turn on the auth gate** when ready to enforce paid-teacher-only rooms.
      Order matters (see below).

### Auth-gate rollout order
1. `openssl rand -hex 32` → the secret.
2. Vercel env `QUIZ_TOKEN_SECRET` → redeploy (activates `/api/quiz-token`).
3. Re-upload teacher consoles via admin (v2 consoles fetch the token).
4. **Only then** set the same secret in `/root/.env` on the box + restart.
   (Setting it on the box first locks out every existing console.)

---

## 🗓️ Planned — bigger (product & scale)

- [ ] **Teacher results-history UI** — a page reading back `quiz_session_results`
      (data layer exists; the screen does not).
- [ ] **Native React teacher console (Option 3)** — remove the iframe; share the
      site's theme, dark mode, and i18n. You'd stop uploading `teacher.html` and
      only upload the student quiz; the section/topic config moves to the DB/admin
      form. This is the original "make it feel native" goal.
- [ ] **Shared versioned student runtime** (`/quiz-runtime.v1.js`) so the quiz
      engine isn't copy-pasted into every topic file — fix a bug once, everywhere.
- [ ] **Horizontal scale — only when approaching a few hundred concurrent rooms:**
      Redis for session state + pub/sub (plain pm2 cluster won't work — workers
      wouldn't share the in-memory Map); second box + failover; nginx
      rate-limiting on `/session` and `/status`; CDN caching on `/play/q/[id]`.
- [ ] **Identify `mathsabaq-portal`** (`/root/portal/portal.js`) — the second pm2
      app on the box, purpose unknown.

---

## Scale target (for reference)

~5000 teachers/day × 30 students × 4×45-min periods → up to ~5000 concurrent
rooms, ~150k students, ~30k `/submit`/s at peak. Bandwidth is trivial
(~2–3 MB/lesson on the teacher's device); the real walls are single-core CPU
and durability — addressed incrementally above, not a rewrite.
