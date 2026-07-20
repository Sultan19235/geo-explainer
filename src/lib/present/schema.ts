// Uploaded presentation files: evaluation + shape validation.
//
// A presentation file is a plain .js script that calls
// registerPresentation({...}) exactly once with pure data (no functions).
// Same sandbox philosophy as drill generators (topic-schema.ts): evaluated in
// a stripped Function scope — insurance and a design constraint, not a true
// security boundary (only admins/teachers load files). Errors are readable
// English so an author can paste them into an AI chat and get the file fixed.
//
// Format reference for authors: docs/PRESENTATION_FORMAT.md.

import type {
  Presentation,
  PresentRay,
  PresentSlide,
  PresentText,
  PresentTextStep,
} from "./types";
import { digitsOf, MAX_DIGITS } from "./places";

export const PRESENTATION_API_VERSION = 1;

const ID_RE = /^[a-z0-9][a-z0-9.-]{1,39}$/;
const MAX_CODE_BYTES = 300_000;
const MAX_SLIDES = 80;
const MAX_TEXT_STEPS = 12;
const MAX_CARDS = 20;
const MAX_ORAL_ITEMS = 24;
const MAX_TABLE_NUMBERS = 8;
const MAX_RAY_MAX = 40;
const MAX_RAY_POINTS = 12;
const MAX_JUMPS = 12;
const MAX_CHOICES = 4;
const MAX_SOLUTION_STEPS = 8;
const RAY_MODES = ["show", "build", "reveal", "mark", "jump"];

const SHADOWED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "importScripts",
  "indexedDB",
  "caches",
  "localStorage",
  "sessionStorage",
  "postMessage",
  "close",
  "require",
  "process",
];

