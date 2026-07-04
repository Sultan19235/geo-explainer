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
  "questions": [ /* 1–200 questions, see below */ ]
}
```

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
  "solution": [             // worked steps, revealed after answering
    "Табан ауданы: $S = a^2 = 144 \\Rightarrow a = 12$",
    "Диагональ: $d = \\sqrt{2a^2 + h^2} = 22$"
  ]
}
```

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
