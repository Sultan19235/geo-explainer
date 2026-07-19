// Sanity battery for the drill math core + its quiz-pack integration.
// Run: npx tsx scripts/drill-sanity.ts
import { readFileSync } from "node:fs";
import { exact, equalsExact, parseExact, toKatex, toPlain } from "../src/lib/drill/exact";
import { mulberry32 } from "../src/lib/drill/rng";
import {
  decodeDrillConfig,
  defaultConfig,
  encodeDrillConfig,
} from "../src/lib/drill/types";
import { radianDegreeTopic } from "../src/lib/drill/topics/radian-degree";
import { DRILL_TOPICS } from "../src/lib/drill/registry";
import {
  loadAndValidateDrillTopicCode,
  validateVisual,
} from "../src/lib/drill/topic-schema";
import { checkInputAnswer, validatePack } from "../src/lib/quiz/pack";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

// ── parsing ──
const cases: Array<[string, ReturnType<typeof exact> | null]> = [
  ["120", exact(120)],
  ["-8", exact(-8)],
  ["43,5", exact(87, 2)],
  ["0,50", exact(1, 2)],
  ["-0,25", exact(-1, 4)],
  ["7/18", exact(7, 18)],
  ["2π/3", exact(2, 3, "pi")],
  ["π/6", exact(1, 6, "pi")],
  ["π", exact(1, 1, "pi")],
  ["3π", exact(3, 1, "pi")],
  ["-π/2", exact(-1, 2, "pi")],
  ["1,5π", exact(3, 2, "pi")],
  ["−π/2", exact(-1, 2, "pi")], // unicode minus from the keypad
  ["0", exact(0)],
  ["4/6", exact(2, 3)], // equivalent fraction accepted
  ["√2", exact(1, 1, "one", 2)],
  ["2√3", exact(2, 1, "one", 3)],
  ["√2/2", exact(1, 2, "one", 2)],
  ["-√3/3", exact(-1, 3, "one", 3)],
  ["√12/2", exact(1, 1, "one", 3)], // √12 = 2√3 → 2√3/2 = √3
  ["√4", exact(2)], // perfect square folds away
  ["", null],
  [",5", null],
  ["3,", null],
  ["1,2,3", null],
  ["1,5/3", null], // comma inside fraction
  ["/3", null],
  ["5/", null],
  ["5/0", null],
  ["-", null],
  ["π5", null], // digit after π
  ["√", null], // radical needs its number
  ["1,5√2", null], // comma never mixes with a radical
  ["√1", null],
];
for (const [raw, want] of cases) {
  const got = parseExact(raw);
  if (want === null) check(`parse "${raw}" rejected`, got === null);
  else check(`parse "${raw}"`, got !== null && equalsExact(got, want));
}

// ── equality semantics ──
check("2π/3 ≠ 2,09", !equalsExact(parseExact("2π/3")!, exact(209, 100)));
check("120 ≠ 120π", !equalsExact(exact(120), exact(120, 1, "pi")));
check("0 = 0π", equalsExact(exact(0), exact(0, 1, "pi")));
check("43,50 = 43,5", equalsExact(parseExact("43,50")!, parseExact("43,5")!));
check("√2/2 ≠ 0,7", !equalsExact(parseExact("√2/2")!, exact(7, 10)));
check("√2 ≠ √3", !equalsExact(parseExact("√2")!, parseExact("√3")!));
check("2√3/2 = √3", equalsExact(parseExact("2√3/2")!, parseExact("√3")!));

// ── formatting ──
check("katex 2π/3", toKatex(exact(2, 3, "pi")) === "\\frac{2\\pi}{3}");
check("katex π", toKatex(exact(1, 1, "pi")) === "\\pi");
check("katex -7/18", toKatex(exact(-7, 18)) === "-\\frac{7}{18}");
check("katex 43,5 dec", toKatex(exact(87, 2), "decimal") === "43{,}5");
check("plain 5π/6", toPlain(exact(150, 180, "pi")) === "5π/6");
check("plain 0,3 dust", toPlain(exact(3, 10), "decimal") === "0,3");
check("katex √2/2", toKatex(exact(1, 2, "one", 2)) === "\\frac{\\sqrt{2}}{2}");
check("katex -√3", toKatex(exact(-1, 1, "one", 3)) === "-\\sqrt{3}");
check("plain 2√3", toPlain(exact(2, 1, "one", 3)) === "2√3");

