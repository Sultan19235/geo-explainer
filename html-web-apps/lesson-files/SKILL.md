---
name: lesson-file-author
description: Author MathSabaq lesson files in bulk — .js problem/theory files (bilingual KZ/RU, step-by-step GeoGebra walkthroughs, true scale) for the native lesson player; checked locally in previewer.html, bulk-uploaded via /admin/lessons
---

# Authoring MathSabaq lesson files (theory + problems)

You turn the teacher's raw material (textbook problems, photos, notes, lists)
into **lesson files**: one `.js` file per problem, one per theory topic.
The site's lesson player runs them on ONE shared GeoGebra applet; the teacher
checks every file locally in `previewer.html` before uploading. Your output
must work there on the first try.

Deliver **complete batches**: if the teacher gives 20 problems, produce 20
files + 1 theory file, consistently named (`problem1.js` … `problem20.js`,
`theory.js`), each self-contained.

## 1. File anatomy

Every file has TWO parts — a JSON meta header (the upload server reads it
without executing the file) and one register call. The `id` in both MUST
match. `id` is permanent: teachers' saved sets and share-links depend on it,
and re-uploading the same id updates the problem in place.

```js
/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "cube-diagonal-length",
  "number": "3",
  "title": { "kz": "Кубтың диагоналы", "ru": "Диагональ куба" },
  "difficulty": "med",
  "tags": [ { "kz": "диагональ", "ru": "диагональ" } ]
}
__LESSON_META__*/

registerLessonProblem({
  format: 1,
  id: "cube-diagonal-length",        // = meta id, lowercase slug [a-z0-9-]
  number: "3",
  title: { kz: "Кубтың диагоналы", ru: "Диагональ куба" },
  difficulty: "med",                  // easy | med | hard
  tags: [{ kz: "диагональ", ru: "диагональ" }],
  view: "3d",                         // "3d" (default) | "2d"
  home: "(1.3,-1.6,0.7)",             // camera direction
  fit: [-4, 4, -4, 4, -3, 3],         // visible box [x0,x1,y0,y1,z0,z1]

  statement: {                        // the condition — pinned, never scrolls
    kz: "<p>Кубтың қыры \\(a = 4\\). Диагоналын табыңыз.</p>",
    ru: "<p>Ребро куба \\(a = 4\\). Найдите его диагональ.</p>",
  },

  init(g) { /* build EVERYTHING once, hidden */ },

  steps: [
    { title: {kz,ru}, html: {kz,ru}, run(g) { /* optional */ } },
    // …
  ],
});
```

Theory file — same idea, sections instead of steps:

```js
/*__LESSON_META__
{ "format": 1, "kind": "theory", "id": "cube-theory",
  "title": { "kz": "Куб", "ru": "Куб" } }
__LESSON_META__*/

registerLessonTheory({
  format: 1,
  id: "cube-theory",
  title: { kz: "Куб — анықтамасы және формулалары", ru: "Куб — определение и формулы" },
  subtitle: { kz: "10-сынып · Стереометрия", ru: "10 класс · Стереометрия" },
  sections: [
    {
      title: { kz: "Анықтамасы", ru: "Определение" },
      html: { kz: "<p>…</p>", ru: "<p>…</p>" },
      view: "3d", home: "(1.3,-1.6,0.7)", fit: [-3.5,3.5,-3.5,3.5,-2.8,2.8],
      ggb(g) { /* this section's model — fresh board per section */ },
    },
    // text-only sections omit view/home/fit/ggb
  ],
});
```

## 2. The execution model (get this right or steps break)

- `init(g)` runs ONCE on a clean board. Build the complete figure **hidden**
  (`g.hide(...)` at the end of init), plus every auxiliary object any step
  will need (sections, diagonals, midpoints) — also hidden.
- Each step's `run(g)` moves the model **FORWARD ONLY**: reveal objects,
  recolor, add captions. It may assume the state left by all previous steps.
- Going **back** is automatic: the player wipes the board and replays
  `init` + `run` of steps 0..k. Never write "undo" code.
- A step may also create objects on the fly (`g.cmd`, `g.SECT`…) if they are
  step-specific — but prefer building in init and revealing.
