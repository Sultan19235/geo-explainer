// Exact-value answer model for drill topics.
//
// Every drill answer is a rational number times an optional π factor:
//   {num: 2, den: 3, unit: "pi"}  =  2π/3
//   {num: 87, den: 2, unit: "one"} = 43,5
// The generator constructs the answer exactly, the student's keypad input is
// parsed into the same shape, and comparison is integer arithmetic — never
// float tolerance and never string matching. `0,50` equals `1/2` equals `0,5`;
// `2π/3` never equals `2,09`.
//
// Pure module: no React, no DOM — safe to import server-side and in tests.

export type ExactUnit = "one" | "pi";

export type Exact = {
  /** Numerator; carries the sign. */
  num: number;
  /** Denominator; always > 0. */
  den: number;
  unit: ExactUnit;
};

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** Build a normalized exact value: reduced fraction, positive denominator. */
export function exact(num: number, den = 1, unit: ExactUnit = "one"): Exact {
  if (den === 0 || !Number.isInteger(num) || !Number.isInteger(den)) {
    throw new Error(`bad exact value ${num}/${den}`);
  }
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1;
  num /= g;
  den /= g;
  // 0π is just 0 — normalize so equality doesn't depend on the unit.
  return { num, den, unit: num === 0 ? "one" : unit };
}

export function equalsExact(a: Exact, b: Exact): boolean {
  const na = exact(a.num, a.den, a.unit);
  const nb = exact(b.num, b.den, b.unit);
  return na.num === nb.num && na.den === nb.den && na.unit === nb.unit;
}

// ─── Parsing keypad input ───────────────────────────────────────────────────
//
// The keypad can only produce these glyphs: 0-9  ,  −  π  /
// Accepted shapes (textbook answer forms):
//   120    -8    43,5    -0,25    7/18    2π/3    π/6    3π    1,5π    -π/2
// Rejected: comma inside a fraction ("1,5/3"), "/" without denominator,
// multiple commas, π in the denominator — a student can't type most of these
// anyway, but the parser is the gatekeeper.

const MAX_DIGITS = 9;

export function parseExact(raw: string): Exact | null {
  let s = raw.replace(/\s+/g, "").replace(/−/g, "-").replace(/\./g, ",");
  if (s === "") return null;

  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  }
  if (s === "") return null;

  const m = s.match(/^(\d+)?(?:,(\d+))?(π)?(?:\/(\d+))?$/);
  if (!m) return null;
  const [, intPart, fracPart, pi, denPart] = m;

  // Something must be there: "π" alone is fine, "," or "/3" alone is not.
  if (intPart === undefined && fracPart === undefined && pi === undefined) return null;
  // A bare comma with nothing after it ("3,") never matches the regex; a comma
  // with nothing before it ("‚5") is rejected here for textbook hygiene.
  if (fracPart !== undefined && intPart === undefined) return null;
  // Decimal comma and fraction bar don't mix in one answer.
  if (fracPart !== undefined && denPart !== undefined) return null;

  for (const part of [intPart, fracPart, denPart]) {
    if (part !== undefined && part.length > MAX_DIGITS) return null;
  }

  const scale = fracPart?.length ?? 0;
  const coeffNum =
    Number(intPart ?? (pi ? "1" : "0")) * 10 ** scale + Number(fracPart ?? "0");
  const coeffDen = 10 ** scale;
  const den = denPart !== undefined ? Number(denPart) : 1;
  if (den === 0) return null;

  return exact(sign * coeffNum, coeffDen * den, pi ? "pi" : "one");
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export type ExactStyle = "fraction" | "decimal";

/** "43,5" — decimal comma, FP-dust guarded (denominator may not be a 10-power). */
function decimalString(e: Exact): string {
  return Number((e.num / e.den).toPrecision(12))
    .toString()
    .replace(".", ",");
}

/** Plain-text form: "2π/3", "-7/18", "120", "43,5". Used in aria labels/logs. */
export function toPlain(e: Exact, style: ExactStyle = "fraction"): string {
  const v = exact(e.num, e.den, e.unit);
  if (v.unit === "one") {
    if (style === "decimal" || v.den === 1) return decimalString(v);
    return `${v.num}/${v.den}`;
  }
  const sign = v.num < 0 ? "-" : "";
  const n = Math.abs(v.num);
  const coeff = n === 1 ? "" : String(n);
  return v.den === 1 ? `${sign}${coeff}π` : `${sign}${coeff}π/${v.den}`;
}

/** KaTeX form (goes inside $...$): "\frac{2\pi}{3}", "43{,}5", "-\frac{7}{18}". */
export function toKatex(e: Exact, style: ExactStyle = "fraction"): string {
  const v = exact(e.num, e.den, e.unit);
  if (v.unit === "one") {
    if (style === "decimal" || v.den === 1) {
      return decimalString(v).replace(",", "{,}");
    }
    const sign = v.num < 0 ? "-" : "";
    return `${sign}\\frac{${Math.abs(v.num)}}{${v.den}}`;
  }
  const sign = v.num < 0 ? "-" : "";
  const n = Math.abs(v.num);
  const numer = n === 1 ? "\\pi" : `${n}\\pi`;
  return v.den === 1 ? `${sign}${numer}` : `${sign}\\frac{${numer}}{${v.den}}`;
}

/** "14{,}6" — KaTeX-safe decimal comma for prompt text built from numbers. */
export function katexDecimal(value: number): string {
  return Number(value.toPrecision(12)).toString().replace(".", "{,}");
}
