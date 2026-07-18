// Exact-value answer model for drill topics.
//
// Every drill answer is a rational number times an optional π factor or an
// optional square root:
//   {num: 2, den: 3, unit: "pi"}          =  2π/3
//   {num: 87, den: 2, unit: "one"}        =  43,5
//   {num: 1, den: 2, unit: "one", rad: 2} =  √2/2
// The generator constructs the answer exactly, the student's keypad input is
// parsed into the same shape, and comparison is integer arithmetic — never
// float tolerance and never string matching. `0,50` equals `1/2` equals `0,5`,
// `√12/2` equals `√3`; `2π/3` never equals `2,09`.
//
// Pure module: no React, no DOM — safe to import server-side and in tests.

export type ExactUnit = "one" | "pi";

export type Exact = {
  /** Numerator; carries the sign. */
  num: number;
  /** Denominator; always > 0. */
  den: number;
  unit: ExactUnit;
  /** Squarefree radicand ≥ 2 (value × √rad); never combined with π. */
  rad?: number;
};

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** Build a normalized exact value: reduced fraction, positive denominator,
 * squarefree radicand (√12 → 2√3, √4 → plain 2). */
export function exact(
  num: number,
  den = 1,
  unit: ExactUnit = "one",
  rad?: number,
): Exact {
  if (den === 0 || !Number.isInteger(num) || !Number.isInteger(den)) {
    throw new Error(`bad exact value ${num}/${den}`);
  }
  if (rad !== undefined && (!Number.isInteger(rad) || rad < 1)) {
    throw new Error(`bad radicand √${rad}`);
  }
  if (rad !== undefined && rad > 1 && unit === "pi") {
    throw new Error("π and √ never combine in a drill answer");
  }
  if (den < 0) {
    num = -num;
    den = -den;
  }
  // Pull square factors out of the radicand: √12 = 2√3.
  let r = rad ?? 1;
  for (let s = Math.floor(Math.sqrt(r)); s >= 2; s--) {
    if (r % (s * s) === 0) {
      num *= s;
      r /= s * s;
      s = Math.floor(Math.sqrt(r)) + 1;
    }
  }
  const g = gcd(num, den) || 1;
  num /= g;
  den /= g;
  // 0π and 0√r are just 0 — normalize so equality doesn't depend on the unit.
  if (num === 0) return { num, den, unit: "one" };
  return r > 1 ? { num, den, unit, rad: r } : { num, den, unit };
}

export function equalsExact(a: Exact, b: Exact): boolean {
  const na = exact(a.num, a.den, a.unit, a.rad);
  const nb = exact(b.num, b.den, b.unit, b.rad);
  return (
    na.num === nb.num &&
    na.den === nb.den &&
    na.unit === nb.unit &&
    (na.rad ?? 1) === (nb.rad ?? 1)
  );
}

// ─── Parsing keypad input ───────────────────────────────────────────────────
//
// The keypad can only produce these glyphs: 0-9  ,  −  π  √  /
// Accepted shapes (textbook answer forms):
//   120  -8  43,5  -0,25  7/18  2π/3  π/6  3π  1,5π  -π/2  √2  2√3  √2/2  -√3/3
// Rejected: comma inside a fraction ("1,5/3") or with a radical ("1,5√2"),
// "/" without denominator, multiple commas, π or √ in the denominator — a
// student can't type most of these anyway, but the parser is the gatekeeper.

const MAX_DIGITS = 9;
const MAX_RADICAND = 999;

export function parseExact(raw: string): Exact | null {
  let s = raw.replace(/\s+/g, "").replace(/−/g, "-").replace(/\./g, ",");
  if (s === "") return null;

  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  }
  if (s === "") return null;

  const m = s.match(/^(\d+)?(?:,(\d+))?(?:(π)|√(\d+))?(?:\/(\d+))?$/);
  if (!m) return null;
  const [, intPart, fracPart, pi, radPart, denPart] = m;

  // Something must be there: "π" or "√2" alone is fine, "," or "/3" alone is not.
  if (intPart === undefined && fracPart === undefined && pi === undefined && radPart === undefined) {
    return null;
  }
  // A comma with nothing before it is rejected for textbook hygiene.
  if (fracPart !== undefined && intPart === undefined) return null;
  // Decimal comma mixes with neither the fraction bar nor a radical.
  if (fracPart !== undefined && (denPart !== undefined || radPart !== undefined)) {
    return null;
  }

  for (const part of [intPart, fracPart, denPart]) {
    if (part !== undefined && part.length > MAX_DIGITS) return null;
  }

  const rad = radPart !== undefined ? Number(radPart) : undefined;
  if (rad !== undefined && (rad < 2 || rad > MAX_RADICAND)) return null;

  const hasFactor = pi !== undefined || rad !== undefined;
  const scale = fracPart?.length ?? 0;
  const coeffNum =
    Number(intPart ?? (hasFactor ? "1" : "0")) * 10 ** scale +
    Number(fracPart ?? "0");
  const coeffDen = 10 ** scale;
  const den = denPart !== undefined ? Number(denPart) : 1;
  if (den === 0) return null;

  return exact(sign * coeffNum, coeffDen * den, pi ? "pi" : "one", rad);
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export type ExactStyle = "fraction" | "decimal";

/** "43,5" — decimal comma, FP-dust guarded (denominator may not be a 10-power). */
function decimalString(e: Exact): string {
  return Number((e.num / e.den).toPrecision(12))
    .toString()
    .replace(".", ",");
}

/** Plain-text form: "2π/3", "-7/18", "120", "43,5", "√2/2". Matches what a
 * student would type on the keypad. Used in aria labels/logs/generated packs. */
export function toPlain(e: Exact, style: ExactStyle = "fraction"): string {
  const v = exact(e.num, e.den, e.unit, e.rad);
  if (v.unit === "one" && v.rad === undefined) {
    if (style === "decimal" || v.den === 1) return decimalString(v);
    return `${v.num}/${v.den}`;
  }
  const sign = v.num < 0 ? "-" : "";
  const n = Math.abs(v.num);
  const coeff = n === 1 ? "" : String(n);
  const factor = v.rad !== undefined ? `√${v.rad}` : "π";
  return v.den === 1
    ? `${sign}${coeff}${factor}`
    : `${sign}${coeff}${factor}/${v.den}`;
}

/** KaTeX form (goes inside $...$): "\frac{2\pi}{3}", "43{,}5",
 * "-\frac{7}{18}", "\frac{\sqrt{2}}{2}". */
export function toKatex(e: Exact, style: ExactStyle = "fraction"): string {
  const v = exact(e.num, e.den, e.unit, e.rad);
  if (v.unit === "one" && v.rad === undefined) {
    if (style === "decimal" || v.den === 1) {
      return decimalString(v).replace(",", "{,}");
    }
    const sign = v.num < 0 ? "-" : "";
    return `${sign}\\frac{${Math.abs(v.num)}}{${v.den}}`;
  }
  const sign = v.num < 0 ? "-" : "";
  const n = Math.abs(v.num);
  const factor = v.rad !== undefined ? `\\sqrt{${v.rad}}` : "\\pi";
  const numer = n === 1 ? factor : `${n}${factor}`;
  return v.den === 1 ? `${sign}${numer}` : `${sign}\\frac{${numer}}{${v.den}}`;
}

/** "14{,}6" — KaTeX-safe decimal comma for prompt text built from numbers. */
export function katexDecimal(value: number): string {
  return Number(value.toPrecision(12)).toString().replace(".", "{,}");
}
