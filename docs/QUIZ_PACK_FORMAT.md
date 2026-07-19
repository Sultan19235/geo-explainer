# Quiz Pack Format (v1)

A **quiz pack** is one JSON file that describes a whole live quiz for the
MathSabaq quiz engine. Upload it in the admin panel (Quizzes → pack.json
field) — the engine renders the student page and the teacher console from it.
No HTML needed.

> Give this document to an AI assistant together with your questions and ask
> it to produce a pack file. The admin panel validates every upload and lists
> precise errors if something is off.

## Minimal example

```json
{
  "version": 1,
  "title": "Жай бөлшектер",
  "questions": [
    {
      "text": "Есепте: $\\frac{1}{2} + \\frac{1}{4}$",
      "options": ["$\\frac{3}{4}$", "$\\frac{2}{6}$", "$\\frac{1}{6}$", "$\\frac{2}{4}$"],
      "correct": "A"
    }
  ]
}
```

## Full schema

```jsonc
{
  "version": 1,                  // required, always 1
  "title": "…",                  // required — string or {"kz": "…", "ru": "…"}
  "description": "…",            // optional, shown on the student join screen
  "formulas": ["…"],             // optional help sheet behind the "Formulas" button
  "shuffleQuestions": false,     // optional — random question order per student
  "shuffleOptions": false,       // optional — random option order per student
  "tagGroups": [ /* optional console filters, see below */ ],
  "questions": [ /* 1–200 questions, see below */ ]
}
```

Note: the teacher can also force per-student shuffling for a single room from
the console ("Кездейсоқ рет"), regardless of the pack's `shuffle*` defaults.

### Text fields and languages

Every text field (`title`, `description`, `formulas[]`, question `text`,
`options[]`, `solution[]`) accepts either:

- a plain string → treated as Kazakh (shown for both languages), or
- `{"kz": "…", "ru": "…"}` → the student's KZ/RU toggle picks one
  (missing `ru` falls back to `kz`).

Math is written **inline KaTeX between dollar signs**: `"Есепте: $x^2-4=0$"`.
Display math uses `$$…$$`. Remember to double backslashes in JSON:
`"$\\frac{1}{2}$"`.

### Question types

**1. Multiple choice (`options` present):**

```json
{
  "text": "Жақшаны аш: $-3(x-6)$",
  "options": ["$-3x+18$", "$3x-18$", "$-3x-18$", "$3x+18$"],
  "correct": "A"
}
```

- 2–6 options; `correct` is a letter `"A"…"F"` or a 0-based index (`0`…`5`).

**2. Typed answer (no `options`, has `answer`):**

```json
{
  "text": "Теңдеуді шеш: $2x + 6 = 10$",
  "answer": "2",
  "accept": ["x=2", "х=2"]
}
```

- Checking is forgiving: spaces are ignored, case-insensitive, `2,5` = `2.5`.
- `accept` lists extra accepted spellings (optional).

**3. Drill (`"type": "drill"`) — on-screen keypad, exact math checking:**

```json
{
  "type": "drill",
  "text": "Бұрыштың радиандық өлшемін тап: $120°$",
  "answer": "2π/3",
  "solution": ["$120° = 120 \\cdot \\frac{\\pi}{180} = \\frac{2\\pi}{3}$"]
}
```

- Students answer on a **keypad** (digits + only the extra keys the answer
  needs), not a text field — built for phones.
- **Write `answer` exactly as a student would type it**: `"120"`, `"-8"`,
  `"43,5"` (decimal comma), `"7/18"`, `"2π/3"`, `"π"`, `"3π"`, `"√2/2"`,
  `"2√3"`. The validator rejects anything not typeable on the keypad.
- Checking is **exact math**, not text: `4/6` = `2/3`, `0,50` = `0,5`,
  `√12/2` = `√3`, and `2π/3` never equals `2,09`. No `accept` field —
  equivalents are automatic.
- The keypad's extra keys (`,` `−` `π` `√` `/`) are inferred from the answer.
  To offer extra keys (e.g. let students type `1/2` when the answer is
  written `"0,5"`), add `"keys": ["comma", "frac"]` — choices are `"comma"`,
  `"minus"`, `"pi"`, `"frac"`, `"sqrt"` (π and √ share one keypad slot).
- In race rooms drill questions grade server-side by normalized text, so the
  canonical form matches but distant equivalents (`4/6` for `2/3`) may not —
  fine in practice since the keypad steers students to the canonical form.

