// Quiz pack format — the data contract of the quiz engine.
//
// A pack is one JSON file describing a whole quiz: questions, answers,
// solutions, formula sheet, GeoGebra figures. The engine (student page +
// teacher console) renders it; the admin panel validates it on upload.
// Format reference for authors: docs/QUIZ_PACK_FORMAT.md.

export type PackLang = "kz" | "ru";

// A text field is either a plain string (Kazakh) or {kz, ru}. Russian always
// falls back to Kazakh so a Kazakh-only pack still works with the RU toggle.
export type Localized = string | { kz: string; ru?: string };

export type PackGeoGebra = {
  commands: string[];
  view?: "3d" | "2d";
  height?: number;
};

export type PackQuestion = {
  id: string;
  type: "mcq" | "input";
  text: Localized;
  image?: string;
  geogebra?: PackGeoGebra;
  // mcq
  options?: Localized[];
  correct?: number; // index into options (letters are normalized on validate)
  // input
  answer?: string;
  accept?: string[];
  // shown after the student answers
  solution?: Localized[];
};

export type QuizPack = {
  version: 1;
  title: Localized;
  description?: Localized;
  formulas?: Localized[]; // topic help sheet behind the "Formulas" button
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  questions: PackQuestion[];
};

const MAX_QUESTIONS = 200;
const MAX_OPTIONS = 6;

export function loc(value: Localized | undefined, lang: PackLang): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return (lang === "ru" ? value.ru : undefined) ?? value.kz ?? "";
}

function isLocalized(value: unknown): value is Localized {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value !== "object" || value === null) return false;
  const v = value as { kz?: unknown; ru?: unknown };
  return (
    typeof v.kz === "string" &&
    v.kz.trim().length > 0 &&
    (v.ru === undefined || typeof v.ru === "string")
  );
}

function isLocalizedList(value: unknown): value is Localized[] {
  return Array.isArray(value) && value.every(isLocalized);
}

// Accepts 0-based index, "0".."9", or a letter "A".."F" (legacy apps use
// letters); returns the option index or null.
function normalizeCorrect(value: unknown, optionCount: number): number | null {
  let index: number | null = null;
  if (typeof value === "number" && Number.isInteger(value)) {
    index = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim().toUpperCase();
    if (/^[0-9]+$/.test(trimmed)) index = Number(trimmed);
    else if (/^[A-F]$/.test(trimmed)) index = trimmed.charCodeAt(0) - 65;
  }
  if (index === null || index < 0 || index >= optionCount) return null;
  return index;
}

