// Topic: значения sin/cos/tg/ctg стандартных углов (§85 pattern).
// A curated table, not a formula: there are only ~40 meaningful facts, so the
// "generator" samples the table filtered by the teacher's ticks. Undefined
// values (tg 90°, ctg 0°) simply aren't in the table.

import { exact, toKatex, toPlain, type Exact } from "../exact";
import { pick } from "../rng";
import type { DrillKey, DrillTopic } from "../types";
import { groupSelection, keysForAnswer } from "../types";

type Fn = "sin" | "cos" | "tg" | "ctg";

const FN_TEX: Record<Fn, string> = {
  sin: "\\sin",
  cos: "\\cos",
  tg: "\\tg",
  ctg: "\\ctg",
};

// Shorthand builders for the table.
const int = (n: number) => exact(n);
const half = (sign = 1) => exact(sign, 2);
const r2half = (sign = 1) => exact(sign, 2, "one", 2); // ±√2/2
const r3half = (sign = 1) => exact(sign, 2, "one", 3); // ±√3/2
const r3 = (sign = 1) => exact(sign, 1, "one", 3); // ±√3
const r3third = (sign = 1) => exact(sign, 3, "one", 3); // ±√3/3

type Entry = { deg: number; fn: Fn; value: Exact };

const QUARTER1: Entry[] = [
  { deg: 0, fn: "sin", value: int(0) },
  { deg: 30, fn: "sin", value: half() },
  { deg: 45, fn: "sin", value: r2half() },
  { deg: 60, fn: "sin", value: r3half() },
  { deg: 90, fn: "sin", value: int(1) },
  { deg: 0, fn: "cos", value: int(1) },
  { deg: 30, fn: "cos", value: r3half() },
  { deg: 45, fn: "cos", value: r2half() },
  { deg: 60, fn: "cos", value: half() },
  { deg: 90, fn: "cos", value: int(0) },
  { deg: 0, fn: "tg", value: int(0) },
  { deg: 30, fn: "tg", value: r3third() },
  { deg: 45, fn: "tg", value: int(1) },
  { deg: 60, fn: "tg", value: r3() },
  { deg: 30, fn: "ctg", value: r3() },
  { deg: 45, fn: "ctg", value: int(1) },
  { deg: 60, fn: "ctg", value: r3third() },
  { deg: 90, fn: "ctg", value: int(0) },
];

const BEYOND: Entry[] = [
  { deg: 120, fn: "sin", value: r3half() },
  { deg: 135, fn: "sin", value: r2half() },
  { deg: 150, fn: "sin", value: half() },
  { deg: 180, fn: "sin", value: int(0) },
  { deg: 270, fn: "sin", value: int(-1) },
  { deg: 360, fn: "sin", value: int(0) },
  { deg: 120, fn: "cos", value: half(-1) },
  { deg: 135, fn: "cos", value: r2half(-1) },
  { deg: 150, fn: "cos", value: r3half(-1) },
  { deg: 180, fn: "cos", value: int(-1) },
  { deg: 270, fn: "cos", value: int(0) },
  { deg: 360, fn: "cos", value: int(1) },
  { deg: 120, fn: "tg", value: r3(-1) },
  { deg: 135, fn: "tg", value: int(-1) },
  { deg: 150, fn: "tg", value: r3third(-1) },
  { deg: 180, fn: "tg", value: int(0) },
  { deg: 360, fn: "tg", value: int(0) },
  { deg: 120, fn: "ctg", value: r3third(-1) },
  { deg: 135, fn: "ctg", value: int(-1) },
  { deg: 150, fn: "ctg", value: r3(-1) },
  { deg: 270, fn: "ctg", value: int(0) },
];

/** "45°" or "\frac{\pi}{4}" — the radian form reuses the exact π renderer. */
function angleTex(deg: number, unit: "deg" | "rad"): string {
  if (unit === "deg") return `${deg}°`;
  if (deg === 0) return "0";
  return toKatex(exact(deg, 180, "pi"));
}

export const trigValuesTopic: DrillTopic = {
  id: "trig-values",
  title: {
    kz: "Тригонометриялық функция мәндері",
    ru: "Значения тригонометрических функций",
  },
  subtitle: { kz: "9–10 сынып · стандарт бұрыштар", ru: "9–10 класс · стандартные углы" },
  options: [
    {
      id: "funcs",
      label: { kz: "Функциялар", ru: "Функции" },
      choices: [
        { id: "sincos", label: { kz: "sin, cos", ru: "sin, cos" } },
        { id: "tgctg", label: { kz: "tg, ctg", ru: "tg, ctg" } },
      ],
      defaults: ["sincos", "tgctg"],
    },
    {
      id: "units",
      label: { kz: "Бұрыш жазылуы", ru: "Запись угла" },
      choices: [
        { id: "rad", label: { kz: "Радианмен (π/4)", ru: "В радианах (π/4)" } },
        { id: "deg", label: { kz: "Градуспен (45°)", ru: "В градусах (45°)" } },
      ],
      defaults: ["rad", "deg"],
    },
    {
      id: "range",
      label: { kz: "Бұрыштар", ru: "Углы" },
      choices: [
        { id: "q1", label: { kz: "0° – 90°", ru: "0° – 90°" } },
        { id: "beyond", label: { kz: "90°-тан тыс", ru: "За пределами 90°" } },
      ],
      defaults: ["q1"],
    },
  ],
  generate(rng, config) {
    const funcs = groupSelection(this, config, "funcs");
    const ranges = groupSelection(this, config, "range");
    const unit = pick(rng, groupSelection(this, config, "units")) as "deg" | "rad";

    const pool = [
      ...(ranges.includes("q1") ? QUARTER1 : []),
      ...(ranges.includes("beyond") ? BEYOND : []),
    ].filter(
      (e) =>
        (funcs.includes("sincos") && (e.fn === "sin" || e.fn === "cos")) ||
        (funcs.includes("tgctg") && (e.fn === "tg" || e.fn === "ctg")),
    );
    const entry = pick(rng, pool.length > 0 ? pool : QUARTER1);

    const body = `${FN_TEX[entry.fn]} ${angleTex(entry.deg, unit)}`;
    const plain = toPlain(entry.value);
    // The textbook form is the keypad's form; a plain fraction like 1/2 also
    // gets the comma key so 0,5 stays typeable.
    const keys: DrillKey[] = keysForAnswer(plain);
    if (entry.value.den > 1 && entry.value.rad === undefined && !keys.includes("comma")) {
      keys.push("comma");
    }

    const answerTex = toKatex(entry.value);
    return {
      prompt: {
        kz: `Есепте: $${body}$`,
        ru: `Вычислите: $${body}$`,
      },
      answer: entry.value,
      answerStyle: "fraction",
      keys,
      solution: {
        kz: `$${body} = ${answerTex}$`,
        ru: `$${body} = ${answerTex}$`,
      },
      variant: `${entry.fn}-${unit}`,
    };
  },
};