**Drill visuals (`"visual"`, optional)** — a drill question can carry a
lightweight picture under its prompt. Two bricks; the engine owns colors and
sizes, the pack only describes what to show. Parts listed in `reveal` /
`arrows` appear **only after the student answers** — the "why" picture.

`number-line` (integer/decimal hops):

```json
"visual": {
  "type": "number-line",
  "min": -10, "max": 10,
  "points": [-3],
  "arrows": [{ "from": 0, "to": -3 }, { "from": -3, "to": 2 }]
}
```

Span (`max − min`) ≤ 200; `points` and arrow ends must lie inside
`[min, max]`.

`figure` (any static picture — bar models, unit circle, angles, simple
geometry) described as a shape list in math coordinates, y grows upward:

```json
"visual": {
  "type": "figure",
  "view": { "xMin": 0, "xMax": 10, "yMin": -2, "yMax": 4 },
  "shapes": [
    { "kind": "polygon", "points": [[0,0],[3,0],[3,2],[0,2]], "fill": true, "color": "green" },
    { "kind": "polygon", "points": [[3,0],[9,0],[9,2],[3,2]] },
    { "kind": "label", "at": [1.5, 3], "text": "20", "color": "green" },
    { "kind": "label", "at": [4.5, -1], "text": "?" }
  ],
  "reveal": [
    { "kind": "arrow", "from": [3, 3], "to": [9, 3], "color": "red" },
    { "kind": "label", "at": [6, 3.6], "text": "60", "color": "red" }
  ]
}
```

Shape kinds: `segment {from,to,dash?}` · `arrow {from,to}` ·
`circle {center,radius,fill?}` · `arc {center,radius,startDeg,endDeg,arrow?}`
· `point {at,label?}` · `label {at,text}` (plain text, unicode `π√°` fine,
≤ 24 chars — **no `$...$`**) · `polygon {points,fill?}`. Every shape takes an
optional `"color"`: `blue` (default), `red`, `green`, `orange`, `slate`.
At most 80 shapes (`shapes` + `reveal`). Keep `view` proportions square-ish —
x and y use the same scale so circles stay round. Add `"grid": true` /
`"axes": true` for a background grid or x/y axes. `visual` exists on **drill
questions only** — mcq/input questions use `geogebra` or `image` instead.

**Drill generator packs** (endless machine-made problems) need no question
list — name a registered drill topic instead; the teacher picks the option
ticks at room start, and `config` (optional) narrows what's offered:

```json
{
  "version": 1,
  "title": { "kz": "Ондық бөлшектер", "ru": "Десятичные дроби" },
  "generator": {
    "type": "drill",
    "topic": "decimal-add",
    "config": { "places": ["1"] }
  },
  "questions": []
}
```

Topics live in `src/lib/drill/registry.ts`; the admin "Интерактив генератор"
dropdown builds these packs without any file. Custom generators can also be
**uploaded as .js files** (admin form, "generator .js" field) — authored per
`docs/DRILL_GENERATOR_FORMAT.md`, tested at `/labs/drill/file`, validated
automatically at upload. Their packs carry `"file": true` plus a
`fileOptions` snapshot and are written by the admin action — never by hand.

### Optional per-question fields

```jsonc
{
  "id": "p17",              // stable id; auto-numbered when omitted
  "image": "https://…",     // picture above the options
  "geogebra": {             // GeoGebra figure built from commands
    "view": "3d",           // "3d" or "2d" (default 2d/classic)
    "height": 360,          // px, 200–800
    "commands": ["prism = Prism((0,0,0), (12,0,0), (12,12,0), (0,12,0), (0,0,14))"]
  },
  "theory": [               // the question's "Формулалар" panel (see below)
    "Көк дене — тік призма, қызыл кесінді — жақ диагоналі.",
    "Призма көлемі: $V = S_{табан} \\cdot h$",
    "Пифагор теоремасы: $c^2 = a^2 + b^2$"
  ],
  "hints": [                // progressive hints, revealed ONE at a time
    "Диагональ, биіктік және табан қабырғасы қандай үшбұрыш құрайды?",
    "Сол тікбұрышты үшбұрышқа Пифагор теоремасын қолдан."
  ],
  "solution": [             // worked steps, revealed after answering
    "Табан ауданы: $S = a^2 = 144 \\Rightarrow a = 12$",
    "Диагональ: $d = \\sqrt{2a^2 + h^2} = 22$"
  ],
  "solutionGeogebra": [     // extra commands run on the figure at reveal
    "tri = Polygon((0,0,0), (12,12,0), (12,12,14))",
    "SetColor(tri, \"#dc2626\")", "SetFilling(tri, 0.25)"
  ],
  "solutionSteps": [ /* race explain phase, lesson-style steps — see below */ ],
  "timeSec": 60,            // race mode: suggested time limit, whole seconds 5–600
  "tags": ["cube", "easy"]  // ids from tagGroups (see below)
}
```