// ── generators: 500 seeded problems each, invariants must hold ──
for (const topic of DRILL_TOPICS) {
  const config = defaultConfig(topic);
  for (let i = 0; i < 500; i++) {
    const p = topic.generate(mulberry32(i * 2654435761 + 1), config);
    const a = p.answer;
    check(`${topic.id}#${i} finite`, Number.isFinite(a.num) && a.den > 0);
    check(`${topic.id}#${i} prompt kz/ru`, p.prompt.kz.length > 0 && p.prompt.ru.length > 0);
    // The canonical answer must round-trip through the student parser using
    // only the keys this problem's keypad offers.
    const typed = toPlain(a, p.answerStyle);
    const parsed = parseExact(typed);
    check(`${topic.id}#${i} roundtrip "${typed}"`, parsed !== null && equalsExact(parsed, a));
    if (topic.id === "decimal-add") {
      check(`decimal-add#${i} positive`, a.num > 0);
    }
  }
}

// Same seed → same problem (retry / race reproducibility).
const cfg = defaultConfig(radianDegreeTopic);
const p1 = radianDegreeTopic.generate(mulberry32(42), cfg);
const p2 = radianDegreeTopic.generate(mulberry32(42), cfg);
check("seed reproducibility", JSON.stringify(p1) === JSON.stringify(p2));

// ── pack integration: validation + grading + config codec ──
const drillQ = (extra: object) => ({
  version: 1,
  title: "T",
  questions: [{ type: "drill", text: "Есепте: $1+1$", ...extra }],
});

{
  const ok = validatePack(drillQ({ answer: "2π/3" }));
  check("pack: valid drill question", ok.errors.length === 0);
  check(
    "pack: keys inferred pi+frac",
    JSON.stringify(ok.pack?.questions[0].keys) === '["pi","frac"]',
  );
  const explicit = validatePack(drillQ({ answer: "0,5", keys: ["frac"] }));
  check(
    "pack: explicit keys union inferred",
    explicit.errors.length === 0 &&
      new Set(explicit.pack?.questions[0].keys).has("comma") &&
      new Set(explicit.pack?.questions[0].keys).has("frac"),
  );
  check("pack: bad answer rejected", validatePack(drillQ({ answer: "abc" })).errors.length > 0);
  check("pack: comma-in-fraction rejected", validatePack(drillQ({ answer: "1,5/3" })).errors.length > 0);
  check(
    "pack: accept rejected on drill",
    validatePack(drillQ({ answer: "2", accept: ["2,0"] })).errors.length > 0,
  );
  check(
    "pack: bad keys rejected",
    validatePack(drillQ({ answer: "2", keys: ["percent"] })).errors.length > 0,
  );

  // grading dispatch
  const q = ok.pack!.questions[0];
  check("grade: canonical", checkInputAnswer("2π/3", q));
  check("grade: equivalent fraction", checkInputAnswer("4π/6", q));
  check("grade: decimal impostor rejected", !checkInputAnswer("2,09", q));
  check("grade: garbage rejected", !checkInputAnswer("abc", q));
}

{
  const gen = (generator: object) =>
    validatePack({ version: 1, title: "T", generator, questions: [] });
  const ok = gen({ type: "drill", topic: "decimal-add", config: { places: ["1"] } });
  check("pack: valid drill generator", ok.errors.length === 0);
  check(
    "pack: generator config kept",
    ok.pack?.generator?.type === "drill" &&
      JSON.stringify(ok.pack.generator.config) === '{"places":["1"]}',
  );
  check("pack: unknown topic rejected", gen({ type: "drill", topic: "nope" }).errors.length > 0);
  check(
    "pack: unknown config group rejected",
    gen({ type: "drill", topic: "decimal-add", config: { bogus: ["1"] } }).errors.length > 0,
  );
  check(
    "pack: unknown config choice rejected",
    gen({ type: "drill", topic: "decimal-add", config: { places: ["9"] } }).errors.length > 0,
  );
}

{
  const config = { direction: ["deg2rad", "rad2deg"], range: ["basic"] };
  const decoded = decodeDrillConfig(encodeDrillConfig(config));
  check("config codec roundtrip", JSON.stringify(decoded) === JSON.stringify(config));
  check("config codec empty", decodeDrillConfig("") === null && decodeDrillConfig(null) === null);
}

