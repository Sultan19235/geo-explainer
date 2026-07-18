// Topic: радианная мера угла — градусы ↔ радианы (§84 pattern).
// Angles are multiples of 5° so answers are clean π-fractions (105° → 7π/12);
// the "big" range adds the 375°–1080° tail of the textbook set.

import { exact, toKatex } from "../exact";
import type { Rng } from "../rng";
import { pick, randInt } from "../rng";
import type { DrillProblem, DrillTopic } from "../types";
import { groupSelection } from "../types";

function basicAngle(rng: Rng): number {
  return randInt(rng, 1, 72) * 5; // 5°..360°
}

function bigAngle(rng: Rng): number {
  return randInt(rng, 25, 72) * 15; // 375°..1080°
}

function degToRad(deg: number): DrillProblem {
  const answer = exact(deg, 180, "pi");
  const rad = toKatex(answer);
  return {
    prompt: {
      kz: `Бұрыштың радиандық өлшемін тап: $${deg}°$`,
      ru: `Найдите радианную меру угла: $${deg}°$`,
    },
    answer,
    answerStyle: "fraction",
    keys: ["pi", "frac"],
    solution: {
      kz: `$${deg}° = ${deg} \\cdot \\frac{\\pi}{180} = ${rad}$`,
      ru: `$${deg}° = ${deg} \\cdot \\frac{\\pi}{180} = ${rad}$`,
    },
    variant: "deg2rad",
  };
}

function radToDeg(deg: number): DrillProblem {
  const radian = exact(deg, 180, "pi");
  const rad = toKatex(radian);
  const n = Math.abs(radian.num);
  const numer = n === 1 ? "180°" : `${n} \\cdot 180°`;
  const step = radian.den === 1 ? numer : `\\frac{${numer}}{${radian.den}}`;
  return {
    prompt: {
      kz: `Бұрыштың градустық өлшемін тап: $${rad}$`,
      ru: `Найдите градусную меру угла: $${rad}$`,
    },
    answer: exact(deg),
    answerStyle: "fraction",
    keys: [],
    solution: {
      kz: `$${rad} = ${step} = ${deg}°$`,
      ru: `$${rad} = ${step} = ${deg}°$`,
    },
    variant: "rad2deg",
  };
}

export const radianDegreeTopic: DrillTopic = {
  id: "radian-degree",
  title: { kz: "Бұрыштың радиандық өлшемі", ru: "Радианная мера угла" },
  subtitle: {
    kz: "Градус ↔ радиан аудару · 9–10 сынып",
    ru: "Перевод градусы ↔ радианы · 9–10 класс",
  },
  options: [
    {
      id: "direction",
      label: { kz: "Аудару бағыты", ru: "Направление перевода" },
      choices: [
        { id: "deg2rad", label: { kz: "Градус → радиан", ru: "Градусы → радианы" } },
        { id: "rad2deg", label: { kz: "Радиан → градус", ru: "Радианы → градусы" } },
      ],
      defaults: ["deg2rad", "rad2deg"],
    },
    {
      id: "range",
      label: { kz: "Бұрыштар", ru: "Углы" },
      choices: [
        { id: "basic", label: { kz: "360°-қа дейін", ru: "До 360°" } },
        { id: "big", label: { kz: "360°-тан үлкен", ru: "Больше 360°" } },
      ],
      defaults: ["basic"],
    },
  ],
  generate(rng, config) {
    const direction = pick(rng, groupSelection(this, config, "direction"));
    const range = pick(rng, groupSelection(this, config, "range"));
    const deg = range === "big" ? bigAngle(rng) : basicAngle(rng);
    return direction === "rad2deg" ? radToDeg(deg) : degToRad(deg);
  },
};
