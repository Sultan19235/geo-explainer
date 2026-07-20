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
    default:
      errors.push(
        `${at}.type ${JSON.stringify((slide as { type?: unknown }).type)} is not a known slide type (title, text, flashcards, place-value, expand, digit-meaning, class-table, oral).`,
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
    default:
      return 0;
  }
}
