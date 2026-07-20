# Presentation file format (v1)

Teacher-led classroom presentations for ordinary arithmetic topics (no
GeoGebra). One `.js` file = one topic (one numbered section of the textbook,
e.g. **1.1 Натурал сандар және нөл**). The file is pure declarative data —
the engine owns every pixel, same philosophy as drill generator files.

Preview/test bench: **/labs/present/file** (paste or pick the file; errors
come back as readable English lines you can paste into an AI chat).
Working example: `public/present/demo-5-1-1.js`.

## Publishing

Upload checked files at **/admin/presentations** (multiple at once). Each
published presentation gets a permanent page at **/labs/present/\<id\>**,
listed on the **/labs/present** hub. Re-uploading a file with the same `id`
replaces it in place (version bump — pages update immediately). The ids
`file`, `demo` and `index` are reserved.

## Contract

The file calls `registerPresentation({...})` **exactly once**:

```js
registerPresentation({
  apiVersion: 1,
  id: "5.1.1-natural-sandar",        // lowercase slug: letters/digits/dots/dashes
  title: { kz: "...", ru: "..." },
  subtitle: { kz: "...", ru: "..." }, // optional
  slides: [ /* 1–80 slides */ ],
});
```

Every human-readable text is a `PresentText`: either a bare string (Kazakh)
or `{ kz, ru }` (ru falls back to kz). Texts support MathText: inline
`$...$` KaTeX segments. Numbers may be given as numbers or digit strings
(spaces allowed: `"8 617 000 324"`), max 15 digits.

No `Math.random`, no `Date`, no network — files are data. Network/storage
globals are shadowed inside the sandbox.

## Slide types

### `title`
```js
{ type: "title", title, subtitle? }
```
Big centered opener.

### `text` — stepped theory
```js
{ type: "text", heading?, steps: [{ text, variant? }, ...] }   // 1–12 steps
```
Steps reveal one per → press. `variant`: `"normal"` (default) | `"rule"`
(blue highlighted band — definitions/rules) | `"fact"` (💡 "did you know"
box) | `"example"` (muted example card).

### `flashcards` — hands-up cards
```js
{ type: "flashcards", heading?, prompt?,
  cards: [{ front, verdict?, answer? }, ...] }   // 1–20 cards
```
Huge card, the class votes, teacher clicks to reveal. `verdict`:
`"yes"`/`"no"` (ИӘ/ЖОҚ in green/red); `answer` is an optional explanation.
Each card needs a verdict or an answer.

### `place-value` — click a digit
```js
{ type: "place-value", heading?, number, note? }
```
The number's digits are clickable; a click names the place (бірлік, ондық,
жүздік, …) and shows `7 · 100 = 700`.

### `expand` — разрядтық қосылғыштар
```js
{ type: "expand", heading?, number }
```
Two → steps: sum form (`= 30 000 + 5 000 + 700 + 40 + 9`), then product
form (`= 3 · 10 000 + …`), digits color-matched to terms.

### `digit-meaning` — same digit, different place
```js
{ type: "digit-meaning", heading?, digit, numbers: [...], note? } // 1–4 numbers
```
Click each number to reveal what the digit means there. The digit must
appear **exactly once** in every number. `note` (the positional-system
punchline) appears as a rule box once everything is revealed.

### `class-table` — разрядтар және кластар кестесі
```js
{ type: "class-table", heading?, numbers: [...] }   // 1–8 numbers
```
Number chips fill the classes/places table; a text field lets the teacher
add their own number live. Below, the number is read out by classes
(8 миллиард 617 миллион 324).

### `oral` — устный счёт grid
```js
{ type: "oral", heading?, items: [{ q: "25 · 4", a: "100" }, ...] } // 1–24
```
Click a card to reveal/hide its answer; a reset button covers all again.

### `coord-ray` — координаталық сәуле
```js
{ type: "coord-ray", heading?, prompt?, note?,
  mode: "show" | "build" | "reveal" | "mark" | "jump",
  max: 18,                       // rightmost whole number (2–40)
  labels?: "auto" | "all" | "none" | [0, 1],  // numbers printed under ticks
  unit?: "Бірлік кесінді = 40 м",
  points: [{ name?: "A", value: 4, icon?: "🐕", given?, unknown? }], // 1–12
  jumps?: [-2, 5, -2, 5] }       // mode "jump" only
```
One ray, five classroom uses:

- **show** — the finished figure, every coordinate printed.
- **build** — points appear one per → press (the ray being constructed); the
  player counts these as internal steps.
- **reveal** — letters visible, coordinates hidden until a point is clicked.
- **mark** — empty ray; the class clicks the tick where each point belongs.
  Right tick → the point lands in green, wrong tick → a red ring. Needs at
  least one point without `given`.
- **jump** — the first point hops along `jumps` (−2 = two units left), one hop
  per click, leaving a trail and the list of visited coordinates.

`given: true` prints that point's coordinate from the start (it is given, not
asked — it also sets the scale); `unknown: true` draws "?" instead of the
coordinate.

### `word-problem` — есеп, шығарылуымен
```js
{ type: "word-problem", heading?,
  statement: "Ит мысықты көріп, қуа жөнелді…",
  ray?: { max, points, labels?, unit? },            // same shape as coord-ray
  question: "Қанша уақытта ит мысықты қуып жетеді?",
  choices?: [{ text: "4 с", correct: true }, ...],  // 2–4, one correct
  steps?: [{ text: "16 − 4 = 12 (м)" }, ...],       // ≤ 8 solution lines
  answer: "4 секундта" }
```
The class votes on a choice (a click marks it green/red), then the teacher
opens the solution one line per click, ending on the green answer badge.
Nothing auto-reveals, and the picture shrinks to make room as the solution
grows. Emoji `icon`s stand in for the textbook's actors (🏠 🐕 🐈 🦗).

## Player

- → ← / Space / PgUp / PgDn / on-screen arrows; Escape exits.
- Stepped slides (`text`, `expand`, `coord-ray` in `build` mode) consume →
  presses before the next slide.
- Pen overlay (red/blue pens, eraser, undo) is available on every slide;
  the canvas resets when the slide changes.
- KZ/RU toggle lives in the header; switching is instant.

## Adding new widgets

New slide types are added to the engine (`src/lib/present/types.ts`,
`schema.ts`, a component in `src/components/present/`, a case in
`slide-view.tsx`). Keep widgets declarative-parameterized so many topics can
reuse them.