export function evaluatePresentationCode(
  code: string,
): { presentation: Presentation } | { errors: string[] } {
  if (typeof code !== "string" || code.trim().length === 0) {
    return { errors: ["The file is empty."] };
  }
  if (code.length > MAX_CODE_BYTES) {
    return {
      errors: [`The file is too large (max ${MAX_CODE_BYTES / 1000} KB).`],
    };
  }

  let registered: unknown = null;
  let calls = 0;
  const registerPresentation = (presentation: unknown) => {
    calls++;
    registered = presentation;
  };

  try {
    const factory = new Function(
      "registerPresentation",
      ...SHADOWED_GLOBALS,
      `"use strict";\n${code}`,
    );
    factory(registerPresentation);
  } catch (e) {
    return {
      errors: [
        `The file crashed while loading: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  if (calls === 0) {
    return { errors: ["The file never called registerPresentation({...})."] };
  }
  if (calls > 1) {
    return {
      errors: [
        "registerPresentation must be called exactly once — one file, one presentation.",
      ],
    };
  }

  const errors = validatePresentation(registered);
  if (errors.length > 0) return { errors };
  return { presentation: registered as Presentation };
}

// ─── Shape validation ───────────────────────────────────────────────────────

function isPText(v: unknown): v is PresentText {
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v !== "object" || v === null) return false;
  const o = v as { kz?: unknown; ru?: unknown };
  if (typeof o.kz !== "string" || o.kz.trim().length === 0) return false;
  if (o.ru !== undefined && typeof o.ru !== "string") return false;
  return true;
}

function checkText(
  value: unknown,
  label: string,
  errors: string[],
  optional = false,
): void {
  if (optional && value === undefined) return;
  if (!isPText(value)) {
    errors.push(
      `${label} must be a non-empty string or { kz: "...", ru: "..." }.`,
    );
  }
}

function checkNumber(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "number" && typeof value !== "string") {
    errors.push(`${label} must be a natural number (or a digit string).`);
    return;
  }
  if (digitsOf(value) === null) {
    errors.push(
      `${label} must be a natural number with at most ${MAX_DIGITS} digits (got ${JSON.stringify(value)}).`,
    );
  }
}

/**
 * Ray fields (max / points / labels / unit), shared by the coord-ray slide and
 * the word-problem scene. Returns the validated max so callers can check jumps.
 */
function checkRay(input: unknown, at: string, errors: string[]): number | null {
  const ray = input as PresentRay;
  let max: number | null = null;

  if (
    typeof ray.max !== "number" ||
    !Number.isInteger(ray.max) ||
    ray.max < 2 ||
    ray.max > MAX_RAY_MAX
  ) {
    errors.push(`${at}.max must be a whole number from 2 to ${MAX_RAY_MAX}.`);
  } else {
    max = ray.max;
  }

  if (
    ray.labels !== undefined &&
    ray.labels !== "auto" &&
    ray.labels !== "all" &&
    ray.labels !== "none" &&
    !(
      Array.isArray(ray.labels) &&
      ray.labels.every((v) => typeof v === "number" && Number.isInteger(v))
    )
  ) {
    errors.push(
      `${at}.labels must be "auto", "all", "none" or an array of whole numbers.`,
    );
  }
  checkText(ray.unit, `${at}.unit`, errors, true);

  if (
    !Array.isArray(ray.points) ||
    ray.points.length === 0 ||
    ray.points.length > MAX_RAY_POINTS
  ) {
    errors.push(`${at}.points must be an array of 1–${MAX_RAY_POINTS} points.`);
    return max;
  }

  ray.points.forEach((point, j) => {
    const label = `${at}.points[${j}]`;
    if (typeof point !== "object" || point === null) {
      errors.push(`${label} must be an object { name?, value, icon? }.`);
      return;
    }
    if (
      typeof point.value !== "number" ||
      !Number.isInteger(point.value) ||
      point.value < 0 ||
      (max !== null && point.value > max)
    ) {
      errors.push(
        `${label}.value must be a whole number from 0 to ${at}.max${max !== null ? ` (${max})` : ""}.`,
      );
    }
    if (point.name !== undefined && typeof point.name !== "string") {
      errors.push(`${label}.name must be a short string like "A".`);
    }
    if (point.icon !== undefined && typeof point.icon !== "string") {
      errors.push(`${label}.icon must be a string (an emoji, e.g. "🐕").`);
    }
    if (point.given !== undefined && typeof point.given !== "boolean") {
      errors.push(`${label}.given must be true or false.`);
    }
    if (point.unknown !== undefined && typeof point.unknown !== "boolean") {
      errors.push(`${label}.unknown must be true or false.`);
    }
  });

  return max;
}

export function validatePresentation(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) {
    return ["registerPresentation(...) must receive an object."];
  }
  const p = input as Partial<Presentation> & { slides?: unknown };

  if (p.apiVersion !== PRESENTATION_API_VERSION) {
    errors.push(`apiVersion must be ${PRESENTATION_API_VERSION}.`);
  }
  if (typeof p.id !== "string" || !ID_RE.test(p.id)) {
    errors.push(
      'id must be a short slug of lowercase letters, digits, dots and dashes (e.g. "5.1.1-natural-sandar").',
    );
  }
  checkText(p.title, "title", errors);
  checkText(p.subtitle, "subtitle", errors, true);

  if (!Array.isArray(p.slides) || p.slides.length === 0) {
    errors.push("slides must be a non-empty array.");
    return errors;
  }
  if (p.slides.length > MAX_SLIDES) {
    errors.push(`Too many slides (max ${MAX_SLIDES}).`);
    return errors;
  }

  p.slides.forEach((slide, i) => {
    validateSlide(slide, `slides[${i}]`, errors);
  });
  return errors;
}

function validateSlide(input: unknown, at: string, errors: string[]): void {
  if (typeof input !== "object" || input === null) {
    errors.push(`${at} must be an object.`);
    return;
  }
  const slide = input as PresentSlide;

  switch (slide.type) {
    case "title": {
      checkText(slide.title, `${at}.title`, errors);
      checkText(slide.subtitle, `${at}.subtitle`, errors, true);
      return;
    }
    case "text": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      if (!Array.isArray(slide.steps) || slide.steps.length === 0) {
        errors.push(`${at}.steps must be a non-empty array.`);
        return;
      }
      if (slide.steps.length > MAX_TEXT_STEPS) {
        errors.push(`${at}.steps has too many entries (max ${MAX_TEXT_STEPS}).`);
      }
      slide.steps.forEach((step: PresentTextStep, j: number) => {
        if (typeof step !== "object" || step === null) {
          errors.push(`${at}.steps[${j}] must be an object { text, variant? }.`);
          return;
        }
        checkText(step.text, `${at}.steps[${j}].text`, errors);
        if (
          step.variant !== undefined &&
          !["normal", "rule", "fact", "example"].includes(step.variant)
        ) {
          errors.push(
            `${at}.steps[${j}].variant must be "normal", "rule", "fact" or "example".`,
          );
        }
      });
      return;
    }
    case "flashcards": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      checkText(slide.prompt, `${at}.prompt`, errors, true);
      if (!Array.isArray(slide.cards) || slide.cards.length === 0) {
        errors.push(`${at}.cards must be a non-empty array.`);
        return;
      }
      if (slide.cards.length > MAX_CARDS) {
        errors.push(`${at}.cards has too many entries (max ${MAX_CARDS}).`);
      }
      slide.cards.forEach((card, j) => {
        if (typeof card !== "object" || card === null) {
          errors.push(`${at}.cards[${j}] must be an object.`);
          return;
        }
        checkText(card.front, `${at}.cards[${j}].front`, errors);
        if (
          card.verdict !== undefined &&
          card.verdict !== "yes" &&
          card.verdict !== "no"
        ) {
          errors.push(`${at}.cards[${j}].verdict must be "yes" or "no".`);
        }
        checkText(card.answer, `${at}.cards[${j}].answer`, errors, true);
        if (card.verdict === undefined && card.answer === undefined) {
          errors.push(
            `${at}.cards[${j}] needs a verdict ("yes"/"no") or an answer text — otherwise there is nothing to reveal.`,
          );
        }
      });
      return;
    }
    case "place-value": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      checkText(slide.note, `${at}.note`, errors, true);
      checkNumber(slide.number, `${at}.number`, errors);
      return;
    }
    case "expand": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      checkNumber(slide.number, `${at}.number`, errors);
      const digits = digitsOf(slide.number);
      if (digits !== null && [...digits].every((d) => d === "0")) {
        errors.push(`${at}.number must not be zero.`);
      }
      return;
    }
    case "digit-meaning": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      checkText(slide.note, `${at}.note`, errors, true);
      if (
        typeof slide.digit !== "number" ||
        !Number.isInteger(slide.digit) ||
        slide.digit < 0 ||
        slide.digit > 9
      ) {
        errors.push(`${at}.digit must be a single digit 0–9.`);
        return;
      }
      if (
        !Array.isArray(slide.numbers) ||
        slide.numbers.length === 0 ||
        slide.numbers.length > 4
      ) {
        errors.push(`${at}.numbers must be an array of 1–4 numbers.`);
        return;
      }
      slide.numbers.forEach((n, j) => {
        checkNumber(n, `${at}.numbers[${j}]`, errors);
        const digits = digitsOf(n);
        if (digits !== null) {
          const count = [...digits].filter(
            (d) => d === String(slide.digit),
          ).length;
          if (count !== 1) {
            errors.push(
              `${at}.numbers[${j}]: the digit ${slide.digit} must appear exactly once in ${digits} (it appears ${count} times).`,
            );
          }
        }
      });
      return;
    }
    case "class-table": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      if (
        !Array.isArray(slide.numbers) ||
        slide.numbers.length === 0 ||
        slide.numbers.length > MAX_TABLE_NUMBERS
      ) {
        errors.push(
          `${at}.numbers must be an array of 1–${MAX_TABLE_NUMBERS} numbers.`,
        );
        return;
      }
      slide.numbers.forEach((n, j) =>
        checkNumber(n, `${at}.numbers[${j}]`, errors),
      );
      return;
    }
    case "oral": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      if (!Array.isArray(slide.items) || slide.items.length === 0) {
        errors.push(`${at}.items must be a non-empty array.`);
        return;
      }
      if (slide.items.length > MAX_ORAL_ITEMS) {
        errors.push(`${at}.items has too many entries (max ${MAX_ORAL_ITEMS}).`);
      }
      slide.items.forEach((item, j) => {
        if (
          typeof item !== "object" ||
          item === null ||
          typeof item.q !== "string" ||
          item.q.trim().length === 0 ||
          typeof item.a !== "string" ||
          item.a.trim().length === 0
        ) {
          errors.push(
            `${at}.items[${j}] must be { q: "25 · 4", a: "100" } with non-empty strings.`,
          );
        }
      });
      return;
    }
    case "coord-ray": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      checkText(slide.prompt, `${at}.prompt`, errors, true);
      checkText(slide.note, `${at}.note`, errors, true);
      const mode = slide.mode ?? "show";
      if (slide.mode !== undefined && !RAY_MODES.includes(slide.mode)) {
        errors.push(
          `${at}.mode must be one of ${RAY_MODES.map((m) => `"${m}"`).join(", ")}.`,
        );
      }
      const max = checkRay(slide, at, errors);

      if (mode === "mark" && Array.isArray(slide.points)) {
        const targets = slide.points.filter((p) => p && !p.given);
        if (targets.length === 0) {
          errors.push(
            `${at}: mode "mark" needs at least one point without given: true — otherwise there is nothing for the class to find.`,
          );
        }
      }

      if (mode === "jump") {
        if (
          !Array.isArray(slide.jumps) ||
          slide.jumps.length === 0 ||
          slide.jumps.length > MAX_JUMPS
        ) {
          errors.push(
            `${at}.jumps must be an array of 1–${MAX_JUMPS} whole numbers (mode "jump").`,
          );
        } else if (Array.isArray(slide.points) && slide.points[0]) {
          let position = slide.points[0].value;
          slide.jumps.forEach((jump, j) => {
            if (typeof jump !== "number" || !Number.isInteger(jump) || jump === 0) {
              errors.push(
                `${at}.jumps[${j}] must be a non-zero whole number (5 = five units right, -2 = two units left).`,
              );
              return;
            }
            position += jump;
            if (position < 0 || (max !== null && position > max)) {
              errors.push(
                `${at}.jumps[${j}] lands on ${position}, which is off the ray (0…${max}).`,
              );
            }
          });
        }
      } else if (slide.jumps !== undefined) {
        errors.push(`${at}.jumps only works with mode: "jump".`);
      }
      return;
    }
    case "word-problem": {
      checkText(slide.heading, `${at}.heading`, errors, true);
      checkText(slide.statement, `${at}.statement`, errors);
      checkText(slide.question, `${at}.question`, errors);
      checkText(slide.answer, `${at}.answer`, errors);
      if (slide.ray !== undefined) {
        if (typeof slide.ray !== "object" || slide.ray === null) {
          errors.push(`${at}.ray must be an object { max, points, unit? }.`);
        } else {
          checkRay(slide.ray, `${at}.ray`, errors);
        }
      }

      if (slide.choices !== undefined) {
        if (
          !Array.isArray(slide.choices) ||
          slide.choices.length < 2 ||
          slide.choices.length > MAX_CHOICES
        ) {
          errors.push(`${at}.choices must be an array of 2–${MAX_CHOICES} options.`);
        } else {
          slide.choices.forEach((choice, j) => {
            if (typeof choice !== "object" || choice === null) {
              errors.push(`${at}.choices[${j}] must be { text, correct? }.`);
              return;
            }
            checkText(choice.text, `${at}.choices[${j}].text`, errors);
            if (choice.correct !== undefined && typeof choice.correct !== "boolean") {
              errors.push(`${at}.choices[${j}].correct must be true or false.`);
            }
          });
          if (!slide.choices.some((choice) => choice && choice.correct === true)) {
            errors.push(
              `${at}.choices needs exactly one option marked correct: true.`,
            );
          }
        }
      }

      if (slide.steps !== undefined) {
        if (!Array.isArray(slide.steps) || slide.steps.length > MAX_SOLUTION_STEPS) {
          errors.push(
            `${at}.steps must be an array of at most ${MAX_SOLUTION_STEPS} solution lines.`,
          );
        } else {
          slide.steps.forEach((step: PresentTextStep, j: number) => {
            if (typeof step !== "object" || step === null) {
              errors.push(`${at}.steps[${j}] must be an object { text }.`);
              return;
            }
            checkText(step.text, `${at}.steps[${j}].text`, errors);
          });
        }
      }
      return;
    }
    default:
      errors.push(
        `${at}.type ${JSON.stringify((slide as { type?: unknown }).type)} is not a known slide type (title, text, flashcards, place-value, expand, digit-meaning, class-table, oral, coord-ray, word-problem).`,
      );
  }
}

/**
 * Highest internal step index of a slide (0 = no internal steps). The player
 * advances through steps before moving to the next slide.
 */
export function maxSlideStep(slide: PresentSlide): number {
  switch (slide.type) {
    case "text":
      return slide.steps.length - 1;
    case "expand":
      // 0 = number only, 1 = + sum form, 2 = + product form.
      return 2;
    case "coord-ray":
      // "build" grows the ray one point per → press; other modes are static.
      return slide.mode === "build" ? slide.points.length - 1 : 0;
    default:
      return 0;
  }
}
