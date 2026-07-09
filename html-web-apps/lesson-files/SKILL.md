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
| `g.col(n, g.RED)` | color — `g.BLUE RED GREEN ORANGE GRAY PURPLE DARK LIQUID` |
| `g.fill(n, 0.3)` `g.thick(n, 4)` `g.dash(n)` `g.lineStyle(n, s)` | style |
| `g.cap(n, "$a = 5$")` | caption (shown); simple LaTeX only — see §6 |
| `g.reveal(n, latex, color?)` | caption + optional recolor, only if n exists |
| `g.hideValue(n)` / `g.labelOff(n)` | hide caption/label |
| `g.pointSize(n, 4)` `g.lock(n)` | misc |
| `g.set(n, v)` / `g.get(n)` / `g.exists(n)` / `g.del(n)` | values/objects |
| `g.view("(1.3,-1.6,0.7)")` | re-aim camera mid-walkthrough |
| `g.hideAxes()` / `g.showAxes()` | axes are hidden by default |
| `g.api` | raw GeoGebra applet API for anything missing |

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
```

No custom styles, no scripts, no images, no other classes.

## 6. GeoGebra gotchas (hard-won — respect them)

- **Object names**: never `rad`, `tan`, `sin`, `cos`, `log`, `exp` (parsed
  as functions), never single `x y z e i`. Beware: `A1`-style names are
  spreadsheet cells — they work, but only in the 3D view context we run in.
- **Captions**: only simple LaTeX renders (`$A_1$`, `$a = 5$`, `$d$`).
  No `\frac`, `\sqrt`, `\Rightarrow` in captions — write `√` or plain text,
  keep rich math in the HTML steps instead.
- Degrees in captions: literal `°`, subscripts: unicode `₁₂₃` if not using
  `$…$` LaTeX indices.
- Right-angle marks: `g.cmd("ang1=Angle(B,A,S)")` shows a square for 90° —
  the player hides angle labels ≈90° is NOT automatic here; caption it
  yourself or leave unlabeled.
- Every `run` op is try/catch-wrapped at runtime — a typo won't crash the
  page, it will silently do nothing. So CHECK every step in the previewer.

## 7. Pedagogical structure (mirror the teacher's classroom style)

A problem's steps follow this arc (adapt count to the problem):

1. **«Қажетті формулалар» / «Необходимые формулы»** — the formulas/theorems
   used, as `lf-formula` boxes. Model: empty or base figure.
2. **Construction steps (2–4 short steps)** — build the figure piece by
   piece (“Табанын саламыз” → base appears; “Тік қырлары” → verticals…).
   One sentence of text per step explaining WHAT and WHY; the model reveals
   in sync. This is the signature of these lessons — never collapse it into
   one step.
3. **Solution steps (1–3)** — the mathematics, each with its formula box;
   the model highlights what the step talks about (`g.DIAG`, `g.SECT`,
   `g.reveal("eAB", "$a=5$")`).
4. **«Жауабы» / «Ответ»** — final computation + `lf-answer` box; the model
   shows its “beauty shot” (faces filled, key element highlighted).

Theory sections: definition → elements → key formulas (with labeled
formula boxes) → optional special cases. Each section's model shows exactly
what the section discusses.

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
   what's asked, the solution path, the answer. **Verify the math yourself**
   — recompute every answer before writing the file.
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
- [ ] Construction arc present (formulas → build-up → solution → answer).
- [ ] Only sanctioned lf-* classes; math delimiters `\\(…\\)` / `\\[…\\]`.
- [ ] No forbidden object names; captions use simple LaTeX only.

Reference implementations next to this file: `cube/problem1.js`,
`cube/theory.js`. Format contract: `FORMAT.md`.
