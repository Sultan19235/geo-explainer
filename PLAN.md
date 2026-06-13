# MathSabaq — Migration & Paywall Plan

> **Goal:** Bring the quiz apps into the Next.js website (`mathsabaq.online`, Vercel),
> gated behind teacher login + payment, while the live-quiz backend stays on Hetzner.
>
> **How to use this file:** Feed it to Claude Code in VS Code **one phase at a time**.
> Discuss → approve the plan → build one piece → `git commit` → move to the next.
> Do not let Claude Code build multiple phases in one go.

---

## The architecture in one picture

```
┌─────────────────────────────────────────────┐     ┌──────────────────────────────┐
│  VERCEL — mathsabaq.online                    │     │  HETZNER — api.mathsabaq.online│
│  Next.js + Supabase                           │     │  Node/Express (server.js)      │
│                                               │     │                                │
│  • Login + admin panel                        │     │  • POST /session  (token-gated)│
│  • /dashboard      (teacher's lessons)        │ ──▶ │  • POST /start    (token-gated)│
│  • /teacher/[slug] (gated teacher.html)       │     │  • POST /end                   │
│  • /public/play/<slug>/ (public student.html) │     │  • GET  /status                │
│  • /api/quiz-token (issues signed token)      │     │  • POST /submit                │
│                                               │     │  • GET  /live  (SSE)           │
└─────────────────────────────────────────────┘     │  • GET  /health                │
                                                      └──────────────────────────────┘
```

**Two gates, both needed:**
- **Gate 1 (Next.js):** decides who *sees* `teacher.html` — login + payment check.
- **Gate 2 (Hetzner):** decides who can *start a session* — signed token.
- Gate 1 alone is not enough: a saved copy of the file bypasses it. **Gate 2 protects the money.**

**Golden rules (do not break):**
- `server.js` quiz engine logic stays untouched EXCEPT the deliberate token check in Phase 6.
- Student files stay **public** (students join by QR with no account).
- Teacher files are **never** in `/public` — served only through the gated route.
- Don't take real payments until Phase 6 is done and tested.

---

## Phase 0 — Inventory (no code yet)

Have Claude Code report back; approve the picture before building.

- [ ] List existing Supabase tables + columns (users/teachers, roles, any payment tables).
- [ ] Describe how auth is wired (is there a Supabase server-client helper? middleware?).
- [ ] Locate the admin panel in the project + how it checks "is admin".
- [ ] Confirm repo locations for quiz files (`/public/play/...` and `/quiz-apps/...`).

**Why:** prevents duplicate tables / auth helpers. **No commit (read-only phase).**

---

## Phase 1 — Database: catalog + entitlements

Decision locked in: **teachers buy per GRADE** (matches "pay once per grade level").

**Table `lessons`** (the catalog you manage from admin):
| column | type | notes |
|---|---|---|
| id | uuid / serial | PK |
| slug | text unique | folder name, e.g. `graph-quadratic` |
| title_kk | text | display name (Kazakh) |
| grade | int | which grade this belongs to |
| published | bool | hidden vs visible to teachers |
| created_at | timestamptz | default now() |

**Table `entitlements`** (who can use which grade):
| column | type | notes |
|---|---|---|
| id | uuid / serial | PK |
| teacher_id | uuid | FK → users |
| grade | int | grade they paid for |
| granted_at | timestamptz | default now() |
| expires_at | timestamptz | nullable (null = no expiry) |

- [ ] Write migration for both tables.
- [ ] Add RLS: a teacher can `select` only their own `entitlements` rows.
- [ ] Admins can manage `lessons` and `entitlements`.

**Commit:** `feat: lessons + entitlements tables`

---

## Phase 2 — Get quiz files into the project (ONE app first)

Start with `graph-quadratic` only. Get it working end-to-end before adding others.

- [ ] Student file → `/public/play/graph-quadratic/index.html`
- [ ] Teacher file → `/quiz-apps/graph-quadratic/teacher.html` (NOT in /public)
- [ ] In that `teacher.html`, set `STUDENT_URL = 'https://mathsabaq.online/play/graph-quadratic/'`
- [ ] Leave `BACKEND` as-is for now (rename to `api.` happens in Phase 6)

**Commit:** `feat: import graph-quadratic quiz files`

---

## Phase 3 — Gated teacher route (Gate 1)

Create `app/teacher/[slug]/route.ts`:

