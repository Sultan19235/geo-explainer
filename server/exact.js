// Exact-value answer model — SERVER PORT (v9 tournament grading).
//
// PORT of exact / equalsExact / parseExact (and their helpers) from
// src/lib/drill/exact.ts. Tournament answers are graded HERE — the phone only
// relays the raw keypad string — so the two implementations MUST stay
// textually in sync: if the rules change in exact.ts, mirror them here (and
// vice versa). Parity is enforced by scripts/exact-port-parity.ts (seeded
// fuzz over both implementations). toPlain/toKatex are display-only and
// deliberately not ported.
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
// Pure CommonJS module: no dependencies, no side effects — plain `node` test
// scripts can require it without starting the server.

"use strict";

// Exact shape: { num, den, unit, rad? }
//   num  — numerator; carries the sign.
//   den  — denominator; always > 0.
//   unit — "one" | "pi".
//   rad  — squarefree radicand ≥ 2 (value × √rad); never combined with π.

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** Build a normalized exact value: reduced fraction, positive denominator,
 * squarefree radicand (√12 → 2√3, √4 → plain 2). */
function exact(num, den = 1, unit = "one", rad) {
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

function equalsExact(a, b) {
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

function parseExact(raw) {
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

module.exports = { exact, equalsExact, parseExact };
