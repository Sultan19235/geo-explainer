// Topic: логарифм и его свойства (§62 pattern) — compute log values.
// Three kinds: whole answers (log₂16), negative/fraction-base answers
// (log₂⅛, log_{1/2}32), and rational answers (log₁₆64 = 3/2). Arguments are
// built as b^k so every answer is exact by construction.

import { exact } from "../exact";
import type { Rng } from "../rng";
import { pick, randInt } from "../rng";
import type { DrillProblem, DrillTopic } from "../types";
import { groupSelection } from "../types";

// Small bases with power caps that keep arguments readable (≤ 6 digits).
const BASES: Array<{ b: number; maxK: number }> = [
  { b: 2, maxK: 6 },
  { b: 3, maxK: 5 },
  { b: 5, maxK: 4 },
  { b: 6, maxK: 3 },
  { b: 7, maxK: 3 },
  { b: 10, maxK: 5 },
];

const kzRu = (body: string) => ({
  kz: `Есепте: $${body}$`,
  ru: `Вычислите: $${body}$`,
});

// log_b b^k = k  (k=0 → log_b 1, k=1 → log_b b — kept in: they test the
// definition edges the textbook drills too)
function simple(rng: Rng): DrillProblem {
  const { b, maxK } = pick(rng, BASES);
  const k = randInt(rng, 0, maxK);
  const arg = b ** k;
  const body = `\\log_{${b}} ${arg}`;
  return {
    prompt: kzRu(body),
    answer: exact(k),
    answerStyle: "fraction",
    keys: [],
    solution: {
      kz: `$${body} = \\log_{${b}} ${b}^{${k}} = ${k}$`,
      ru: `$${body} = \\log_{${b}} ${b}^{${k}} = ${k}$`,
    },
    variant: "simple",
  };
}

// Negative answers: log_b (1/b^k) = −k, and fraction bases:
// log_{1/b} b^k = −k, log_{1/b} (1/b^k) = k.
function negative(rng: Rng): DrillProblem {
  const { b, maxK } = pick(rng, BASES);
  const k = randInt(rng, 1, maxK);
  const arg = b ** k;
  const shape = pick(rng, ["invArg", "invBase", "invBoth"] as const);
  const baseTex = shape === "invArg" ? `${b}` : `\\frac{1}{${b}}`;
  const argTex = shape === "invBase" ? `${arg}` : `\\frac{1}{${arg}}`;
  const answer = shape === "invBoth" ? k : -k;
  const body = `\\log_{${baseTex}} ${argTex}`;
  const baseStep = shape === "invArg" ? `${b}` : `${b}^{-1}`;
  const argStep = shape === "invBase" ? `${b}^{${k}}` : `${b}^{-${k}}`;
  return {
    prompt: kzRu(body),
    answer: exact(answer),
    answerStyle: "fraction",
    keys: ["minus"],
    solution: {
      kz: `$${body} = \\log_{${baseStep}} ${argStep} = ${answer}$`,
      ru: `$${body} = \\log_{${baseStep}} ${argStep} = ${answer}$`,
    },
    variant: "negative",
  };
}

// Rational answers: log_{b^m} b^n = n/m with n/m deliberately non-integer
// (log₁₆64 = 6/4 = 3/2, log₂₇9 = 2/3).
function rational(rng: Rng): DrillProblem {
  const b = pick(rng, [2, 3] as const);
  const m = pick(rng, b === 2 ? [2, 3, 4] : [2, 3]);
  let n = randInt(rng, 1, b === 2 ? 6 : 4);
  if (n % m === 0) n += 1; // keep the answer a genuine fraction
  const base = b ** m;
  const arg = b ** n;
  const body = `\\log_{${base}} ${arg}`;
  const answer = exact(n, m);
  const reduced =
    answer.den === m ? "" : ` = \\frac{${answer.num}}{${answer.den}}`;
  return {
    prompt: kzRu(body),
    answer,
    answerStyle: "fraction",
    keys: ["frac"],
    solution: {
      kz: `$${body} = \\log_{${b}^{${m}}} ${b}^{${n}} = \\frac{${n}}{${m}}${reduced}$`,
      ru: `$${body} = \\log_{${b}^{${m}}} ${b}^{${n}} = \\frac{${n}}{${m}}${reduced}$`,
    },
    variant: "rational",
  };
}

export const logarithmTopic: DrillTopic = {
  id: "logarithm",
  title: { kz: "Логарифмді есептеу", ru: "Вычисление логарифмов" },
  subtitle: { kz: "11-сынып · алгебра", ru: "11 класс · алгебра" },
  options: [
    {
      id: "kinds",
      label: { kz: "Есеп түрлері", ru: "Типы заданий" },
      choices: [
        { id: "simple", label: { kz: "Бүтін жауап", ru: "Целый ответ" } },
        {
          id: "negative",
          label: { kz: "Теріс жауап, бөлшек негіз", ru: "Отрицательный ответ, дробное основание" },
        },
        { id: "rational", label: { kz: "Бөлшек жауап", ru: "Дробный ответ" } },
      ],
      defaults: ["simple", "negative"],
    },
  ],
  generate(rng, config) {
    const kind = pick(rng, groupSelection(this, config, "kinds"));
    if (kind === "negative") return negative(rng);
    if (kind === "rational") return rational(rng);
    return simple(rng);
  },
};