- Theory sections are independent: each `ggb(g)` starts from a clean board.
- **No figure? Omit `init` entirely** (and `view`/`home`/`fit` and every
  step's `run`). The player then renders the problem text-first: full-width
  statement + walkthrough, no GeoGebra pane. Right for pure-text problems.
- **Word problems → document mode, NOT GeoGebra.** A def with `explanation`
  (instead of `steps`) becomes a vertical mini page: full-width statement,
  then an optional `visual(root, ctx)` drawn with plain SVG/HTML/JS (emoji
  actors, animations with their own ▶ button), then the explanation —
  hidden until the teacher clicks «Түсіндіруді көрсету» (rename via
  `explanationLabel`). `wireExplanation` (with `ctx.visual` = the visual's
  returned handle) lets the explanation annotate/replay the figure. Full
  contract + rules: FORMAT.md §1b.
- **Theory the same way, paged**: a theory file with no `ggb` section
  renders as one-section-per-slide with prev/next arrows (teacher-paced, not
  a long scroll) — per slide: title + text + `visual(root, ctx)` + optional
  hidden `explanation` (use it for question sections' answers).
  Reference examples: `5-1-2/theory.js` (statics, animated chase, hidden
  answers), `problem19.js` (static ray, reveal annotates), `problem23.js`/
  `problem24.js` (animated motion + replay), `problem25.js` (hop
  animation), `problem27.js` (angled-ray map).

## 3. The toolkit `g` (complete reference)

Construction (template-compatible defaults):

| Call | Creates |
| --- | --- |
| `g.P(n, x, y, z, cap?)` | point — blue, size 3, caption `$n$`, locked |
| `g.SEG(n, p, q)` | segment — blue, 3px, no label, locked |
| `g.POLY(n, [pts])` | polygon — blue, fill 0.10 |
| `g.SECT(n, [pts], color?)` | section — orange, fill 0.30 |
| `g.DIAG(n, p, q, color?)` | highlight segment — orange, 4px |
| `g.MID(n, p, q)` | midpoint — red, size 4 |
| `g.PT(n, expr, color?)` | computed point, e.g. `g.PT("H","ClosestPoint(fBot,S)")` |
| `g.cmd("…")` | any raw GeoGebra command |

Styling & visibility:

| Call | Effect |
| --- | --- |
| `g.show(names…)` / `g.hide(names…)` | visibility; accepts strings and arrays |
| `g.col(n, g.RED)` | color — `g.BLUE RED GREEN ORANGE GRAY PURPLE MAGENTA TEAL DARK LIQUID` |
| `g.fill(n, 0.3)` `g.thick(n, 4)` `g.dash(n)` `g.lineStyle(n, s)` | style |
| `g.cap(n, "$a = 5$")` | caption (shown); simple LaTeX only — see §6 |
| `g.reveal(n, latex, color?)` | caption + optional recolor, only if n exists |
| `g.hideValue(n)` / `g.labelOff(n)` | hide caption/label |
| `g.pointSize(n, 4)` `g.lock(n)` | misc |
| `g.set(n, v)` / `g.get(n)` / `g.exists(n)` / `g.del(n)` | values/objects |
| `g.view("(1.3,-1.6,0.7)")` | re-aim camera mid-walkthrough |
| `g.hideAxes()` / `g.showAxes()` | axes are hidden by default |
| `g.api` | raw GeoGebra applet API for anything missing |

**Color roles** — pick colors by MEANING so every object class is
distinguishable at a glance; never reuse a role's color for another role
in the same figure:

- `BLUE` — the solid itself (edges, faces, vertices) and nothing else;
- `RED` — **the goal, exclusively**: the sought element, its `= ?`
  caption, its final value. Red answers “what are we looking for?” at a
  glance — nothing else may ever be red;
- `GREEN` — the current step's working objects: key-triangle fills,
  right-angle marks that license a theorem, midpoints in play;
- `ORANGE` — given/emphasized KNOWN elements (a section given in the
  statement, a highlighted given segment);
- `PURPLE` — auxiliary construction (spokes, projections, heights),
  usually dashed — auxiliary lines must NEVER be blue, or they read as
  hidden edges of the solid;
- `MAGENTA` / `TEAL` — further independent elements;
- `GRAY` — de-emphasized leftovers.

## 4. TRUE SCALE — the non-negotiable rule

Build at the problem's real numbers. Edge `a = 4` → vertices span 4 units.
Length 2 in the text = length 2 in the model — captions and GeoGebra's
measuring tools must agree with the text. **Never shrink or normalize a
figure to “look nice”** — framing is `fit`'s job:

- `fit = [xmin, xmax, ymin, ymax, zmin, zmax]` = the figure's bounding box
  padded by ~15% on each side.
- Center the figure at the origin when natural (cube edge a: coordinates
  ±a/2), or put the base on z = 0 for “standing” bodies (pyramids, vessels).

## 5. HTML content rules

Bilingual always: `{ kz: "…", ru: "…" }` — KZ is mandatory, write RU too.
Math: `\\(…\\)` inline, `\\[…\\]` display (KaTeX). Decimal comma in both
languages (`226,2`). Allowed markup — `<p>`, `<b>`, and ONLY these classes:

```html
<div class="lf-given">\[ a = 4,\quad S = 150 \]</div>          <!-- data box -->
<div class="lf-formula">\[ d = a\sqrt{3} \]
  <div class="lf-formula-label">Диагоналы</div></div>          <!-- formula -->
<div class="lf-answer">Жауабы: \( d = 4\sqrt{3} \)</div>       <!-- answer -->
<div class="lf-callout">Модельді айналдырып көріңіз.</div>     <!-- hint -->
<b class="lf-find">…көлемін табыңыз</b>                        <!-- goal highlight -->
```

`lf-find` is INLINE (red pill): wrap the statement's find-phrase in it,
and the «Табу керек» symbol in step 1 — nothing else.

No custom styles, no scripts, no images, no other classes.

## 6. GeoGebra gotchas (hard-won — respect them)

- **Wrap every file in an IIFE**: `(function () { … })();` after the meta
  header. Files share the page's global scope — unwrapped helper functions
  overwrite each other across files and fail depending on load order.
- **Never `view: "2d"`** — `SetPerspective("G")` blanks the applet in the
  current web3d build. Flat content = default 3D view + top-down camera set
  inside `init`, TWO calls: `SetViewDirection((0,-1,0),false)` then
  `SetViewDirection((0,-0.001,1),false)`, then
  `g.api.setCoordSystem(x0,x1,y0,y1,-5,5)`; objects at `z = 0`. A single
  near-z direction keeps the previous azimuth (or toggles 180°) — the view
  then mirrors at random per rebuild; the off-axis jump pins it.
- **Lowercase tuple = VECTOR**: `pA=(3,0,0)` creates a vector (arrow from
  origin), not a point — GeoGebra decides by the first letter of the name.
  Points need an Uppercase name or explicit `pA=Point({3,0,0})`.
- **Object names**: never `rad`, `tan`, `sin`, `cos`, `log`, `exp` (parsed
  as functions), never single `x y z e i`. Beware: `A1`-style names are
  spreadsheet cells — they work, but only in the 3D view context we run in.
- **Captions**: only simple LaTeX (`$A_1$`, `$a = 5$`, `$d$`).
  No `\frac`, `\sqrt`, `\Rightarrow` in captions — write `√` or plain text,
  keep rich math in the HTML steps instead. The runtime converts simple
  `$…$` captions (letters, digits, `_1` indices, `^2`/`^3`) to plain
  unicode text automatically — GeoGebra's 3D view renders LaTeX captions
  as blurry low-res textures, plain text stays crisp. A caption the
  converter can't simplify falls back to (blurry) LaTeX, so keep captions
  simple.
- Degrees in captions: literal `°`, subscripts: unicode `₁₂₃` if not using
  `$…$` LaTeX indices.
- **Angles**: a bare `g.cmd("ang1=Angle(B,A,S)")` shows GeoGebra's default
  label — the object NAME leaks in (`ang1 = 30°`). NEVER leave that. Always
  either `g.cap("ang1", "30°")` (value only, degree sign) or
  `g.labelOff("ang1")`, and recolor with `g.col` (angles default to black).
  A 90° angle shows a square mark — caption it yourself or leave unlabeled;
  never rely on auto-hiding.
- Every `run` op is try/catch-wrapped at runtime — a typo won't crash the
  page, it will silently do nothing. So CHECK every step in the previewer.

## 7. Pedagogical structure — the FIXED explanation arc

Every problem follows ONE agreed arc:
**шарты → сурет → теория → жоспар → шешу → жауап.**
Depth scales with difficulty: easy ≈ 6–7 compact steps, hard ≈ 8–10 —
the extra depth goes into MORE solution steps (one per plan item), never
into construction narration.

Golden rule, restated for this arc: the theory box may contain only
STANDARD textbook facts in GENERAL letters — anything problem-specific
is still derived in its own solution step (**no rabbit out of a hat**).
Before writing steps, identify **the crux**: the one non-obvious idea
the problem turns on; on med/hard it gets its own step where the model
demonstrates WHY it is true (show the reason, not decorate the result).

1. **«Шарты» / «Условие».** The pinned statement wraps its find-phrase
   in `<b class="lf-find">…табыңыз</b>` — the red highlight is the first
   thing the student sees. Step 1 translates words → symbols in an
   `lf-given` box with two lines: **Берілгені:** the given values;
   **Табу керек:** the target symbol (`\(A_1C^2 = \,?\)`), also wrapped
   in `lf-find`. On hard statements this step additionally decodes the
   wording (“plane through the midpoints…”) so the student can point at
   what every phrase refers to. Model: empty board.

2. **«Сурет» / «Чертёж».** The COMPLETE figure in ONE step: the solid
   (blue), captions on the given values (givens ONLY — never derived
   numbers), and the sought element in RED with caption `$A_1C = ?$`.
   Text: 1–2 sentences locating the red object in space, plus an
   `lf-callout` inviting rotation when the 3D insight needs it.
   NO build-up narration («табанын саламыз… аяқтаймыз») — that
   demonstrates the software, not the mathematics. Exception: bodies of
   rotation, where how the solid is generated IS mathematical content —
   the generating rectangle/triangle gets its own beat.

3. **«Теория» / «Теория».** The toolbox: 2–3 GENERAL formulas, each in
   its own `lf-formula` box with its NAME in the label, in canonical
   textbook letters — `c^2 = a^2 + b^2`, `d^2 = a^2 + b^2 + c^2` —
   NEVER pre-fitted to the problem's segments (writing
   `A_1C^2 = AB^2 + …` here is forbidden: it does the recognition work
   for the student and isn't what they memorize for the exam). Show both
   the primitive tool AND the target theorem when both are standard; if
   the solution will derive the target theorem, say so in one line.
   More than 3 boxes = formula dump; cut. Model unchanged.

4. **«Шешу жоспары» / «План решения».** 2–4 VERBAL steps — the strategy,
   NO numbers, no computations; name theorems, don't apply them. Work
   backwards from the target when that's how the idea is found
   (“\(A_1C^2\) керек → тікбұрышты үшбұрыш керек → …”). This step
   answers the student's real question — “how would I think of this
   myself?” — and makes every later step feel inevitable. Model unchanged.

5. **Solution steps «1-қадам · …», «2-қадам · …»** — one step per plan
   item; the title names its plan item. Shape: claim → reason →
   computation. EVERY computation is the full chain, one equation per
   line, nothing done mentally:

   ```
   \[ c^2 = a^2 + b^2 \]                      ← general form, named in the text
   \[ AC^2 = AB^2 + BC^2 \]                   ← rewritten in OUR letters
   \[ AC^2 = 6^2 + 3^2 = 36 + 9 = 45 \]       ← numbers in, arithmetic written out
   ```

   Every number must be traceable: from the statement or from a previous
   visible line — no derived value ever appears out of nowhere. Flag
   reused intermediates (“\(AC^2 = 45\) — келесі қадамда керек”). The
   model shows the step's REASON: fill the working triangle (green),
   mark the right angle that licenses the theorem (green), auxiliary
   lines purple dashed.

6. **«Жауабы» / «Ответ».** `lf-answer` box + one or two closing lines:
   a sanity check (“\(\approx 7{,}8\) — ең ұзын қырдан ұзын, солай
   болуға тиіс”) and/or the method takeaway (often: the numbers
   reassemble into the theory box's general formula — close that loop if
   the theory step promised a derivation). Update the red element's
   caption from `= ?` to the found value. Model: beauty shot (faces
   filled).

Every step must answer three questions: what are we doing, why is it
valid, what did we get. One sentence suffices on the light beats
(шарты, сурет); use 2–3 where reasoning demands — never more.

Theory sections: definition → elements → key formulas, each with a
one-line “where it comes from” sketch (not bare boxes) → optional special
cases. Each section's model shows exactly what the section discusses.

## 8. Common figure recipes

Cube / rectangular parallelepiped (edge a, or a×b×c), centered:

```js
var h = a / 2;
g.P("A",-h,-h,-h,"$A$"); g.P("B",h,-h,-h,"$B$"); g.P("C",h,h,-h,"$C$"); g.P("D",-h,h,-h,"$D$");
g.P("A1",-h,-h,h,"$A_1$"); /* …B1 C1 D1… */
// 12 edges: g.SEG("eAB","A","B") …; 6 faces: g.POLY("fBot",["A","B","C","D"]) …
```

Pyramid: base polygon on z=0 + apex `g.P("S",0,0,H,"$S$")`, lateral edges
`g.SEG`. Height/apothem via `g.DIAG` + `g.MID`. Solids by command when
useful: `g.cmd("body=Cylinder((0,0,0),(0,0,5),2)")`, `Cone`, `Sphere`.
Perpendicular/inclined sets: foot points via `g.PT`, right angles small
`g.cmd("ang=Angle(…)")`, dashed projections `g.dash`.

## 9. Workflow & delivery

1. Read the teacher's material; extract per problem: numbers, what's given,
   what's asked, the solution path, **the crux** (the one non-obvious idea,
   §7), the answer. **Verify the math yourself** — recompute every answer
   before writing the file.
2. Write files: `problemN.js` per problem, `theory.js` per topic. Meta ids:
   `<topic>-<short-essence>` (`cube-diagonal-length`), stable forever.
3. Fill meta `difficulty` and 1–3 `tags` per problem (both languages) so
   the bank cards are ready without extra admin work.
4. Tell the teacher to check the batch in `previewer.html` (drop all files
   at once, step through in KZ and RU) and then bulk-upload the folder in
   `/admin/lessons`.

## 10. Checklist per file (run through it EVERY time)

- [ ] Meta header valid JSON; `id` matches register call; kind correct.
- [ ] KZ and RU complete everywhere (title, statement, every step, tags).
- [ ] Answer recomputed and correct; numbers in text = numbers in model.
- [ ] TRUE scale; `fit` covers the whole figure incl. captions margin.
- [ ] `init` builds all + hides all; steps only reveal/advance.
- [ ] Arc per §7: шарты (`lf-find` in statement + given/find box) →
      сурет (complete figure, givens captioned, goal RED `= ?`) →
      теория (general formulas, named) → жоспар (verbal) →
      1-қадам… (one per plan item) → жауап + sanity check.
- [ ] Theory box holds GENERAL letters only — no problem segments, no
      numbers, ≤ 3 formulas, each named; problem-specific facts are still
      derived in their own solution step (no rabbit out of a hat).
- [ ] Every computation is the full chain: general → our letters →
      numbers → result, one equation per line; every number traceable to
      the statement or an earlier visible line.
- [ ] Crux identified; on med/hard the model visually demonstrates WHY it
      is true in its own step.
- [ ] Only sanctioned lf-* classes; math delimiters `\\(…\\)` / `\\[…\\]`.
- [ ] No forbidden object names; captions use simple LaTeX only.
- [ ] Colors follow the §3 roles — RED means the goal and nothing else;
      auxiliary objects never blue.

Reference implementation next to this file: `parallelepiped/problem1.js`
(the pilot of this arc) — use it for both FILE FORMAT and pedagogy.
`cube/problem1.js`, `cube/theory.js` show the file format too, but files
authored before this revision follow older arcs — for pedagogy follow §7,
not them. Format contract: `FORMAT.md`.
