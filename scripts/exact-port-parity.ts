// Parity fuzz for the exact-value server port (Tournament mode, spec §8).
// Drives src/lib/drill/exact.ts and server/exact.js through the SAME inputs —
// seeded PRNG, no Math.random — and fails on any behavioral difference:
// parseExact (null vs value, and every field of the value), equalsExact, and
// the exact() constructor (normalization + throw/no-throw). The two files are
// meant to be textually in sync; this script is the enforcement.
// Run: npx tsx scripts/exact-port-parity.ts
import { createRequire } from "node:module";
import path from "node:path";
import {
  exact as exactTs,
  equalsExact as equalsExactTs,
  parseExact as parseExactTs,
  toPlain,
  type Exact,
  type ExactUnit,
} from "../src/lib/drill/exact";
import { mulberry32, pick, randInt, type Rng } from "../src/lib/drill/rng";

// The server port is CommonJS by design (required by server.js on the box);
// load it through createRequire so tsc never pulls the .js into its graph.
type ServerExactModule = {
  exact: (num: number, den?: number, unit?: ExactUnit, rad?: number) => Exact;
  equalsExact: (a: Exact, b: Exact) => boolean;
  parseExact: (raw: string) => Exact | null;
};
const requireCjs = createRequire(path.resolve("package.json"));
const serverExact = requireCjs(
  path.resolve("server", "exact.js"),
) as ServerExactModule;

let failures = 0;
let stringCases = 0;
let ctorCases = 0;
let equalsChecks = 0;

function fail(label: string) {
  failures++;
  // A broken port fails thousands of cases at once — keep the log readable.
  if (failures <= 25) console.error(`FAIL: ${label}`);
}

function fmt(e: Exact | null): string {
  return e === null ? "null" : JSON.stringify(e);
}

/** Field-identical (num/den/unit/rad), the parity the grader relies on. */
function sameValue(a: Exact | null, b: Exact | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.num === b.num &&
    a.den === b.den &&
    a.unit === b.unit &&
    (a.rad ?? 1) === (b.rad ?? 1)
  );
}

// The previously parsed value from each implementation — every new parse is
// also equals-compared against it, so equalsExact agreement is exercised on
// realistic, unrelated pairs for free.
let prevTs: Exact | null = null;
let prevJs: Exact | null = null;

function checkString(s: string) {
  stringCases++;
  const ts = parseExactTs(s);
  const js = serverExact.parseExact(s);
  if (!sameValue(ts, js)) {
    fail(`parse ${JSON.stringify(s)}: ts=${fmt(ts)} js=${fmt(js)}`);
    return;
  }
  if (ts !== null && js !== null) {
    // Cross-implementation reflexivity: each impl must call the pair equal.
    equalsChecks++;
    if (!equalsExactTs(ts, js) || !serverExact.equalsExact(ts, js)) {
      fail(`self-equals ${JSON.stringify(s)}: ts=${fmt(ts)} js=${fmt(js)}`);
    }
    if (prevTs !== null && prevJs !== null) {
      equalsChecks++;
      const eTs = equalsExactTs(ts, prevTs);
      const eJs = serverExact.equalsExact(js, prevJs);
      if (eTs !== eJs) {
        fail(
          `equals ${JSON.stringify(s)} vs ${fmt(prevTs)}: ts=${eTs} js=${eJs}`,
        );
      }
    }
    prevTs = ts;
    prevJs = js;
  }
}

/** Constructor parity on one tuple: throw agreement, and when both build,
 * field-identical normalization + equalsExact agreement in both directions. */
function checkCtor(num: number, den: number, unit: ExactUnit, rad?: number) {
  ctorCases++;
  let ts: Exact | null = null;
  let js: Exact | null = null;
  let tsThrew = false;
  let jsThrew = false;
  try {
    ts = exactTs(num, den, unit, rad);
  } catch {
    tsThrew = true;
  }
  try {
    js = serverExact.exact(num, den, unit, rad);
  } catch {
    jsThrew = true;
  }
  const tuple = `exact(${num}, ${den}, ${unit}, ${rad})`;
  if (tsThrew !== jsThrew) {
    fail(`${tuple}: ts ${tsThrew ? "threw" : "built"}, js ${jsThrew ? "threw" : "built"}`);
    return;
  }
  if (ts === null || js === null) return; // both threw — agreement
  if (!sameValue(ts, js)) {
    fail(`${tuple}: ts=${fmt(ts)} js=${fmt(js)}`);
    return;
  }
  equalsChecks++;
  if (!equalsExactTs(ts, js) || !serverExact.equalsExact(ts, js)) {
    fail(`${tuple}: built values not self-equal`);
  }
}

// ── 1. Edge shapes (the graders' known corners, checked verbatim) ──────────
const EDGES = [
  "−0", "0,5", "1/2", "2π/3", "√12/4", "π", "√2", "", "/", ",", "−",
  // double glyphs and near-misses
  "--5", "−−3", "ππ", "√√2", "//", ",,", "1,,5", "1//2", "5,5,5", "√2√3",
  "3π/π", "π/√2", "2π√3", "1,5√2", "1,5/3", ",5", "5,", "5/", "/3", "√", "-",
  "−π", "-π/2", "1,5π", "0,50", "√12/2", "√3", "2,09", "0/5", "5/0", "-0,25",
  "√1", "√999", "√1000", "0π", "0√2", "0,0", "00", "007", "π0", "2π3",
  // digit-count gate: 9 digits pass, 10 reject — both sides must agree
  "999999999", "9999999999", "0,000000001", "0,0000000001", "1/999999999",
  "1/9999999999", ".", " ", "  −  ", "5 / 8", "√ 2", "1 2", "−.5", "-.5",
];
for (const s of EDGES) checkString(s);

