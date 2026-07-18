// Topic: дәреже қасиеттері — compute the value (§14–15 pattern: 5⁶:5⁴,
// 7⁹·7⁵/7¹²). Exponent arithmetic keeps every answer a small exact number;
// the result exponent is capped so answers stay mental-math sized.

import { exact, katexDecimal } from "../exact";
import type { Rng } from "../rng";
import { pick, randInt } from "../rng";
import type { DrillProblem, DrillTopic } from "../types";
import { groupSelection } from "../types";

const kzRu = (body: string) => ({
  kz: `Есепте: $${body}$`,
  ru: `Вычислите: $${body}$`,
});

// Integer bases with a cap on the result exponent (b^cap ≤ ~1000).
const INT_BASES: Array<{ b: number; maxExp: number }> = [
  { b: 2, maxExp: 3 },
  { b: 3, maxExp: 3 },
  { b: 5, maxExp: 3 },
  { b: 7, maxExp: 2 },
  { b: 10, maxExp: 3 },
];

// b^n : b^m = b^(n-m)
function quotient(rng: Rng): DrillProblem {
  const { b, maxExp } = pick(rng, INT_BASES);
  const diff = randInt(rng, 1, maxExp);
  const m = randInt(rng, 3, 12);
  const n = m + diff;
  const value = b ** diff;
  const body = `${b}^{${n}} : ${b}^{${m}}`;
  return {
    prompt: kzRu(body),
    answer: exact(value),
    answerStyle: "fraction",
    keys: [],
    solution: {
      kz: `$${body} = ${b}^{${n}-${m}} = ${b}^{${diff}} = ${value}$`,
      ru: `$${body} = ${b}^{${n}-${m}} = ${b}^{${diff}} = ${value}$`,
    },
    variant: "quotient",
  };
}

// (b^n · b^m) / b^k = b^(n+m−k), result exponent 0..cap (0 → answer 1, the
// edge the textbook loves).
function fraction(rng: Rng): DrillProblem {
  const { b, maxExp } = pick(rng, INT_BASES);
  const exp = randInt(rng, 0, maxExp);
  const n = randInt(rng, 3, 9);
  const m = randInt(rng, 2, 8);
  const k = n + m - exp;
  const value = b ** exp;
  const body = `\\frac{${b}^{${n}} \\cdot ${b}^{${m}}}{${b}^{${k}}}`;
  return {
    prompt: kzRu(body),
    answer: exact(value),
    answerStyle: "fraction",
    keys: [],
    solution: {
      kz: `$${body} = ${b}^{${n}+${m}-${k}} = ${b}^{${exp}} = ${value}$`,
      ru: `$${body} = ${b}^{${n}+${m}-${k}} = ${b}^{${exp}} = ${value}$`,
    },
    variant: "fraction",
  };
}

// Decimal base: 0,5¹⁰ : 0,5⁷ = 0,5³ = 0,125 — exact via scaled integers.
const DEC_BASES: Array<{ num: number; den: number; tex: string; maxExp: number }> = [
  { num: 1, den: 2, tex: "0{,}5", maxExp: 3 },
  { num: 1, den: 5, tex: "0{,}2", maxExp: 3 },
  { num: 1, den: 10, tex: "0{,}1", maxExp: 3 },
];

function decimal(rng: Rng): DrillProblem {
  const base = pick(rng, DEC_BASES);
  const diff = randInt(rng, 1, base.maxExp);
  const m = randInt(rng, 3, 9);
  const n = m + diff;
  const answer = exact(base.num ** diff, base.den ** diff);
  const body = `${base.tex}^{${n}} : ${base.tex}^{${m}}`;
  const shown = katexDecimal(base.num / base.den);
  return {
    prompt: kzRu(body),
    answer,
    answerStyle: "decimal",
    keys: ["comma"],
    solution: {
      kz: `$${body} = ${base.tex}^{${n}-${m}} = ${shown}^{${diff}} = ${katexDecimal(answer.num / answer.den)}$`,
      ru: `$${body} = ${base.tex}^{${n}-${m}} = ${shown}^{${diff}} = ${katexDecimal(answer.num / answer.den)}$`,
    },
    variant: "decimal",
  };
}

export const powersTopic: DrillTopic = {
  id: "powers",
  title: { kz: "Дәреже қасиеттері", ru: "Свойства степени" },
  subtitle: { kz: "7-сынып · алгебра", ru: "7 класс · алгебра" },
  options: [
    {
      id: "kinds",
      label: { kz: "Есеп түрлері", ru: "Типы заданий" },
      choices: [
        { id: "quotient", label: { kz: "Бөлінді: aⁿ : aᵐ", ru: "Частное: aⁿ : aᵐ" } },
        { id: "fraction", label: { kz: "Бөлшек өрнек", ru: "Дробное выражение" } },
        { id: "decimal", label: { kz: "Ондық негіз (0,5)", ru: "Десятичное основание (0,5)" } },
      ],
      defaults: ["quotient", "fraction"],
    },
  ],
  generate(rng, config) {
    const kind = pick(rng, groupSelection(this, config, "kinds"));
    if (kind === "fraction") return fraction(rng);
    if (kind === "decimal") return decimal(rng);
    return quotient(rng);
  },
};
