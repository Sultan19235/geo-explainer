// Quiz pack format — the data contract of the quiz engine.
//
// A pack is one JSON file describing a whole quiz: questions, answers,
// solutions, formula sheet, GeoGebra figures. The engine (student page +
// teacher console) renders it; the admin panel validates it on upload.
// Format reference for authors: docs/QUIZ_PACK_FORMAT.md.

import {
  GRAPH_ASKS,
  GRAPH_MODES,
  graphModePrompt,
  graphPropertyPrompt,
  isGraphAsk,
  isGraphMode,
  isSectionId,
  SECTION_IDS,
  type GraphAsk,
  type GraphQuizMode,
  type QuadParams,
  type SectionId,
} from "./quadratic";

export type PackLang = "kz" | "ru";

// A text field is either a plain string (Kazakh) or {kz, ru}. Russian always
// falls back to Kazakh so a Kazakh-only pack still works with the RU toggle.
export type Localized = string | { kz: string; ru?: string };

export type PackGeoGebra = {
  commands: string[];
  view?: "3d" | "2d";
  height?: number;
};

// A graph-quadratic question. For choice modes the correct option is always
// index 0 (derived from `equation`), so no separate correct index is stored.
//   A — show the equation, pick its graph (distractors are wrong parabolas)
//   C — show the graph, pick its equation (same data as A, rendered inverted)
//   B — show the graph, pick a property; options are generated from `ask`
//   D — show the equation, drag a parabola to match it (graded by tolerance)
export type PackGraphQuadratic =
  | { mode: "A"; equation: QuadParams; distractors: QuadParams[] }
  | { mode: "C"; equation: QuadParams; distractors: QuadParams[] }
  | { mode: "B"; equation: QuadParams; ask: GraphAsk }
  | { mode: "D"; equation: QuadParams };

export type PackQuestion = {
  id: string;
  type: "mcq" | "input" | "graph-quadratic";
  text: Localized;
  image?: string;
  geogebra?: PackGeoGebra;
  tags?: string[]; // ids from tagGroups; console-only (filtering, badges)
  // mcq
  options?: Localized[];
  correct?: number; // index into options (letters are normalized on validate)
  // input
  answer?: string;
  accept?: string[];
  // graph-quadratic
  graph?: PackGraphQuadratic;
  // shown after the student answers
  solution?: Localized[];
};

// Badge tint on the console; "slate" (neutral) when omitted.
export type PackTagColor =
  | "blue"
  | "emerald"
  | "amber"
  | "red"
  | "violet"
  | "slate";

export type PackTag = {
  id: string;
  label: Localized;
  color?: PackTagColor;
};

// A dimension of tags (e.g. topic, difficulty). Filtering combines groups
// with AND and tags inside one group with OR; tag ids are global so a
// question just lists ids. Tags never reach students — console only.
export type PackTagGroup = {
  id: string;
  label?: Localized;
  tags: PackTag[];
};

// A generator quiz's settings card: which of the six quadratic sections and
// which of the four interaction modes are in play. A pack carrying this needs
// no question list — every student's device generates its own endless stream.
export type PackGenerator = {
  type: "graph-quadratic";
  sections: SectionId[];
  modes: GraphQuizMode[];
};

export type QuizPack = {
  version: 1;
  title: Localized;
  description?: Localized;
  formulas?: Localized[]; // topic help sheet behind the "Formulas" button
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  tagGroups?: PackTagGroup[];
  generator?: PackGenerator;
  questions: PackQuestion[];
};

const MAX_QUESTIONS = 200;
const MAX_OPTIONS = 6;

// Graph-quadratic questions carry the graph/equation as their own stem, so a
// text prompt is optional; when the author gives none, the mode's default
// bilingual prompt from quadratic.ts is used. (Mode B derives its prompt from
// the asked property.)

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// A quadratic in vertex form {mode:"vertex",a,m,n} or standard form
// {mode:"standard",a,b,cFull}; `a` must be non-zero (else it's not a parabola).
function isQuadParams(value: unknown): value is QuadParams {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.mode === "vertex") {
    return (
      isFiniteNumber(v.a) &&
      v.a !== 0 &&
      isFiniteNumber(v.m) &&
      isFiniteNumber(v.n)
    );
  }
  if (v.mode === "standard") {
    return (
      isFiniteNumber(v.a) &&
      v.a !== 0 &&
      isFiniteNumber(v.b) &&
      isFiniteNumber(v.cFull)
    );
  }
  return false;
}