- **`theory`** sits behind the question's «Формулалар» button. Structure it as:
  (1) one–two sentences saying what the figure shows and what the colored
  parts mean, then (2) the **general** formulas this problem type needs
  (Pythagoras, $V = S \cdot h$, …) — never this question's numbers plugged
  in. Questions without `theory` fall back to the pack-level `formulas`
  sheet, so authoring it per question is strongly preferred.
- **`hints`** (max 6) reveal one at a time behind the «Кеңес» button. Hint 1
  is an orientation nudge ("which triangle does the diagonal form?"); the
  last hint may set up the equation but must never state the answer.
- **`solutionGeogebra`** requires `geogebra` and runs once when the solution
  is revealed — highlight the triangle the solution uses, draw the height,
  mark the angle. The figure auto-opens at reveal when this field exists.

### Race mode fields (`solutionSteps`, `timeSec`)

Race rooms (Жарыс) run every phone on a shared timer and end each question
with a teacher-triggered **explain phase** (Түсіндіру): a worked solution
shown big on the class board (under the teacher pen) and on every student's
phone. Two optional per-question fields feed it. Self-paced rooms ignore
both, so adding them never changes how an existing quiz behaves.

- **`timeSec`** — suggested time limit for this question in a race, a whole
  number of seconds from **5 to 600**. The teacher console pre-fills the
  per-question timer with it (the teacher can still change it per room).
  Rule of thumb: ~20–30 s for a conceptual choice, 45–90 s for a computation.
- **`solutionSteps`** — the worked solution in the lesson-player step format
  (max **12 steps**, **30 blocks per step**). When present it is shown in the
  explain phase instead of the flat `solution` list; when absent the flat
  `solution` is shown; a question with neither has no explain button. The
  flat `solution` keeps its normal self-paced role either way.

Each step is `{"name": …, "blocks": […]}` — `name` is the step title
(«Берілгені» / «Шешуі» / «Жауабы»). Block types: `p` (paragraph), `given`
(a "дано" line in KaTeX), `find` (what must be found), `formula` (a display
formula, optional `label`), `callout` (highlighted note, optional `title`),
`answer` (the final boxed answer). `name`/`text`/`label`/`title` localize
like every other text field; `given`/`formula` carry raw KaTeX in `latex`
(math is language-neutral, so it is written once).

```jsonc
{
  "text": { "kz": "Кубтың қыры $3$-ке тең. Кубтың көлемін табыңдар.",
            "ru": "Ребро куба равно $3$. Найдите объём куба." },
  "options": ["$27$", "$9$", "$18$", "$81$"],
  "correct": 0,
  "timeSec": 30,
  "solutionSteps": [
    {
      "name": { "kz": "Берілгені", "ru": "Дано" },
      "blocks": [
        { "type": "given", "latex": "a = 3" },
        { "type": "find", "text": { "kz": "кубтың көлемін ($V$).",
                                     "ru": "объём куба ($V$)." } }
      ]
    },
    {
      "name": { "kz": "Шешуі", "ru": "Решение" },
      "blocks": [
        { "type": "p", "text": { "kz": "Кубтың көлемі қырының кубына тең:",
                                  "ru": "Объём куба равен кубу его ребра:" } },
        { "type": "formula", "latex": "V = a^3",
          "label": { "kz": "Куб көлемі", "ru": "Объём куба" } },
        { "type": "formula", "latex": "V = 3^3 = 27" }
      ]
    },
    {
      "name": { "kz": "Жауабы", "ru": "Ответ" },
      "blocks": [ { "type": "answer", "text": "$V = 27$" } ]
    }
  ]
}
```

> **Deploy order matters.** The validator strips unknown fields from every
> pack it loads, so a site build that predates `solutionSteps` silently
> deletes the field on download — the quiz works, but the explain phase shows
> only the flat `solution` (or nothing). Upload packs that use
> `solutionSteps`/`timeSec` **only after** the release documenting this
> section is live in production.

