# Drill Generator File Format (apiVersion 1)

A drill generator is **one .js file = one endless practice topic**. The file
invents problems; the engine owns everything else (keypad, exact answer
checking, wrong→show-answer flow, retry queue, teacher room controls, student
tracking). Upload flow:

1. Author the file (typically: give this document + a textbook photo to an AI
   chat and ask for the file).
2. Test it at **`/labs/drill/file`** — paste the code, press the button. The
   validation harness runs it a few hundred times and either lists readable
   errors (paste them back into the AI chat) or starts a playable preview.
3. Publish in **Admin → Quizzes → New quiz**: attach the file in the
   "generator .js" field. The same harness runs again before saving — a file
   that fails cannot be uploaded.

The file runs **only inside a sandboxed Web Worker** on the student's device:
no DOM, no network, no storage. Generators must be **pure**: same seed, same
problem — the harness rejects files that use `Math.random()` or `Date`.

## File skeleton

```js
registerDrillTopic({
  apiVersion: 1,
  id: "integer-add",                       // lowercase letters/digits/dashes
  title: { kz: "…", ru: "…" },             // shown as the page header
  subtitle: { kz: "…", ru: "…" },          // grade / one-line description
  options: [                               // teacher tick-groups (max 4)
    {
      id: "kinds",
      label: { kz: "Есеп түрлері", ru: "Типы заданий" },
      choices: [                           // 1–8 per group
        { id: "add", label: { kz: "Қосу", ru: "Сложение" } },
        { id: "sub", label: { kz: "Азайту", ru: "Вычитание" } },
      ],
      defaults: ["add"],                   // non-empty subset of choice ids
    },
  ],
  generate(rng, config) {
    // rng: () => number in [0,1) — THE ONLY source of randomness.
    // config: { kinds: ["add", ...] } — selected choice ids per group id
    //         (never empty: the engine guarantees ≥1 per group).
    // returns ONE problem (see below).
  },
});
```

`registerDrillTopic` must be called exactly once. All text is
`{ kz: "...", ru: "..." }` — both languages required.

## The problem object

```js
return {
  prompt: {                                // $...$ segments render as KaTeX
    kz: `Есепте: $${a} + (${b})$`,
    ru: `Вычислите: $${a} + (${b})$`,
  },
  answer: exact(a + b),                    // ALWAYS built with exact()
  answerStyle: "fraction",                 // "fraction" | "decimal" (43,5)
  keys: keysForAnswer(toPlain(exact(a + b))), // extra keypad keys
  solution: {                              // optional one-line "why"
    kz: `$${a} + (${b}) = ${a + b}$`,
    ru: `$${a} + (${b}) = ${a + b}$`,
  },
  variant: "add",                          // short template id (analytics)
  visual: {                                // optional visual brick, see below
    type: "number-line",
    min: -10, max: 10,
    points: [a],
    arrows: [{ from: a, to: a + b }],
  },
};
```

### Answers — `exact(num, den?, unit?, rad?)`

Answers are exact values, never floats or strings:

| Value  | Call                       |
| ------ | -------------------------- |
| 7      | `exact(7)`                 |
| −8     | `exact(-8)`                |
| 43,5   | `exact(87, 2)` + `answerStyle: "decimal"` |
| 7/18   | `exact(7, 18)`             |
| 2π/3   | `exact(2, 3, "pi")`        |
| √2/2   | `exact(1, 2, "one", 2)`    |
| −√3    | `exact(-1, 1, "one", 3)`   |

Checking is exact math with equivalents accepted automatically (a student's
`4/6` matches `exact(2, 3)`). Fractions reduce and radicals normalize by
themselves (`exact(6, 4)` stores 3/2, `rad: 12` stores 2√3).

### Keypad — `keys`

List from `"comma"`, `"minus"`, `"pi"`, `"frac"`, `"sqrt"` (digits and
backspace are always present; π and √ share one physical key). The easy,
correct default:

```js
keys: keysForAnswer(toPlain(answer, answerStyle))
```

Add more only to allow alternative forms (e.g. `"comma"` so `0,5` is typeable
when the canonical answer is `1/2`).

