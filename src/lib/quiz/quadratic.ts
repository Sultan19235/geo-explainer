// Quadratic-graph quiz engine — pure functions, no React/DOM.
// Ported from public/play/graph-quadratic/index.html (the uploaded student
// page); generation logic is kept identical so questions match what classes
// have been seeing, only the types are new.

export type QuadParams =
  | { mode: "vertex"; a: number; m: number; n: number }
  | { mode: "standard"; a: number; b: number; cFull: number };

export const SECTION_IDS = [
  "sec1", // y = ax²
  "sec2", // y = ax² + c
  "sec3", // y = a(x−m)²
  "sec4", // y = a(x−m)² + n
  "sec5", // y = ax² + bx + c
  "sec6", // y = ax² + bx
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

// Display metadata for the teacher's section picker. `formula` uses the same
// "^2" superscript marker the MathFormula renderer understands.
export const SECTION_INFO: {
  id: SectionId;
  formula: string;
  example: string;
}[] = [
  { id: "sec1", formula: "y = ax^2", example: "y = 2x²,  y = −x²" },
  { id: "sec2", formula: "y = ax^2 + c", example: "y = x² + 3" },
  { id: "sec3", formula: "y = a(x − m)^2", example: "y = (x − 2)²" },
  { id: "sec4", formula: "y = a(x − m)^2 + n", example: "y = (x − 1)² + 2" },
  { id: "sec5", formula: "y = ax^2 + bx + c", example: "y = x² − 4x + 3" },
  { id: "sec6", formula: "y = ax^2 + bx", example: "y = x² − 4x" },
];

export function evaluate(p: QuadParams, x: number): number {
  if (p.mode === "standard") return p.a * x * x + p.b * x + p.cFull;
  return p.a * (x - p.m) * (x - p.m) + p.n;
}

export function vertexOf(p: QuadParams): { x: number; y: number } {
  if (p.mode === "standard") {
    const vx = -p.b / (2 * p.a);
    return { x: vx, y: evaluate(p, vx) };
  }
  return { x: p.m, y: p.n };
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: readonly T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function genForSection(sec: SectionId): QuadParams {
  const aV = [-2, -1, -0.5, 0.5, 1, 2];
  switch (sec) {
    case "sec1":
      return { mode: "vertex", a: randomChoice(aV), m: 0, n: 0 };
    case "sec2":
      return {
        mode: "vertex",
        a: randomChoice(aV),
        m: 0,
        n: randomChoice([-4, -3, -2, -1, 1, 2, 3, 4]),
      };
    case "sec3":
      return {
        mode: "vertex",
        a: randomChoice(aV),
        m: randomChoice([-3, -2, -1, 1, 2, 3]),
        n: 0,
      };
    case "sec4":
      return {
        mode: "vertex",
        a: randomChoice(aV),
        m: randomChoice([-3, -2, -1, 1, 2, 3]),
        n: randomChoice([-3, -2, -1, 1, 2, 3]),
      };
    case "sec5": {
      const a = randomChoice([1, -1, 2, -2]);
      const m = randomChoice([-3, -2, -1, 1, 2, 3]);
      const n = randomChoice([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
      return { mode: "standard", a, b: -2 * a * m, cFull: a * m * m + n };
    }
    case "sec6": {
      const a = randomChoice([1, -1, 2, -2]);
      const m = randomChoice([-3, -2, -1, 1, 2, 3]);
      return { mode: "standard", a, b: -2 * a * m, cFull: 0 };
    }
  }
}

// Plausible wrong parabolas for a given correct one: sign flips and small
// shifts of the same coefficients — the mistakes a student actually makes.
// Section-independent, so the quiz builder can offer distractors for a
// hand-authored parabola (not just the live generator's sectioned ones).
// Returns up to `count` unique variants (may be fewer for symmetric shapes).
export function suggestDistractors(
  correct: QuadParams,
  count = 3,
): QuadParams[] {
  const wrongs: QuadParams[] = [];
  const used = new Set([JSON.stringify(correct)]);
  const vars: QuadParams[] =
    correct.mode === "standard"
      ? [
          { a: -correct.a, b: correct.b, cFull: correct.cFull },
          { a: correct.a, b: -correct.b, cFull: correct.cFull },
          { a: correct.a, b: correct.b, cFull: -correct.cFull },
          { a: -correct.a, b: -correct.b, cFull: correct.cFull },
          { a: correct.a, b: correct.b, cFull: correct.cFull + 3 },
          { a: correct.a * 2, b: correct.b, cFull: correct.cFull },
        ].map((v) => ({ ...v, mode: "standard" as const }))
      : [
          { a: -correct.a, m: correct.m, n: correct.n },
          { a: correct.a, m: -correct.m, n: correct.n },
          { a: correct.a, m: correct.m, n: -correct.n },
          { a: -correct.a, m: -correct.m, n: correct.n },
          { a: correct.a, m: correct.m, n: correct.n + 3 },
          { a: correct.a * 2, m: correct.m, n: correct.n },
        ].map((v) => ({ ...v, mode: "vertex" as const }));

  for (const v of vars) {
    const k = JSON.stringify(v);
    if (!used.has(k) && wrongs.length < count) {
      used.add(k);
      wrongs.push(v);
    }
  }
  return wrongs;
}

function genWrong(correct: QuadParams, sec: SectionId): QuadParams[] {
  const wrongs = suggestDistractors(correct, 3);
  const used = new Set([
    JSON.stringify(correct),
    ...wrongs.map((w) => JSON.stringify(w)),
  ]);
  while (wrongs.length < 3) {
    const p = genForSection(sec);
    const k = JSON.stringify(p);
    if (!used.has(k)) {
      used.add(k);
      wrongs.push(p);
    }
  }
  return wrongs;
}

export type QuizOption = { params: QuadParams; isCorrect: boolean };
export type Question = { formula: string; options: QuizOption[] };

export function generateQuestion(sections: readonly SectionId[]): Question {
  const sec = randomChoice(sections);
  const correct = genForSection(sec);
  const wrongs = genWrong(correct, sec);
  const options = shuffle<QuizOption>([
    { params: correct, isCorrect: true },
    ...wrongs.map((w) => ({ params: w, isCorrect: false })),
  ]);
  return { formula: formatFunc(correct), options };
}

// Formats the function in textbook notation. "^2" is a marker the renderer
// turns into a superscript; "−" (U+2212) is the real minus sign so the
// formula reads like a printed math book, not code.
export function formatFunc(p: QuadParams): string {
  if (p.mode === "standard") {
    let s = "y = ";
    const { a, b, cFull: c } = p;
    if (a === 1) s += "x^2";
    else if (a === -1) s += "−x^2";
    else s += fmtNum(a) + "x^2";
    if (b > 0) s += " + " + (b === 1 ? "" : fmtNum(b)) + "x";
    else if (b < 0) s += " − " + (b === -1 ? "" : fmtNum(Math.abs(b))) + "x";
    if (c > 0) s += " + " + fmtNum(c);
    else if (c < 0) s += " − " + fmtNum(Math.abs(c));
    return s;
  }
  const { a, m, n } = p;
  if (m === 0 && n === 0) {
    if (a === 1) return "y = x^2";
    if (a === -1) return "y = −x^2";
    return "y = " + fmtNum(a) + "x^2";
  }
  let s = "y = ";
  if (m === 0) {
    if (a === 1) s += "x^2";
    else if (a === -1) s += "−x^2";
    else s += fmtNum(a) + "x^2";
    if (n > 0) s += " + " + fmtNum(n);
    else if (n < 0) s += " − " + fmtNum(Math.abs(n));
    return s;
  }
  if (a === -1) s += "−";
  else if (a !== 1) s += fmtNum(a);
  if (m > 0) s += "(x − " + fmtNum(m) + ")^2";
  else s += "(x + " + fmtNum(Math.abs(m)) + ")^2";
  if (n > 0) s += " + " + fmtNum(n);
  else if (n < 0) s += " − " + fmtNum(Math.abs(n));
  return s;
}

// 0.5 → "0,5" — decimal comma, as written on Kazakh school boards.
function fmtNum(v: number): string {
  // Guard tiny FP dust (e.g. -0 or 1.9999999997) so labels read cleanly.
  const rounded = Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6;
  const s = String(rounded).replace("-", "−");
  return s.replace(".", ",");
}

// ─── Graph "read a property" questions (interaction mode B) ─────────────────
// The student is shown a parabola and picks one of its properties. Answers are
// multiple-choice: a correct value plus deterministically-derived wrong values
// (no RNG, so the server and client agree and grading stays stable).

export type GraphAsk = "vertex" | "axis" | "direction" | "yIntercept";
export const GRAPH_ASKS: GraphAsk[] = [
  "vertex",
  "axis",
  "direction",
  "yIntercept",
];

export function isGraphAsk(value: unknown): value is GraphAsk {
  return (
    typeof value === "string" && (GRAPH_ASKS as string[]).includes(value)
  );
}

type Lang = "kz" | "ru";

// The question prompt shown above the graph for each property.
export function graphPropertyPrompt(ask: GraphAsk, lang: Lang): string {
  const P: Record<GraphAsk, { kz: string; ru: string }> = {
    vertex: {
      kz: "Параболаның төбесі қай нүктеде?",
      ru: "Где находится вершина параболы?",
    },
    axis: {
      kz: "Симметрия осін көрсетіңіз",
      ru: "Укажите ось симметрии",
    },
    direction: {
      kz: "Параболаның тармақтары қайда бағытталған?",
      ru: "Куда направлены ветви параболы?",
    },
    yIntercept: {
      kz: "Парабола Oy осін қай нүктеде қияды? (y мәні)",
      ru: "В какой точке парабола пересекает ось Oy? (значение y)",
    },
  };
  return lang === "ru" ? P[ask].ru : P[ask].kz;
}

// Builds the answer options for a property question, correct one first (index
// 0). Callers shuffle for display; the correct index stays 0 for grading.
export function graphPropertyChoices(
  p: QuadParams,
  ask: GraphAsk,
  lang: Lang,
): string[] {
  if (ask === "direction") {
    const up = lang === "ru" ? "вверх" : "жоғары";
    const down = lang === "ru" ? "вниз" : "төмен";
    return p.a > 0 ? [up, down] : [down, up];
  }

  const v = vertexOf(p);
  if (ask === "vertex") {
    const cands: [number, number][] = [
      [-v.x, v.y],
      [v.x, -v.y],
      [-v.x, -v.y],
      [v.x + 1, v.y],
      [v.x, v.y + 1],
      [v.x - 1, v.y - 1],
      [v.x + 2, v.y],
      [v.x, v.y - 2],
    ];
    return pickDistinct(
      [v.x, v.y],
      cands,
      3,
      (pt) => `(${fmtNum(pt[0])}; ${fmtNum(pt[1])})`,
    );
  }
  if (ask === "axis") {
    const c = v.x;
    const cands = [-c, c + 1, c - 1, c + 2, c - 2, c + 3, c - 3];
    return pickDistinct(c, cands, 3, (x) => `x = ${fmtNum(x)}`);
  }
  // yIntercept
  const y0 = evaluate(p, 0);
  const cands = [-y0, y0 + 2, y0 - 2, y0 + 4, y0 - 4, y0 + 1, y0 - 1];
  return pickDistinct(y0, cands, 3, (y) => fmtNum(y));
}

// How many options a property question shows (used by the engine to size the
// choice grid without knowing the language — counts don't vary by language).
export function graphPropertyChoiceCount(ask: GraphAsk): number {
  return ask === "direction" ? 2 : 4;
}

// ─── Drag-to-build (interaction mode D) ─────────────────────────────────────
// The student is given a target equation and drags a parabola to match it.
// Their attempt is a vertex-form triple; grading compares it to the target's
// canonical vertex form (leading coefficient + vertex) within a tolerance.

export type VertexTriple = { a: number; m: number; n: number };

// Any quadratic as {a, vertex} — the leading coefficient is invariant between
// standard and vertex form, and the vertex comes from vertexOf().
export function toVertexForm(p: QuadParams): VertexTriple {
  const v = vertexOf(p);
  return { a: p.a, m: v.x, n: v.y };
}

export function gradeDrag(
  attempt: VertexTriple,
  target: QuadParams,
  tol = 1e-6,
): boolean {
  const t = toVertexForm(target);
  return (
    Math.abs(attempt.a - t.a) < tol &&
    Math.abs(attempt.m - t.m) < tol &&
    Math.abs(attempt.n - t.n) < tol
  );
}

// Correct label first, then up to `count` distinct distractor labels drawn in
// order from `cands` (deduped by their rendered text against the correct one
// and each other). `cands` always supplies enough distinct values here.
function pickDistinct<T>(
  correct: T,
  cands: T[],
  count: number,
  render: (t: T) => string,
): string[] {
  const correctLabel = render(correct);
  const out = [correctLabel];
  const used = new Set([correctLabel]);
  for (const c of cands) {
    if (out.length - 1 >= count) break;
    const label = render(c);
    if (!used.has(label)) {
      used.add(label);
      out.push(label);
    }
  }
  return out;
}