// The shipped sample pack must always validate.
{
  const raw = JSON.parse(
    readFileSync(new URL("../packs/drill-radian-sample.json", import.meta.url), "utf8"),
  );
  const res = validatePack(raw);
  check(`sample pack valid (${res.errors.join("; ")})`, res.errors.length === 0);
}

// ── uploaded-generator pipeline (docs example through the real harness) ──
{
  const code = readFileSync(
    new URL("../docs/examples/integer-add.drill.js", import.meta.url),
    "utf8",
  );
  const loaded = loadAndValidateDrillTopicCode(code);
  check(`example generator passes harness (${loaded.errors.join("; ")})`, loaded.topic !== null);
  if (loaded.topic) {
    check("example meta id", loaded.topic.meta.id === "integer-add");
    const p = loaded.topic.generate(mulberry32(5), { ops: ["add"], range: ["small"] });
    check("example visual present", p.visual?.type === "number-line");
  }

  // Harness rejections: broken code, wrong shape, non-determinism.
  check(
    "harness: syntax error rejected",
    loadAndValidateDrillTopicCode("this is not js").topic === null,
  );
  check(
    "harness: no register call rejected",
    loadAndValidateDrillTopicCode("const x = 1;").topic === null,
  );
  check(
    "harness: built-in id collision rejected",
    loadAndValidateDrillTopicCode(
      code.replace('id: "integer-add"', 'id: "logarithm"'),
    ).topic === null,
  );
  const nonDet = `registerDrillTopic({
    apiVersion: 1, id: "bad-random",
    title: {kz: "т", ru: "т"}, subtitle: {kz: "т", ru: "т"},
    options: [{id: "g", label: {kz: "т", ru: "т"}, choices: [{id: "a", label: {kz: "т", ru: "т"}}], defaults: ["a"]}],
    generate(rng, config) {
      const n = Math.floor(Math.random() * 10) + 1;
      return { prompt: {kz: "$1+1$", ru: "$1+1$"}, answer: exact(n), answerStyle: "fraction", keys: [], variant: "x" };
    },
  });`;
  check(
    "harness: Math.random rejected as non-deterministic",
    loadAndValidateDrillTopicCode(nonDet).topic === null,
  );
}

// ── figure brick validation ──
{
  const good = {
    type: "figure",
    view: { xMin: -1.4, xMax: 1.4, yMin: -1.4, yMax: 1.4 },
    axes: true,
    shapes: [
      { kind: "circle", center: [0, 0], radius: 1 },
      { kind: "segment", from: [0, 0], to: [0.5, 0.866], color: "red" },
      { kind: "arc", center: [0, 0], radius: 0.3, startDeg: 0, endDeg: 60, arrow: true },
      { kind: "label", at: [0.7, 0.3], text: "60°" },
      { kind: "polygon", points: [[0, 0], [1, 0], [0.5, 0.8]], fill: true },
    ],
    reveal: [{ kind: "point", at: [0.5, 0], label: "0,5", color: "green" }],
  };
  check("figure: valid accepted", validateVisual(good, "t").length === 0);
  check(
    "figure: bad view rejected",
    validateVisual({ type: "figure", view: { xMin: 1, xMax: 0, yMin: 0, yMax: 1 }, shapes: [] }, "t").length > 0,
  );
  check(
    "figure: unknown shape kind rejected",
    validateVisual(
      { type: "figure", view: good.view, shapes: [{ kind: "spline", from: [0, 0], to: [1, 1] }] },
      "t",
    ).length > 0,
  );
  check(
    "figure: bad color rejected",
    validateVisual(
      { type: "figure", view: good.view, shapes: [{ kind: "point", at: [0, 0], color: "pink" }] },
      "t",
    ).length > 0,
  );
  check(
    "figure: NaN coords rejected",
    validateVisual(
      { type: "figure", view: good.view, shapes: [{ kind: "segment", from: [NaN, 0], to: [1, 1] }] },
      "t",
    ).length > 0,
  );
  // Through the pack path too: an authored drill question may carry a figure.
  const packRes = validatePack({
    title: "t",
    questions: [
      { type: "drill", text: "Есепте: $1+1$", answer: "2", visual: good },
    ],
  });
  check(`figure: pack question accepted (${packRes.errors.join("; ")})`, packRes.errors.length === 0);
}

if (failures === 0) console.log("drill-sanity: ALL OK");
else {
  console.error(`drill-sanity: ${failures} failure(s)`);
  process.exit(1);
}