// ── 2. Seeded fuzz ─────────────────────────────────────────────────────────
const rng: Rng = mulberry32(0xc0ffee);

/** A valid-for-exact() random tuple (π and √ never combined). */
function randTuple(r: Rng): [number, number, ExactUnit, number | undefined] {
  const unit = pick(r, ["one", "one", "one", "pi"] as const);
  const rad = unit === "one" && r() < 0.4 ? randInt(r, 1, 200) : undefined;
  const num = randInt(r, -999, 999);
  let den = randInt(r, -60, 60);
  if (den === 0) den = 7; // den 0 throws by contract; covered in section 3
  return [num, den, unit, rad];
}

// Rendered round-trips: build an Exact, render it the way packs/keys do
// (toPlain — the console generates tournament answer keys with it), then
// parse the string plus its keypad-glyph variants through both sides.
for (let i = 0; i < 1500; i++) {
  const [num, den, unit, rad] = randTuple(rng);
  checkCtor(num, den, unit, rad);

  // Scaled twin must be equal in BOTH implementations (known truth, not just
  // agreement): k·num / k·den is the same value.
  const k = randInt(rng, 2, 9);
  equalsChecks += 2;
  const a: Exact = { num, den, unit, ...(rad !== undefined ? { rad } : {}) };
  const b: Exact = {
    num: num * k,
    den: den * k,
    unit,
    ...(rad !== undefined ? { rad } : {}),
  };
  if (!equalsExactTs(a, b)) fail(`ts scaled twin unequal ${fmt(a)} ×${k}`);
  if (!serverExact.equalsExact(a, b)) fail(`js scaled twin unequal ${fmt(a)} ×${k}`);

  const value = exactTs(num, den, unit, rad);
  const plain = toPlain(value, rng() < 0.5 ? "fraction" : "decimal");
  checkString(plain);
  checkString(plain.replace(/-/g, "−")); // keypad minus glyph
  checkString(plain.replace(",", "."));  // dot decimals normalize to comma
  checkString(` ${plain} `);             // whitespace is stripped pre-parse
}

// Grammar-shaped strings: assembled from the answer-form pieces with random
// presence/absence, so accept AND reject branches both get heavy traffic.
function grammarCase(r: Rng): string {
  let s = "";
  if (r() < 0.35) s += pick(r, ["-", "−"]);
  if (r() < 0.85) s += String(randInt(r, 0, 9999));
  if (r() < 0.3) s += pick(r, [",", "."]) + String(randInt(r, 0, 999));
  const factor = r();
  if (factor < 0.25) s += "π";
  else if (factor < 0.5) s += "√" + (r() < 0.9 ? String(randInt(r, 0, 1200)) : "");
  if (r() < 0.4) s += "/" + (r() < 0.9 ? String(randInt(r, 0, 60)) : "");
  return s;
}
for (let i = 0; i < 2500; i++) checkString(grammarCase(rng));

// Glyph soup: anything the keypad glyphs (plus '.', '-', space) can spell.
const SOUP = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  ",", ".", "−", "-", "π", "√", "/", " ",
];
for (let i = 0; i < 2500; i++) {
  let s = "";
  const len = randInt(rng, 0, 10);
  for (let j = 0; j < len; j++) s += pick(rng, SOUP);
  checkString(s);
}

// ── 3. Constructor contract corners (throw agreement matters too) ──────────
checkCtor(1, 0, "one");            // den 0
checkCtor(1.5, 2, "one");          // non-integer num
checkCtor(1, 2.5, "one");          // non-integer den
checkCtor(1, 2, "one", 0);         // rad < 1
checkCtor(1, 2, "one", -3);
checkCtor(1, 2, "one", 2.5);       // non-integer rad
checkCtor(1, 2, "pi", 2);          // π and √ never combine
checkCtor(1, 2, "pi", 1);          // rad 1 collapses — allowed with π
checkCtor(NaN, 1, "one");
checkCtor(Infinity, 1, "one");
checkCtor(1, NaN, "one");
checkCtor(0, 5, "pi");             // 0π normalizes to unit "one"
checkCtor(0, 5, "one", 7);         // 0√7 likewise
checkCtor(-6, -4, "one");          // negative den flips sign
checkCtor(4, 1, "one", 12);        // √12 → 2√3 square-factor extraction
checkCtor(3, 1, "one", 4);         // √4 → plain integer
checkCtor(1, 1, "one", 144);       // full square
checkCtor(1, 1, "one", 720);       // 720 = 144·5 → 12√5
for (let i = 0; i < 300; i++) {
  // Random mix of valid and deliberately broken tuples.
  const [num, den, unit, rad] = randTuple(rng);
  const breakIt = rng();
  if (breakIt < 0.2) checkCtor(num + 0.5, den, unit, rad);
  else if (breakIt < 0.4) checkCtor(num, 0, unit, rad);
  else if (breakIt < 0.6) checkCtor(num, den, "pi", randInt(rng, 2, 50));
  else if (breakIt < 0.8) checkCtor(num, den, unit, randInt(rng, -5, 1));
  else checkCtor(num, den, unit, rad === undefined ? undefined : rad + 0.5);
}

// ── verdict ────────────────────────────────────────────────────────────────
console.log(
  `exact-port-parity: ${stringCases} parse cases, ${ctorCases} constructor cases, ${equalsChecks} equals checks`,
);
if (failures === 0) console.log("exact-port-parity: ALL OK");
else {
  console.error(`exact-port-parity: ${failures} mismatch(es)`);
  process.exit(1);
}