// Drops any extra keys so a validated pack holds only the QuadParams shape.
function normalizeQuadParams(value: QuadParams): QuadParams {
  return value.mode === "vertex"
    ? { mode: "vertex", a: value.a, m: value.m, n: value.n }
    : { mode: "standard", a: value.a, b: value.b, cFull: value.cFull };
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

  // Tag groups: validated first so question tags can be checked against them.
  const TAG_COLORS: PackTagColor[] = [
    "blue",
    "emerald",
    "amber",
    "red",
    "violet",
    "slate",
  ];
  const tagGroups: PackTagGroup[] = [];
  const knownTagIds = new Set<string>();
  if (data.tagGroups !== undefined) {
    if (!Array.isArray(data.tagGroups)) {
      errors.push('"tagGroups" must be a list of groups.');
    } else {
      data.tagGroups.forEach((rawG, gi) => {
        const gLabel = `tagGroups[${gi}]`;
        if (typeof rawG !== "object" || rawG === null) {
          errors.push(`${gLabel}: must be an object.`);
          return;
        }
        const g = rawG as Record<string, unknown>;
        if (typeof g.id !== "string" || g.id.trim().length === 0) {
          errors.push(`${gLabel}: missing "id" string.`);
          return;
        }
        if (g.label !== undefined && !isLocalized(g.label)) {
          errors.push(`${gLabel}: "label" must be a string or {"kz","ru"}.`);
          return;
        }
        if (!Array.isArray(g.tags) || g.tags.length === 0) {
          errors.push(`${gLabel}: "tags" must be a non-empty list.`);
          return;
        }
        const tags: PackTag[] = [];
        for (const rawT of g.tags) {
          if (typeof rawT !== "object" || rawT === null) {
            errors.push(`${gLabel}: each tag must be an object.`);
            return;
          }
          const tg = rawT as Record<string, unknown>;
          if (typeof tg.id !== "string" || tg.id.trim().length === 0) {
            errors.push(`${gLabel}: each tag needs an "id" string.`);
            return;
          }
          if (knownTagIds.has(tg.id)) {
            errors.push(`${gLabel}: duplicate tag id "${tg.id}" (ids are global).`);
            return;
          }
          if (!isLocalized(tg.label)) {
            errors.push(`${gLabel}: tag "${tg.id}" needs a "label".`);
            return;
          }
          if (
            tg.color !== undefined &&
            !TAG_COLORS.includes(tg.color as PackTagColor)
          ) {
            errors.push(
              `${gLabel}: tag "${tg.id}" color must be one of ${TAG_COLORS.join(", ")}.`,
            );
            return;
          }
          knownTagIds.add(tg.id);
          tags.push({
            id: tg.id,
            label: tg.label as Localized,
            color: tg.color as PackTagColor | undefined,
          });
        }
        tagGroups.push({
          id: g.id,
          label: g.label as Localized | undefined,
          tags,
        });
      });
    }
  }

  // Generator settings card: which sections and interaction modes are in
  // play. Omitted lists default to everything; provided lists must contain at
  // least one known value. A pack with a generator needs no question list.
  let generator: PackGenerator | undefined;
  if (data.generator !== undefined) {
    const g = data.generator as Record<string, unknown> | null;
    if (typeof g !== "object" || g === null || Array.isArray(g)) {
      errors.push('"generator" must be an object.');
    } else if (g.type !== "graph-quadratic") {
      errors.push(
        `Unknown generator type "${String(g.type)}" — only "graph-quadratic" exists.`,
      );
    } else {
      let sections: SectionId[] = [...SECTION_IDS];
      if (g.sections !== undefined) {
        sections = Array.isArray(g.sections)
          ? g.sections.filter(isSectionId)
          : [];
        if (sections.length === 0) {
          errors.push(
            `"generator.sections" must list at least one of ${SECTION_IDS.join(", ")}.`,
          );
        }
      }
      let modes: GraphQuizMode[] = [...GRAPH_MODES];
      if (g.modes !== undefined) {
        modes = Array.isArray(g.modes) ? g.modes.filter(isGraphMode) : [];
        if (modes.length === 0) {
          errors.push(
            `"generator.modes" must list at least one of ${GRAPH_MODES.join(", ")}.`,
          );
        }
      }
      if (sections.length > 0 && modes.length > 0) {
        generator = { type: "graph-quadratic", sections, modes };
      }
    }
  }

  const rawQuestions = data.questions ?? [];
  if (!Array.isArray(rawQuestions)) {
    errors.push('"questions" must be a list.');
    return { pack: null, errors };
  }
  if (rawQuestions.length === 0 && generator === undefined) {
    errors.push('"questions" must be a non-empty list (or add a "generator").');
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

    const isGraph = q.type === "graph-quadratic" || q.graph !== undefined;

    // Graph questions show the equation as their stem, so "text" is optional.
    if (!isGraph && !isLocalized(q.text)) {
      errors.push(`${label}: missing "text".`);
      return;
    }

    const hasOptions = q.options !== undefined;
    const type: PackQuestion["type"] = isGraph
      ? "graph-quadratic"
      : q.type === "mcq" || q.type === "input"
        ? q.type
        : hasOptions
          ? "mcq"
          : "input";

    const question: PackQuestion = {
      id: typeof q.id === "string" || typeof q.id === "number"
        ? String(q.id)
        : `q${i + 1}`,
      type,
      // Placeholder for graph questions without text; the graph branch below
      // replaces it with the right per-mode default prompt.
      text: isLocalized(q.text) ? (q.text as Localized) : graphModePrompt("A"),
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

    if (type === "graph-quadratic") {
      const g = q.graph;
      if (typeof g !== "object" || g === null || Array.isArray(g)) {
        errors.push(`${label}: "graph" must be an object.`);
        return;
      }
      const gg = g as Record<string, unknown>;
      const gmode = gg.mode ?? "A";
      if (gmode !== "A" && gmode !== "B" && gmode !== "C" && gmode !== "D") {
        errors.push(
          `${label}: graph "mode" must be "A" (pick the graph), "B" (pick a property), "C" (pick the formula), or "D" (drag to build).`,
        );
        return;
      }
      if (!isQuadParams(gg.equation)) {
        errors.push(
          `${label}: "graph.equation" must be a quadratic — {"mode":"vertex","a","m","n"} or {"mode":"standard","a","b","cFull"} with a ≠ 0.`,
        );
        return;
      }
      const equation = normalizeQuadParams(gg.equation);

      if (gmode === "D") {
        question.graph = { mode: "D", equation };
        if (!isLocalized(q.text)) question.text = graphModePrompt("D");
      } else if (gmode === "B") {
        if (!isGraphAsk(gg.ask)) {
          errors.push(
            `${label}: "graph.ask" must be one of ${GRAPH_ASKS.join(", ")}.`,
          );
          return;
        }
        question.graph = { mode: "B", equation, ask: gg.ask };
        if (!isLocalized(q.text)) {
          question.text = {
            kz: graphPropertyPrompt(gg.ask, "kz"),
            ru: graphPropertyPrompt(gg.ask, "ru"),
          };
        }
      } else {
        // A and C both need distractor parabolas.
        if (!Array.isArray(gg.distractors) || gg.distractors.length < 1) {
          errors.push(
            `${label}: "graph.distractors" must list at least 1 wrong parabola.`,
          );
          return;
        }
        if (gg.distractors.length > MAX_OPTIONS - 1) {
          errors.push(
            `${label}: at most ${MAX_OPTIONS - 1} distractors (${MAX_OPTIONS} choices total).`,
          );
          return;
        }
        if (!gg.distractors.every(isQuadParams)) {
          errors.push(
            `${label}: every "graph.distractors" entry must be a valid quadratic with a ≠ 0.`,
          );
          return;
        }
        question.graph = {
          mode: gmode,
          equation,
          distractors: (gg.distractors as QuadParams[]).map(normalizeQuadParams),
        };
        if (!isLocalized(q.text)) {
          question.text = graphModePrompt(gmode);
        }
      }
    } else if (type === "mcq") {
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

    if (q.tags !== undefined) {
      if (!Array.isArray(q.tags) || !q.tags.every((t) => typeof t === "string")) {
        errors.push(`${label}: "tags" must be a list of tag id strings.`);
      } else {
        const unknown = (q.tags as string[]).filter((t) => !knownTagIds.has(t));
        if (unknown.length > 0) {
          errors.push(
            `${label}: unknown tag id(s) ${unknown.map((t) => `"${t}"`).join(", ")} — declare them in "tagGroups".`,
          );
        } else {
          question.tags = Array.from(new Set(q.tags as string[]));
        }
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
      tagGroups: tagGroups.length > 0 ? tagGroups : undefined,
      generator,
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