### Drawing figures with GeoGebra commands

The `geogebra.commands` list is replayed one-by-one into a live GeoGebra
applet (`view: "3d"` → the 3D app, otherwise the classic 2D app). **An invalid
command makes GeoGebra show an error popup on the student's screen** — the
engine cannot suppress it — so every command must be real GeoGebra syntax.
AI assistants routinely invent commands that look right but don't exist;
follow this recipe instead of improvising.

**1. Start every 3D figure with the camera boilerplate:**

```json
"commands": [
  "SetPerspective(\"T\")",
  "SetViewDirection((1.2, -1.5, 0.8))",
  "ShowAxes(false)",
  "ShowGrid(false)",
  "ZoomIn(-2, -2, -2, 14, 14, 16)"
]
```

`ZoomIn(xmin, ymin, zmin, xmax, ymax, zmax)` is the bounding box of your
figure plus ~2 units of margin on every side — get this wrong and the solid
is cropped or tiny. For 2D figures use `ZoomIn(xmin, ymin, xmax, ymax)` and
keep axes/grid only if the question needs them.

**2. One command per array element.** Never join commands with semicolons or
newlines inside one string.

**3. Name everything, then style it.** Styling commands only work on objects
that already have a name:

```json
"prism = Prism((0,0,0), (12,0,0), (12,12,0), (0,12,0), (0,0,14))",
"SetColor(prism, \"#3b82f6\")",
"SetFilling(prism, 0.12)"
```

**4. Use only the verified vocabulary.** These are proven to work in the
engine — anything outside this list must be tested in preview first:

- *Solids & shapes:* `Prism(pt, pt, …, apexOrTopPt)`, `Pyramid(…)`,
  `Cylinder((0,0,0), (0,0,8), 3)`, `Cone((0,0,0), (0,0,6), 4)`,
  `Sphere((0,0,0), 5)`, `Cube`, `Polygon(pt, pt, …)`, `Segment(pt, pt)`,
  `Angle(pt, vertexPt, pt)`, `Circle`, `Text("…", pt)`
- *Styling:* `SetColor`, `SetFilling`, `SetLineThickness`, `SetLineStyle`,
  `SetCaption`, `SetLabelMode`, `ShowLabel`, `SetPointSize`
- *View:* `SetPerspective("T")`, `SetViewDirection`, `ShowAxes`, `ShowGrid`,
  `ZoomIn`

**5. Write literal coordinates.** Compute every vertex yourself and write
numbers like `(12,0,14)` — never ask GeoGebra to intersect, reflect or
otherwise derive points. Don't mix 2D points into a 3D view or vice versa.

**6. Label measurements the standard way.** A length on a segment:

```json
"hSeg = Segment((12,0,0), (12,0,14))",
"SetCaption(hSeg, \"14\")",
"SetLabelMode(hSeg, 3)",
"ShowLabel(hSeg, true)"
```

A free-floating value: `"lbl = Text(\"S = 144\", (6, 6, 0.4))"` plus
`SetColor(lbl, "#111827")`. `Text` takes **plain Unicode** (`"8√2"`, `"60°"`),
not LaTeX. Mark a right angle with `Angle(A, B, C)` and `ShowLabel(ang, false)`.

**7. Mind the JSON escaping.** Color values and captions are quoted *inside*
a JSON string: `"SetColor(prism, \"#2563eb\")"`. Unescaped inner quotes are
the most common way a generated pack breaks.

**8. Proof every figure before upload.** Save the pack as
`packs/dev-preview.json` and open `/play/dev-preview?preview=1` — click
through every question. A figure must render **with zero popups**; any popup
means one of the commands is invalid.

A complete verified figure (working example from the production prism pack —
give it to your AI assistant as the pattern to copy):

