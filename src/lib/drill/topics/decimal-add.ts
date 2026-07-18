// Topic: сложение и вычитание десятичных дробей (§4 pattern).
// Numbers are generated as scaled integers (14,6 → 146 tenths) so sums are
// exact; every term has a nonzero fractional part, and subtraction chains are
// re-rolled until the result stays positive.

import { exact, katexDecimal } from "../exact";
import type { Rng } from "../rng";
import { pick, randInt } from "../rng";
import type { DrillProblem, DrillTopic } from "../types";
import { groupSelection } from "../types";

/** A number with `places` decimals, as an integer scaled by 10^places. */
function scaledTerm(rng: Rng, scale: number): number {
  const whole = randInt(rng, 1, 99);
  const frac = randInt(rng, 1, scale - 1); // never a whole number in disguise
  return whole * scale + frac;
}

export const decimalAddTopic: DrillTopic = {
  id: "decimal-add",
  title: {
    kz: "Ондық бөлшектерді қосу және азайту",
    ru: "Сложение и вычитание десятичных дробей",
  },
  subtitle: { kz: "5-сынып · арифметика", ru: "5 класс · арифметика" },
  options: [
    {
      id: "ops",
      label: { kz: "Амал", ru: "Действие" },
      choices: [
        { id: "add", label: { kz: "Қосу", ru: "Сложение" } },
        { id: "sub", label: { kz: "Азайту", ru: "Вычитание" } },
      ],
      defaults: ["add", "sub"],
    },
    {
      id: "terms",
      label: { kz: "Сандар саны", ru: "Количество чисел" },
      choices: [
        { id: "2", label: { kz: "2 сан", ru: "2 числа" } },
        { id: "3", label: { kz: "3 сан", ru: "3 числа" } },
      ],
      defaults: ["2"],
    },
    {
      id: "places",
      label: { kz: "Үтірден кейін", ru: "Знаков после запятой" },
      choices: [
        { id: "1", label: { kz: "1 таңба", ru: "1 знак" } },
        { id: "2", label: { kz: "2 таңба", ru: "2 знака" } },
      ],
      defaults: ["1"],
    },
  ],
  generate(rng, config) {
    const ops = groupSelection(this, config, "ops");
    const termCount = Number(pick(rng, groupSelection(this, config, "terms")));
    const scale = 10 ** Number(pick(rng, groupSelection(this, config, "places")));

    // Re-roll until the running result stays positive (subtraction chains).
    let terms: number[] = [];
    let signs: number[] = [];
    let total = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      terms = Array.from({ length: termCount }, () => scaledTerm(rng, scale));
      signs = terms.map((_, i) => (i === 0 ? 1 : pick(rng, ops) === "sub" ? -1 : 1));
      total = terms.reduce((acc, t, i) => acc + signs[i] * t, 0);
      if (total > 0) break;
      if (attempt === 29) signs = terms.map(() => 1); // give up: all plus
    }
    if (signs.every((s) => s === 1)) total = terms.reduce((a, t) => a + t, 0);

    const body = terms
      .map((t, i) => {
        const num = katexDecimal(t / scale);
        return i === 0 ? num : `${signs[i] === 1 ? "+" : "-"} ${num}`;
      })
      .join(" ");
    const answer = exact(total, scale);
    const hasSub = signs.some((s) => s === -1);

    return {
      prompt: {
        kz: `Есепте: $${body}$`,
        ru: `Вычислите: $${body}$`,
      },
      answer,
      answerStyle: "decimal",
      keys: ["comma"],
      solution: {
        kz: `$${body} = ${katexDecimal(total / scale)}$`,
        ru: `$${body} = ${katexDecimal(total / scale)}$`,
      },
      variant: hasSub ? "sub" : "add",
    };
  },
};