### Helper functions available in the file

No imports — these are in scope:

- `exact(num, den?, unit?, rad?)` — build an answer (see table above)
- `toPlain(exactValue, style?)` — `"2π/3"`, `"43,5"` (keypad form)
- `toKatex(exactValue, style?)` — `"\\frac{2\\pi}{3}"` for prompts/solutions
- `katexDecimal(3.5)` — `"3{,}5"` (KaTeX-safe decimal comma)
- `keysForAnswer(plainString)` — infer the keys list
- `randInt(rng, lo, hi)` — integer in [lo, hi], both inclusive
- `pick(rng, array)` — one element
- `shuffle(rng, array)` — new shuffled copy
- `parseExact(string)` — string → exact value (rarely needed)

Everything else is off limits: no `Math.random()`, no `Date`, no `fetch` —
the sandbox removes them and the harness rejects non-determinism.

## Visual bricks — `visual` (optional)

Bricks are engine components; a file only names one and sets its knobs — the
engine owns colors, stroke widths and phone-tested sizes. apiVersion 1 has
two bricks:

**`number-line`** — `{ type: "number-line", min, max, points?, arrows? }`

- span (`max − min`) at most 200; everything must lie inside `[min, max]`
- `points`: dots visible from the start (the given numbers)
- `arrows`: `{ from, to }` hops drawn **only after answering** — the "why"
  picture (e.g. −3 + 5: an arrow 0→−3, then −3→2)

**`figure`** — a generic picture DESCRIBED as a list of shape parts in math
coordinates (y grows upward). The file never draws; it lists parts, the
engine renders them:

```js
visual: {
  type: "figure",
  view: { xMin: -1.4, xMax: 1.4, yMin: -1.4, yMax: 1.4 },
  grid: false,          // light background grid
  axes: true,           // x/y axes through 0
  shapes: [             // visible from the start
    { kind: "circle", center: [0, 0], radius: 1 },
    { kind: "segment", from: [0, 0], to: [0.5, 0.866], color: "red" },
    { kind: "label", at: [0.75, 0.35], text: "60°", color: "red" },
  ],
  reveal: [             // shown only after answering — the "why" picture
    { kind: "segment", from: [0.5, 0.866], to: [0.5, 0], dash: true },
    { kind: "point", at: [0.5, 0], label: "0,5", color: "green" },
  ],
}
```

Shape kinds (all coordinates `[x, y]` in view units):

- `{ kind: "segment", from, to, color?, dash? }`
- `{ kind: "arrow", from, to, color? }` — straight arrow with a head
- `{ kind: "circle", center, radius, color?, fill? }`
- `{ kind: "arc", center, radius, startDeg, endDeg, color?, arrow? }` —
  counter-clockwise when `endDeg > startDeg`
- `{ kind: "point", at, color?, label? }` — dot, optional short label beside
- `{ kind: "label", at, text, color? }` — plain text (unicode π√° fine, ≤ 24 chars)
- `{ kind: "polygon", points, color?, fill? }` — ≥ 3 points

`color` is a palette name: `"blue"` (default), `"red"`, `"green"`,
`"orange"`, `"slate"`. At most 80 shapes per figure (`shapes` + `reveal`).
Keep figures square-ish — the engine keeps x and y scales equal so circles
stay round.

## Rules the harness enforces (upload fails otherwise)

- `registerDrillTopic` called exactly once; `apiVersion: 1`
- `id` unique — not one of the built-in topics
- every text bilingual (`kz` + `ru`, non-empty)
- `options`: ≤ 4 groups, 1–8 choices each, `defaults` a non-empty subset
- `generate` never crashes, for the default config and every single-choice
  config (each choice is exercised)
- every answer round-trips through the student keypad (typeable as returned)
- deterministic: same seed ⇒ identical problem, twice in a row
- `visual` (when present) valid per the brick's rules

## Full example

See `docs/examples/integer-add.drill.js` — integer addition/subtraction with
a number line, the file this document's snippets come from. It passes the
harness as-is; use it as the starting template.