```json
"geogebra": {
  "view": "3d",
  "height": 360,
  "commands": [
    "SetPerspective(\"T\")",
    "SetViewDirection((1.2, -1.5, 0.8))",
    "ShowAxes(false)",
    "ShowGrid(false)",
    "ZoomIn(-2, -2, -2, 10, 10, 8)",
    "prism = Prism((0,0,0), (8,0,0), (0,8,0), (0,0,6))",
    "SetColor(prism, \"#2563eb\")",
    "SetFilling(prism, 0.12)",
    "SetLineThickness(prism, 1)",
    "hypSeg = Segment((8,0,0), (0,8,0))",
    "SetColor(hypSeg, \"#1e293b\")",
    "SetLineThickness(hypSeg, 2)",
    "SetCaption(hypSeg, \"8√2\")",
    "SetLabelMode(hypSeg, 3)",
    "ShowLabel(hypSeg, true)",
    "faceDiag = Segment((0,0,0), (8,0,6))",
    "SetColor(faceDiag, \"#dc2626\")",
    "SetLineThickness(faceDiag, 4)",
    "SetCaption(faceDiag, \"10\")",
    "SetLabelMode(faceDiag, 3)",
    "ShowLabel(faceDiag, true)",
    "rightAng = Angle((8,0,0), (0,0,0), (0,8,0))",
    "SetLineThickness(rightAng, 1)",
    "ShowLabel(rightAng, false)"
  ]
},
"solutionGeogebra": [
  "triSol = Polygon((0,0,0), (8,0,0), (8,0,6))",
  "SetColor(triSol, \"#7c3aed\")",
  "SetFilling(triSol, 0.2)"
]
```

### Figure style (colors that survive a phone screen)

The figure is redrawn from your commands, so readability is an authoring
convention. Every pack must follow this palette:

| Role | Command | Value |
| --- | --- | --- |
| Solid bodies / fills | `SetColor(obj, "#3b82f6")` + `SetFilling(obj, 0.12)` | light blue, nearly transparent |
| Secondary edges, dashed helpers | `SetColor(obj, "#2563eb")` + `SetLineThickness(obj, 3)` | medium blue, thin |
| THE key element (the segment/angle being asked about) | `SetColor(obj, "#dc2626")` + `SetLineThickness(obj, 6)` | red, thick — **only one red thing per figure** |
| Labels & measurements (`S = 144`, `14`, angles) | `Text(...)` + `SetColor(txt, "#111827")`, or segment `SetCaption` | near-black, never yellow/pastel |

Rules of thumb: fills must never hide what is behind them (≤ 0.15 filling);
every number a student needs must be a dark text object big enough to read on
a 6-inch screen; never use yellow, light green or gray for anything
meaningful.

### Tags (console filters)

Tags let the teacher filter the question picker ("cube", "easy", …) when
building a room. They are **console-only** — students never see them. Declare
the vocabulary at the pack level, then reference tag ids on questions:

```jsonc
{
  "tagGroups": [
    {
      "id": "topic",                                    // a dimension of tags
      "label": { "kz": "Тақырып", "ru": "Тема" },       // optional
      "tags": [
        { "id": "cube", "label": { "kz": "Куб", "ru": "Куб" } },
        { "id": "prism", "label": { "kz": "Призма", "ru": "Призма" } }
      ]
    },
    {
      "id": "difficulty",
      "tags": [
        { "id": "easy", "label": { "kz": "Жеңіл", "ru": "Лёгкий" }, "color": "emerald" },
        { "id": "hard", "label": { "kz": "Қиын", "ru": "Сложный" }, "color": "red" }
      ]
    }
  ]
}
```

- Tag ids are **global across groups** — a question just lists ids:
  `"tags": ["cube", "easy"]`.
- On the console, filters from different groups combine with AND, filters
  inside one group with OR (cube + prism + easy = easy cube-or-prism).
- `color` is optional: `blue`, `emerald`, `amber`, `red`, `violet`, `slate`
  (default `slate`).
- A question may have any number of tags, including none (an untagged
  question matches only when no filter from that group is active).

## Testing a pack locally (development)

Put the file at `packs/dev-preview.json` and open:

- `http://localhost:3000/play/dev-preview?preview=1` — browse all questions
  with answers (no session needed);
- `http://localhost:3000/play/dev-preview/host` — real console, full live flow.

## Publishing

Admin → Quizzes → New quiz → choose grade/topic, type the titles, attach the
pack in the **pack.json** field → save. The quiz appears in that topic's
lesson page as a native console; the student QR points at
`/play/<quiz-id>?code=<room>`. After saving, use the **Preview** link on the
quiz's edit page to proof-read every question.

## Not in v1 (planned)

- `mode: "levels"` (levels with pass thresholds) — rejected by the validator
  for now, so don't emit it.
- Generated-question recipes and custom widgets — these are engine features,
  not pack fields, and will get their own fields later.
