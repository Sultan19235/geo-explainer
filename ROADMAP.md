# MathSabaq — Live Quiz Roadmap

Status of the live-quiz system (teacher launches a room → students join by QR →
scores stream to the teacher's dashboard in realtime). Covers the Hetzner
realtime backend ([server/](server/)) and the website pieces that talk to it.

_Last updated: 2026-07-02 (server v3)._

**Architecture at a glance:** Express + SSE backend on Hetzner (`89.167.9.192`,
pm2 `mathsabaq-live`, port 3001 behind nginx) · Next.js site on Vercel ·
Supabase for auth + content. Sessions live in memory only and evaporate when
they end — **no class history is saved, by design** (product decision,
2026-07-02). See [server/README.md](server/README.md).

---

## ✅ Done

### Safety
- [x] Backend source lives in git — v1 baseline `8978f7b`, hardened v2
      `917993b`, v3 in this commit. Can never be lost to a wiped server again.
- [x] Reboot safety verified (pm2 resurrect) + documented `.bak` rollback path.
- [x] ~~Results persistence~~ — built in v2, **removed in v3**: no class
      history, per product decision. The revert migration is
      [supabase/migrations/20260702120000_drop_quiz_session_results.sql](supabase/migrations/20260702120000_drop_quiz_session_results.sql)
      (the table only ever held one smoke-test row). Also delete the now-unused
      `SUPABASE_*` vars from `/root/.env` when deploying v3.

### Security
- [x] Auth gate ("Gate 2") built end-to-end: website [/api/quiz-token](src/app/api/quiz-token/route.ts)
      issues short-lived HMAC tokens to signed-in teachers; server verifies on
      `/session`. Verified against v3 locally: missing / garbage / wrong-secret
      / expired tokens all 401, valid token opens a room. **Dormant** until
      `QUIZ_TOKEN_SECRET` is set on both sides (rollout order in
      [server/README.md](server/README.md)).
- [x] Abuse limits: max sessions, max students per room, name/title length caps.

### Efficiency
- [x] Server skips broadcasts when a student's visible state is unchanged.
- [x] Student heartbeat 5s → 15s (answers / focus changes still sent instantly).
      Together: ~3–4× less realtime load.

### Native React quiz pages (2026-07-02)
- [x] **Teacher console** at [/play/graph-quadratic/teacher](src/app/play/graph-quadratic/teacher/page.tsx)
      (login-gated; fetches `/api/quiz-token` before `POST /session`, so Gate 2
      works unchanged). Setup → lobby (code + QR pointing at the React student
      page) → live cards over SSE → leaderboard. Section config lives in
      [src/lib/quiz/quadratic.ts](src/lib/quiz/quadratic.ts) (`SECTION_INFO`) —
      moving it to the DB/admin form is still the open product decision from
      "Option 3" below. **Not yet linked from the lesson page**: the quizzes
      tab still iframes the uploaded teacher.html.
- [x] [/play/graph-quadratic](src/app/play/graph-quadratic/page.tsx) — the
      student quiz rebuilt as a native Next.js page (join → lobby → quiz →
      results) sharing the site's design system; engine + session logic live in
      [src/lib/quiz/](src/lib/quiz/). Same `/status`+`/submit` protocol and the
      same `ms_graph_*` localStorage key, so it can replace the uploaded
      student HTML mid-semester without breaking reconnection. Backend host
      comes from `NEXT_PUBLIC_QUIZ_BACKEND_URL` (defaults to prod). **Not yet
      wired to the QR**: the admin upload still rewrites `STUDENT_URL` to
      `/play/q/<id>` (the uploaded-HTML route). Switching that rewrite to the
      React page is a product decision — the route is quiz-specific while the
      upload flow is generic.

### Plumbing
- [x] Room codes collision-checked (v1 could overwrite a live class).
- [x] Admin upload rewrites `STUDENT_URL` (QR → this quiz's `/play/q/<id>`
      page) and optionally `BACKEND` via the `QUIZ_BACKEND_URL` env var, so the
      live server can move hosts with one env change.
      (v2's `QUIZ_ID` stamping was removed along with persistence.)
- [x] `server/README.md` runbook; `/health` reports version + enabled features.

---

## 🔜 Remaining manual steps (need prod access; everything is staged)

1. **Deploy server v3 to the box** — commands in
   [server/README.md](server/README.md) (§ Deploy). Until then the box still
   runs v2 and keeps writing history rows. While there, remove `SUPABASE_URL`
   + `SUPABASE_SERVICE_ROLE_KEY` from `/root/.env`.
2. **Drop the results table** — run the drop migration in the Supabase
   dashboard SQL editor (or `supabase db push`).
3. **Re-upload the graph-quadratic quiz files** via `/admin/quizzes` (attach
   [quiz-apps/graph-quadratic/teacher.html](quiz-apps/graph-quadratic/teacher.html)
   + [public/play/graph-quadratic/index.html](public/play/graph-quadratic/index.html)
   as teacher/student files). The stored copies predate v2: console isn't
   token-aware, student file still heartbeats every 5s.
4. **Optional — turn on the auth gate** (paid-teacher-only rooms). Strict
   order in [server/README.md](server/README.md); step 3 must happen first.

---

## 🗓️ Later (product & scale)

- [ ] **Native React teacher console (Option 3)** — ~~remove the iframe~~ the
      console itself is built (see Done above); what remains is the product
      wiring: link/replace the lesson-page iframe, and decide how section/topic
      config is authored (DB/admin form vs. code) so consoles generalize beyond
      graph-quadratic.
- [ ] **Shared versioned student runtime** (`/quiz-runtime.v1.js`) so the quiz
      engine isn't copy-pasted into every topic file — fix a bug once,
      everywhere. Premature while there's a single quiz; revisit at ~3+.
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
(~2–3 MB/lesson on the teacher's device); the real wall is single-core CPU —
addressed incrementally above, not a rewrite. (Durability stopped being a wall
when class history was cut: a crashed box now loses at most the classes
currently on screen.)
