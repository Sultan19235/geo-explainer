---
name: lesson-content
description: Author lesson content for the native lesson player at /labs/lesson — bulk .js lesson files (problems + theory, bilingual KZ/RU, free-form GeoGebra per problem) checked in the previewer and bulk-uploaded in /admin/lessons; native packs remain for special topics
---

# Authoring lesson content for the native lesson player

Two content sources feed the same player (`/labs/lesson/<topic>`); know which
one you are asked for:

1. **Lesson files (THE pipeline)** — one `.js` file per problem/theory topic,
   authored in bulk, checked locally in the previewer, bulk-uploaded via
   `/admin/lessons`. **No deploy needed** — content is data. The user (the
   site owner) authors these himself with Claude and checks each one; his
   explicit decision (2026-07-08): no website-based authoring forms, no
   converting his existing HTML apps.
2. **Native packs (special topics only)** — TypeScript packs + registry
   scenes in `src/lib/lesson/packs/` + `scenes.ts` (cylinder demo). Only for
   topics that want one shared parametrized model with animated scene steps
   (sliders, unfolds). These ship with a deploy.

## Lesson files — the complete spec

**Read these two before writing any file:**
`html-web-apps/lesson-files/FORMAT.md` (the format contract) and
`html-web-apps/lesson-files/SKILL.md` (the full authoring skill: toolkit
reference, pedagogy arc, figure recipes, checklist — portable, the teacher
also uses it in other Claude environments). Summary of the contract:

- One file = `/*__LESSON_META__ {json} __LESSON_META__*/` header (server
  parses it without executing) + `registerLessonProblem({...})` or
  `registerLessonTheory({...})`.
- `id` (slug) is the permanent identity — re-upload with the same id updates
  in place; `?q=` links and teachers' saved sets depend on it staying stable.
- Content = `statement`/`html` fields ({kz, ru} HTML with `\(…\)` KaTeX math,
  only the sanctioned `lf-formula` / `lf-given` / `lf-answer` / `lf-callout`
  classes) + `init(g)` + `steps[].run(g)` building the GeoGebra model with
  the toolkit `g` (same vocabulary as the old HTML template: `g.P`, `g.SEG`,
  `g.POLY`, `g.SECT`, `g.DIAG`, `g.show/hide`, `g.cap`, colors…).
- **True scale is law**: build at the problem's real numbers, frame via
  `fit: [x0,x1,y0,y1,z0,z1]`. Never shrink a figure to look nice.
- **Figure-less problems**: omit `init` (and all `run`s) — the player and
  previewer render the problem text-first, full-width, no GeoGebra pane.
- **Document-mode (word-problem) files**: a def with `explanation` instead
  of `steps` renders as a vertical mini page — statement on top, optional
  plain-JS `visual(root, ctx)` (SVG/HTML, emoji actors, animation), then
  the explanation hidden until the teacher reveals it; `wireExplanation`
  connects explanation buttons to the visual's handle. GeoGebra is not
  loaded for such files. Theory sections may use `visual` instead of `ggb`.
  Contract: FORMAT.md §1b; examples: `5-1-2/problem19.js`, `problem23.js`,
  `theory.js` §3. This is the DEFAULT style for grade 5–6 word problems
  (user decision 2026-07-23) — GeoGebra stays for geometry topics.
- **Steps only run forward**; going back replays init + steps 0..k on a
  clean board. Build everything in `init` hidden, reveal per step.
- Reference examples: `html-web-apps/lesson-files/cube/problem1.js` (problem
  with construction sub-steps) and `cube/theory.js`.

Runtime pieces (change these only deliberately, they are shared contracts):
- `public/lesson-runtime.js` — the toolkit implementation (site + previewer;
  copy to `html-web-apps/lesson-files/lesson-runtime.js` after edits).
- `src/lib/lesson/file-format.ts` — TS types + meta parser (upload server).
- `src/lib/lesson/file-loader.ts` — client loader/preloader.
- `html-web-apps/lesson-files/previewer.html` — standalone local checker.

## Workflow (lesson files)

1. Author `.js` files in bulk (bilingual, true scale, meta headers).
2. Check each in `previewer.html` (drop files; step through in KZ and RU).
3. `/admin/lessons` → topic → drag the folder in → set difficulty/tags/order
   in the quick-edit table.
4. Publish toggle controls visibility; drafts are viewable by admin only.
5. No commit, no deploy — content is live on save.

## Native packs (only when explicitly requested)

Pack format: `src/lib/lesson/types.ts`; scenes: `scenes.ts` (`SCENES`
registry, ops `{cmd|show|hide|set|anim|style}`, real coordinates + `fit`).
Blocks vocabulary: `p`, `given`, `find`, `formula`, `callout`, `answer`;
`{{param}}` substitution ties text to scene params. Reference:
`packs/cylinder.ts`. Wiring: `src/app/labs/lesson/lesson-client.tsx` +
`player-adapter.ts` (packs and files normalize into the same PlayerProblem /
PlayerTheory shapes). Scene gotchas: don't name objects `rad`/`tan`/`sin`
(GeoGebra parses as functions); captions can't compile LaTeX — use literal
`°`/unicode subscripts.

## Related-but-different systems (do not confuse)

- `topics`/`problems` tables + `/admin/topics`, `/admin/problems` = the OLD
  iframe-HTML pages at `/grades/…/learn` (legacy, still running).
- `lesson_topics`/`lesson_items` tables + `lessons` bucket
  (`lesson-player/…` prefix) + `/lesson-files/<id>` route = THIS pipeline.
- `/admin/quizzes` + `docs/QUIZ_PACK_FORMAT.md` = live-quiz packs (JSON).
- `lesson_sets` = teachers' saved problem selections; they reference lesson
  file `id`s — keep ids stable.

## Checklist before handing files to the user

- [ ] Meta header present, JSON valid, `id` matches the register call.
- [ ] KZ complete, RU present; math renders (`\(…\)`, doubled backslashes not
      needed in .js strings — only in TS).
- [ ] True scale + `fit` framing checked at the problem's real numbers.
- [ ] `init` builds everything hidden; each step reveals/moves forward only.
- [ ] Stepped through the whole file in previewer.html in both languages.
- [ ] `difficulty`/`tags` in meta so the bank cards are ready after upload.