// Validates raw JSON and returns a normalized pack, or a list of readable
// errors. Error text is English on purpose: the author pastes it into an AI
// chat to get the pack fixed.
export function validatePack(raw: unknown): {
  pack: QuizPack | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { pack: null, errors: ["Pack must be a JSON object."] };
  }
  const data = raw as Record<string, unknown>;

  if (data.version !== undefined && data.version !== 1) {
    errors.push(`Unsupported pack version "${String(data.version)}" — use 1.`);
  }
  if (data.mode !== undefined && data.mode !== "standard") {
    errors.push(
      `Mode "${String(data.mode)}" is not supported yet — omit it or use "standard".`,
    );
  }
  if (!isLocalized(data.title)) {
    errors.push('Missing "title" (a string or {"kz": "...", "ru": "..."}).');
  }
  if (data.description !== undefined && !isLocalized(data.description)) {
    errors.push('"description" must be a string or {"kz", "ru"} object.');
  }
  if (data.formulas !== undefined && !isLocalizedList(data.formulas)) {
    errors.push('"formulas" must be a list of strings (or {"kz","ru"} objects).');
  }

  const rawQuestions = data.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    errors.push('"questions" must be a non-empty list.');
    return { pack: null, errors };
  }
  if (rawQuestions.length > MAX_QUESTIONS) {
    errors.push(`Too many questions (${rawQuestions.length}); max is ${MAX_QUESTIONS}.`);
  }

  const questions: PackQuestion[] = [];
  rawQuestions.forEach((rawQ, i) => {
    const label = `question ${i + 1}`;
    if (typeof rawQ !== "object" || rawQ === null) {
      errors.push(`${label}: must be an object.`);
      return;
    }
    const q = rawQ as Record<string, unknown>;

    if (!isLocalized(q.text)) {
      errors.push(`${label}: missing "text".`);
      return;
    }

    const hasOptions = q.options !== undefined;
    const type: PackQuestion["type"] =
      q.type === "mcq" || q.type === "input"
        ? q.type
        : hasOptions
          ? "mcq"
          : "input";

    const question: PackQuestion = {
      id: typeof q.id === "string" || typeof q.id === "number"
        ? String(q.id)
        : `q${i + 1}`,
      type,
      text: q.text as Localized,
    };

    if (q.image !== undefined) {
      if (typeof q.image !== "string") {
        errors.push(`${label}: "image" must be a URL string.`);
      } else {
        question.image = q.image;
      }
    }

    if (q.geogebra !== undefined) {
      const g = q.geogebra as Record<string, unknown> | null;
      if (
        typeof g !== "object" ||
        g === null ||
        !Array.isArray(g.commands) ||
        !g.commands.every((c) => typeof c === "string")
      ) {
        errors.push(`${label}: "geogebra" needs a "commands" list of strings.`);
      } else {
        question.geogebra = {
          commands: g.commands as string[],
          view: g.view === "3d" || g.view === "2d" ? g.view : undefined,
          height:
            typeof g.height === "number" && g.height >= 200 && g.height <= 800
              ? g.height
              : undefined,
        };
      }
    }

    if (type === "mcq") {
      if (!isLocalizedList(q.options) || (q.options as unknown[]).length < 2) {
        errors.push(`${label}: "options" must list at least 2 choices.`);
        return;
      }
      const options = q.options as Localized[];
      if (options.length > MAX_OPTIONS) {
        errors.push(`${label}: at most ${MAX_OPTIONS} options.`);
        return;
      }
      const correct = normalizeCorrect(q.correct ?? q.answer, options.length);
      if (correct === null) {
        errors.push(
          `${label}: "correct" must point at one option (index 0-${options.length - 1} or letter A-${String.fromCharCode(64 + options.length)}).`,
        );
        return;
      }
      question.options = options;
      question.correct = correct;
    } else {
      if (typeof q.answer !== "string" && typeof q.answer !== "number") {
        errors.push(`${label}: typed-answer questions need an "answer" string.`);
        return;
      }
      question.answer = String(q.answer);
      if (q.accept !== undefined) {
        if (
          !Array.isArray(q.accept) ||
          !q.accept.every((a) => typeof a === "string" || typeof a === "number")
        ) {
          errors.push(`${label}: "accept" must be a list of strings.`);
          return;
        }
        question.accept = (q.accept as Array<string | number>).map(String);
      }
    }

    if (q.solution !== undefined) {
      if (!isLocalizedList(q.solution)) {
        errors.push(`${label}: "solution" must be a list of step strings.`);
      } else {
        question.solution = q.solution as Localized[];
      }
    }

    questions.push(question);
  });

  if (errors.length > 0) return { pack: null, errors };

  return {
    pack: {
      version: 1,
      title: data.title as Localized,
      description: data.description as Localized | undefined,
      formulas: data.formulas as Localized[] | undefined,
      shuffleQuestions: data.shuffleQuestions === true,
      shuffleOptions: data.shuffleOptions === true,
      questions,
    },
    errors: [],
  };
}

// ─── Answer checking (typed answers) ────────────────────────────────────────

// "2,5" and "2.5" are the same number to a student; so are "x+1" and "x + 1".
function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/−/g, "-") // unicode minus
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
}

export function checkInputAnswer(given: string, question: PackQuestion): boolean {
  const normalizedGiven = normalizeAnswer(given);
  if (!normalizedGiven) return false;
  const accepted = [question.answer ?? "", ...(question.accept ?? [])];
  for (const candidate of accepted) {
    const normalizedCandidate = normalizeAnswer(candidate);
    if (!normalizedCandidate) continue;
    if (normalizedGiven === normalizedCandidate) return true;
    const a = Number(normalizedGiven);
    const b = Number(normalizedCandidate);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9) {
      return true;
    }
  }
  return false;
}

// ─── Deterministic shuffle ──────────────────────────────────────────────────
// Seeded so a student's question/option order survives a page reload (the
// seed is persisted with their session state).

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededOrder(count: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
