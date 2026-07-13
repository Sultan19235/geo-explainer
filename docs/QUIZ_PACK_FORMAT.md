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

### Figure style (colors that survive a phone screen)

The figure is redrawn from your commands, so readability is an authoring
convention. Every pack must follow this palette:

| Role | Command | Value |
| --- | --- | --- |
| Solid bodies / fills | `SetColor(obj, "#3b82f6")` + `SetFilling(obj, 0.12)` | light blue, nearly transparent |
| Secondary edges, dashed helpers | `SetColor(obj, "#2563eb")` + `SetLineThickness(obj, 3)` | medium blue, thin |
| THE key element (the segment/angle being asked about) | `SetColor(obj, "#dc2626")` + `SetLineThickness(obj, 6)` | red, thick — **only one red thing per figure** |
| Labels & measurements (`S = 144`, `14`, angles) | `SetColor(txt, "#111827")` + `Text(...)` with `SetTextSize`/large font | near-black, bold, never yellow/pastel |

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
