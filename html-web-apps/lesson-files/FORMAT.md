# MathSabaq lesson-file format (v1)

A **lesson file** is one plain `.js` file = one problem (or one theory
topic). The teacher authors these in bulk, checks each one in
`previewer.html` (double-click → drop files), and bulk-uploads them in
`/admin/lessons`. The site runs them inside the native lesson player on ONE
shared GeoGebra applet — switching problems is instant, no reloads.

Unlike the old HTML apps, a lesson file contains **no page, no styles, no
GeoGebra boot** — only content: texts (KZ/RU), steps, and the GeoGebra
instructions per step. The player and previewer provide everything else.

## 1. File skeleton (problem)

```js
/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "cube-volume-from-surface",
  "number": "1",
  "title": { "kz": "Куб — беті бойынша көлемі", "ru": "Куб — объём по площади поверхности" },
  "difficulty": "easy",
  "tags": [ { "kz": "көлем", "ru": "объём" } ]
}
__LESSON_META__*/

registerLessonProblem({
  format: 1,
  id: "cube-volume-from-surface",   // MUST equal meta id
  number: "1",
  title: { kz: "…", ru: "…" },
  difficulty: "easy",               // easy | med | hard (admin can override)
  tags: [{ kz: "…", ru: "…" }],
  view: "3d",                       // "3d" (default) | "2d"
  home: "(1.3,-1.6,0.7)",           // camera direction (SetViewDirection arg)
  fit: [-4.5, 4.5, -4.5, 4.5, -3.5, 3.5],  // visible box [x0,x1,y0,y1,z0,z1]

  statement: {                      // pinned condition (HTML + \( \) math)
    kz: "<p>Кубтың бетінің ауданы \\(150\\)-ге тең. Оның көлемін табыңыз.</p>",
    ru: "<p>Площадь поверхности куба равна \\(150\\). Найдите его объём.</p>",
  },

  init(g) {
    // Build EVERYTHING once (true scale!), hide what later steps reveal.
  },

  steps: [
    {
      title: { kz: "…", ru: "…" },
      html:  { kz: "<p>…</p>", ru: "<p>…</p>" },
      run(g) { /* move the model forward for this step (optional) */ },
    },
    // …more steps…
  ],
});
```

**Rules that make or break a file:**

- The `__LESSON_META__` JSON header is **mandatory** — the upload server
  indexes the file without executing it. `id` in the header and in the
  register call must match. `id` is the permanent identity: re-uploading the
  same id **updates** the problem in place (links and saved sets survive).
- **True scale**: build at the problem's real numbers (edge 5 → coordinates
  span 5) and frame with `fit`. Never scale the figure to “look nice” —
  captions and measuring tools must show the real values.
- **Steps only move FORWARD.** When the teacher goes back, the host replays
  `init` + `run` of steps 0..k on a cleaned board — so `run` may assume the
  state left by the previous steps and must not depend on being “undone”.
- Everything the steps `g.show(...)` must already exist from `init` (build
  hidden, reveal per step) — or be created inside `run` itself.
- Math in HTML: `\\(…\\)` inline, `\\[…\\]` display (KaTeX-rendered).
- KZ text is mandatory; always fill RU too.

**File-scoped helpers.** Lesson files execute in the page's shared global
scope (previewer AND site). Wrap the whole body after the meta header in
`(function () { … })();` — otherwise one file's helper functions overwrite
another's and problems break at random depending on load order.

**`view: "2d"` is broken — don't use it.** The current web3d GeoGebra build
destroys the view on `SetPerspective("G")` (blank panel, zero-size Graphics
view). For flat content (number rays, 2D figures) stay in the default 3D
view and look straight down, framing from INSIDE `init` (not `home`/`fit`):

```js
g.cmd("SetViewDirection((0,-1,0),false)");        // far off-axis first…
g.cmd("SetViewDirection((0,-0.001,1),false)");    // …then top-down, y up
g.api.setCoordSystem(x0, x1, y0, y1, -5, 5);      // 6-arg = the 3D view
```

BOTH camera calls are required. A single near-z direction is ambiguous:
GeoGebra keeps the previous azimuth (or toggles 180° per call for a pure
`(0,0,1)`), so the view comes out mirrored or upside-down depending on how
many times the scene was rebuilt. The far off-axis jump makes the final
rotation deterministic. Build objects at `z = 0`; renders identically to 2D.