1. Read Supabase session → not logged in → redirect `/login`.
2. Look up lesson by `slug` → not found or not `published` → 404.
3. Check `entitlements` for this teacher + lesson's grade → none → redirect `/pricing`.
4. Read `/quiz-apps/<slug>/teacher.html`, inject a watermark div with the teacher's email,
   return as HTML with `Cache-Control: no-store`.

Security: sanitize slug → `slug.replace(/[^a-z0-9-]/gi, '')` (blocks path traversal).

- [ ] Build the route.
- [ ] Test: entitled teacher → dashboard; logged-out → login; unpaid → pricing.

**Commit:** `feat: gated teacher route with watermark`

---

## Phase 4 — Teacher dashboard

Create `app/dashboard/page.tsx` (server component):

1. Get logged-in teacher.
2. Read their `entitlements` → owned grades.
3. Query `lessons` where `published = true` AND `grade` IN owned grades.
4. Render cards → each links to `/teacher/<slug>`.

- [ ] Build the page.
- [ ] Test: teacher sees only lessons for grades they own.

**Commit:** `feat: teacher dashboard listing entitled lessons`

---

## Phase 5 — Admin panel: manage catalog

Extend the existing admin panel (reuse its admin check):

- [ ] **List** all lessons (published + hidden).
- [ ] **Add lesson** form → writes row to `lessons` (title, slug, grade, published).
- [ ] **Edit / unpublish** a lesson.
- [ ] **Grant entitlement** form → pick teacher + grade → insert into `entitlements`
      (your manual "payment confirmed, give access" button until real payments exist).

> Note: the admin form registers the catalog entry + controls visibility.
> The HTML files are added to the repo separately (Phase 2). Admin ≠ file upload.

**Commit:** `feat: admin catalog + manual entitlement granting`

---

## Phase 6 — Backend token security (Gate 2 — the real lock)

Touches `server.js` deliberately. Go slow, commit each sub-step, test `/health` + a real
room creation after each change.

### 6a — Subdomain move
- [ ] DNS: A record `api.mathsabaq.online` → `89.167.9.192` (Namecheap BasicDNS).
- [ ] Certbot: `certbot --nginx -d api.mathsabaq.online`.
- [ ] Nginx: add `server_name api.mathsabaq.online;` proxying the 7 routes to :3001.
- [ ] Confirm `https://api.mathsabaq.online/health` returns JSON.
- [ ] Change `BACKEND` in all quiz files → `https://api.mathsabaq.online`.

### 6b — Token issuing (Next.js)
- [ ] `app/api/quiz-token/route.ts`: for a logged-in entitled teacher, return a short-lived
      JWT (~10 min) signed with a secret shared with Hetzner, containing teacher id + grade.

### 6c — Token use (teacher.html)
- [ ] Before calling `/session`, the teacher file fetches a token from
      `https://mathsabaq.online/api/quiz-token` and includes it in the request.

### 6d — Token verify (server.js)
- [ ] `/session` (and `/start`) reject any request without a valid, unexpired,
      correctly-signed token. Use the same shared secret.

**Result:** a saved/shared copy of `teacher.html` is useless — no token without a live
paid login. **Commit each sub-step separately.**

---

## Phase 7 — Deploy & verify

- [ ] Push to Vercel; add `mathsabaq.online` as custom domain; set Namecheap DNS per Vercel.
- [ ] Repoint apex to Vercel **only after** `api.` confirmed working.
- [ ] **Happy path (real phone):** login → dashboard → open lesson → create room →
      scan QR → student lands on `mathsabaq.online/play/...` → joins → scores stream live → end.
- [ ] **Negative tests:**
      - logged-out cannot open `/teacher/...`
      - unpaid teacher cannot open a lesson outside their grade
      - a copied `teacher.html` cannot create a room (token rejected)

---

## Launch priority

- **Phases 1–5** → you have a working product (login, catalog, dashboard, admin) and casual
  sharing is stopped. Safe to pilot with trusted teachers.
- **Phase 6** → protects revenue. **Do this before opening paid signups.**
- **Phase 7** → unifies the domain and ships it.

---

## On the security question, honestly

Anything delivered to a browser can be copied — this is true for every web product.
You cannot make free use *impossible*; you make it *useless and traceable*:

- **Token on the backend (Phase 6)** = the real lock. A copied file can't start a session.
- **Watermark with teacher email** = leaks are traceable to an account.
- **Activity logging by account + IP** = flags credential sharing (review manually, don't auto-ban).
- **`Cache-Control: no-store` + gated route** = stops casual saving / link-sharing.

Do Phase 6 and you move from "trivially copyable" to "must keep logging into the paid site" —
which is exactly where you want to be before charging money.