**Figure-less problems (text-first).** A problem may **omit `init`** (and
all of `view`/`home`/`fit`/`axes`, and every step's `run`). That declares
"no figure": the player and previewer drop the GeoGebra pane and render the
statement + walkthrough full-width in larger classroom type. Use this for
pure-text problems (arithmetic, logic) — never pair an omitted `init` with
steps that call `run`, there is no board to draw on.

## 2. The toolkit `g`

Same vocabulary as the old HTML template, minus the applet argument:

| Call | Meaning |
| --- | --- |
| `g.cmd("A=(1,2,3)")` | raw GeoGebra command |
| `g.P(name,x,y,z,cap?)` | point (blue, size 3, caption `$name$`, locked) |
| `g.SEG(name,p,q)` | segment (blue, 3px, unlabeled, locked) |
| `g.POLY(name,[pts])` | polygon (blue, fill 0.10) |
| `g.SECT(name,[pts],color?)` | section polygon (orange, fill 0.30) |
| `g.DIAG(name,p,q,color?)` | highlighted segment (orange, 4px) |
| `g.MID(name,p,q)` / `g.PT(name,expr,color?)` | derived points (red) |
| `g.show(...names)` / `g.hide(...names)` | visibility (names or arrays) |
| `g.col(n,g.RED)` `g.fill(n,0.3)` `g.thick(n,4)` `g.dash(n)` | styling |
| `g.cap(n,"$a=5$")` / `g.reveal(n,latex,color?)` / `g.hideValue(n)` | captions |
| `g.pointSize(n,4)` `g.labelOff(n)` `g.lock(n)` | misc |
| `g.set(n,v)` / `g.get(n)` / `g.exists(n)` / `g.del(n)` | values/objects |
| `g.view("(1.3,-1.6,0.7)")` | aim the camera |
| `g.hideAxes()` / `g.showAxes()` | axes+grid (hidden by default) |
| colors | `g.BLUE g.RED g.GREEN g.ORANGE g.GRAY g.PURPLE g.DARK g.LIQUID` |
| `g.api` | the raw GeoGebra applet API when something is missing |

## 3. Sanctioned HTML classes (styled by player & previewer)

```html
<div class="lf-formula">\[ S = 6a^2 \]<div class="lf-formula-label">Толық беті</div></div>
<div class="lf-given">\[ R = 3,\; H = 8 \]</div>
<div class="lf-answer">Жауабы: \( V = 125 \)</div>
<div class="lf-callout">Модельді айналдырып көріңіз.</div>
<p>…<b class="lf-find">оның көлемін табыңыз</b>…</p>  <!-- goal highlight (red pill), inline -->
<p>Plain paragraphs…</p>
```

Nothing else — no custom styles, no scripts, no images-by-URL (for now).

## 4. Theory file

```js
/*__LESSON_META__
{ "format": 1, "kind": "theory", "id": "cube-theory",
  "title": { "kz": "Куб — анықтамасы", "ru": "Куб — определение" } }
__LESSON_META__*/

registerLessonTheory({
  format: 1,
  id: "cube-theory",
  title: { kz: "…", ru: "…" },
  subtitle: { kz: "10-сынып · Стереометрия", ru: "10 класс · Стереометрия" },
  sections: [
    {
      title: { kz: "Анықтамасы", ru: "Определение" },
      html: { kz: "<p>…</p>", ru: "<p>…</p>" },
      view: "3d", home: "(1.3,-1.6,0.7)", fit: [-3.5,3.5,-3.5,3.5,-2.8,2.8],
      ggb(g) { /* build this section's model (fresh board per section) */ },
    },
    // …text-only sections may omit view/home/fit/ggb entirely…
  ],
});
```

## 5. Workflow

1. Author files (this folder keeps examples: `cube/problem1.js`, `cube/theory.js`).
2. Open `previewer.html` → drop the files → click through every step in both
   languages; check the model like on the projector.
3. Keep the good ones; fix or discard the rest.
4. `/admin/lessons` → topic → drag the whole folder in.
5. In the table: set difficulty/tags/order (a couple of clicks each) →
   problems appear in the topic's bank drawer.

`lesson-runtime.js` in this folder is a copy of the site's runtime — replace
it when the site's `/lesson-runtime.js` is updated (version shows in the
previewer header).
