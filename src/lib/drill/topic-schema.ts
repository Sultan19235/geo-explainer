// Uploaded drill-topic files: evaluation + the validation harness.
//
// A generator file is CODE, not data — the only way to validate it is to run
// it. This module (a) evaluates an uploaded .js file into a topic object
// inside a stripped scope, and (b) runs the "test kitchen": hundreds of
// generated problems across option combinations, each checked against the
// same invariants the in-repo sanity battery enforces. Errors are readable
// English on purpose — the author pastes them into an AI chat to get the
// file fixed, exactly like pack-upload errors.
//
// Pure module: runs identically in the sandbox Web Worker (player/previewer),
// the admin page, and Node (sanity script). No DOM, no React.
//
// Format reference for authors: docs/DRILL_GENERATOR_FORMAT.md.

import {
  exact,
  katexDecimal,
  parseExact,
  toKatex,
  toPlain,
  equalsExact,
} from "./exact";
import { mulberry32, pick, randInt, shuffle, type Rng } from "./rng";
import { getDrillTopic } from "./registry";
import {
  isDrillKey,
  keysForAnswer,
  type DrillConfig,
  type DrillOptionGroup,
  type DrillProblem,
  type DrillText,
  type DrillVisual,
} from "./types";

export const DRILL_TOPIC_API_VERSION = 1;

const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_CODE_BYTES = 200_000;
const MAX_OPTION_GROUPS = 4;
const MAX_CHOICES = 8;

export type UploadedTopicMeta = {
  apiVersion: number;
  id: string;
  title: DrillText;
  subtitle: DrillText;
  options: DrillOptionGroup[];
};

export type EvaluatedTopic = {
  meta: UploadedTopicMeta;
  generate: (rng: Rng, config: DrillConfig) => DrillProblem;
};

// ─── Evaluation ─────────────────────────────────────────────────────────────
// The file calls registerDrillTopic({...}) exactly once. Helper functions are
// injected as scope parameters; a handful of reach-out globals are shadowed
// with undefined. This is insurance and a design constraint (generators stay
// pure), not a true security boundary — only the admin can upload files.

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

export function evaluateDrillTopicCode(
  code: string,
): { topic: EvaluatedTopic } | { errors: string[] } {
  if (typeof code !== "string" || code.trim().length === 0) {
    return { errors: ["The file is empty."] };
  }
  if (code.length > MAX_CODE_BYTES) {
    return { errors: [`The file is too large (max ${MAX_CODE_BYTES / 1000} KB).`] };
  }

  let registered: unknown = null;
  let calls = 0;
  const registerDrillTopic = (topic: unknown) => {
    calls++;
    registered = topic;
  };
  const helpers = {
    exact,
    parseExact,
    toKatex,
    toPlain,
    katexDecimal,
    keysForAnswer,
    randInt,
    pick,
    shuffle,
  };

  try {
    const factory = new Function(
      "registerDrillTopic",
      "helpers",
      ...Object.keys(helpers),
      ...SHADOWED_GLOBALS,
      `"use strict";\n${code}`,
    );
    factory(registerDrillTopic, helpers, ...Object.values(helpers));
  } catch (e) {
    return {
      errors: [`The file crashed while loading: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (calls === 0) {
    return { errors: ["The file never called registerDrillTopic({...})."] };
  }
  if (calls > 1) {
    return { errors: ["registerDrillTopic must be called exactly once — one file, one topic."] };
  }

  const metaErrors = validateTopicShape(registered);
  if (metaErrors.length > 0) return { errors: metaErrors };
  const t = registered as UploadedTopicMeta & {
    generate: (rng: Rng, config: DrillConfig) => DrillProblem;
  };
  return {
    topic: {
      meta: {
        apiVersion: t.apiVersion,
        id: t.id,
        title: t.title,
        subtitle: t.subtitle,
        options: t.options,
      },
      generate: t.generate.bind(t),
    },
  };
}

// ─── Shape validation (no execution) ────────────────────────────────────────

function isText(v: unknown): v is DrillText {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as DrillText).kz === "string" &&
    (v as DrillText).kz.trim().length > 0 &&
    typeof (v as DrillText).ru === "string" &&
    (v as DrillText).ru.trim().length > 0
  );
}

/** Validate an option-group list. Exported: pack.ts reuses it for the
 * `fileOptions` snapshot a file-generator pack carries for the console. */
export function validateOptionGroups(raw: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return ['"options" must be a list of option groups.'];
  if (raw.length > MAX_OPTION_GROUPS) {
    errors.push(`At most ${MAX_OPTION_GROUPS} option groups.`);
  }
  const seen = new Set<string>();
  raw.forEach((g, i) => {
    const label = `options[${i}]`;
    const group = g as DrillOptionGroup;
    if (typeof group !== "object" || group === null) {
      errors.push(`${label}: must be an object.`);
      return;
    }
    if (typeof group.id !== "string" || !ID_RE.test(group.id)) {
      errors.push(`${label}: "id" must be lowercase letters/digits/dashes (2–40 chars).`);
      return;
    }
    if (seen.has(group.id)) errors.push(`${label}: duplicate group id "${group.id}".`);
    seen.add(group.id);
    if (!isText(group.label)) {
      errors.push(`${label}: "label" needs {"kz": "...", "ru": "..."}.`);
    }
    if (!Array.isArray(group.choices) || group.choices.length === 0) {
      errors.push(`${label}: "choices" must be a non-empty list.`);
      return;
    }
    if (group.choices.length > MAX_CHOICES) {
      errors.push(`${label}: at most ${MAX_CHOICES} choices.`);
    }
    const choiceIds = new Set<string>();
    for (const c of group.choices) {
      if (typeof c !== "object" || c === null || typeof c.id !== "string" || !isText(c.label)) {
        errors.push(`${label}: every choice needs an "id" and a bilingual "label".`);
        return;
      }
      if (choiceIds.has(c.id)) errors.push(`${label}: duplicate choice id "${c.id}".`);
      choiceIds.add(c.id);
    }
    if (
      !Array.isArray(group.defaults) ||
      group.defaults.length === 0 ||
      !group.defaults.every((d) => choiceIds.has(d))
    ) {
      errors.push(`${label}: "defaults" must be a non-empty subset of the choice ids.`);
    }
  });
  return errors;
}

function validateTopicShape(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) {
    return ["registerDrillTopic must receive an object."];
  }
  const t = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (t.apiVersion !== DRILL_TOPIC_API_VERSION) {
    errors.push(`"apiVersion" must be ${DRILL_TOPIC_API_VERSION}.`);
  }
  if (typeof t.id !== "string" || !ID_RE.test(t.id)) {
    errors.push('"id" must be lowercase letters/digits/dashes, 2–40 chars (e.g. "integer-add").');
  } else if (getDrillTopic(t.id)) {
    errors.push(`"id" ${JSON.stringify(t.id)} is taken by a built-in topic — pick another.`);
  }
  if (!isText(t.title)) errors.push('"title" needs {"kz": "...", "ru": "..."}.');
  if (!isText(t.subtitle)) errors.push('"subtitle" needs {"kz": "...", "ru": "..."}.');
  errors.push(...validateOptionGroups(t.options ?? []));
  if (typeof t.generate !== "function") {
    errors.push('"generate" must be a function (rng, config) → problem.');
  }
  return errors;
}

// ─── Problem validation ─────────────────────────────────────────────────────

export function validateProblem(p: unknown, label: string): string[] {
  const errors: string[] = [];
  if (typeof p !== "object" || p === null) return [`${label}: generate() must return an object.`];
  const q = p as DrillProblem;
  if (!isText(q.prompt)) errors.push(`${label}: "prompt" needs {"kz", "ru"} strings.`);
  try {
    const a = exact(q.answer?.num, q.answer?.den, q.answer?.unit, q.answer?.rad);
    const style = q.answerStyle === "decimal" ? "decimal" : "fraction";
    const typed = toPlain(a, style);
    const parsed = parseExact(typed);
    if (!parsed || !equalsExact(parsed, a)) {
      errors.push(`${label}: answer "${typed}" doesn't round-trip through the student keypad.`);
    }
  } catch {
    errors.push(
      `${label}: "answer" must be built with exact(num, den, unit?, rad?) — got ${JSON.stringify(q.answer)}.`,
    );
  }
  if (q.answerStyle !== "fraction" && q.answerStyle !== "decimal") {
    errors.push(`${label}: "answerStyle" must be "fraction" or "decimal".`);
  }
  if (!Array.isArray(q.keys) || !q.keys.every(isDrillKey)) {
    errors.push(`${label}: "keys" must be a list from comma, minus, pi, frac, sqrt.`);
  }
  if (q.solution !== undefined && !isText(q.solution)) {
    errors.push(`${label}: "solution" (optional) needs {"kz", "ru"} strings.`);
  }
  if (typeof q.variant !== "string" || q.variant.length === 0) {
    errors.push(`${label}: "variant" must be a short id string.`);
  }
  if (q.visual !== undefined) errors.push(...validateVisual(q.visual, label));
  return errors;
}

const FIGURE_COLORS = ["blue", "red", "green", "orange", "slate"];
const MAX_FIGURE_SHAPES = 80;
const MAX_LABEL_CHARS = 24;

function isPt(p: unknown): p is [number, number] {
  return (
    Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
  );
}

function validateShape(s: unknown, label: string): string | null {
  if (typeof s !== "object" || s === null) return `${label}: each shape must be an object.`;
  const shape = s as Record<string, unknown>;
  if ("color" in shape && shape.color !== undefined && !FIGURE_COLORS.includes(shape.color as string)) {
    return `${label}: shape color must be one of ${FIGURE_COLORS.join(", ")}.`;
  }
  switch (shape.kind) {
    case "segment":
    case "arrow":
      return isPt(shape.from) && isPt(shape.to)
        ? null
        : `${label}: "${shape.kind}" needs "from" and "to" as [x, y] pairs.`;
    case "circle":
      return isPt(shape.center) && Number.isFinite(shape.radius) && (shape.radius as number) > 0
        ? null
        : `${label}: "circle" needs "center" [x, y] and a positive "radius".`;
    case "arc":
      return isPt(shape.center) &&
        Number.isFinite(shape.radius) &&
        (shape.radius as number) > 0 &&
        Number.isFinite(shape.startDeg) &&
        Number.isFinite(shape.endDeg)
        ? null
        : `${label}: "arc" needs "center", "radius", "startDeg", "endDeg".`;
    case "point":
    case "label": {
      if (!isPt(shape.at)) return `${label}: "${shape.kind}" needs "at" as [x, y].`;
      const text = shape.kind === "label" ? shape.text : shape.label;
      if (shape.kind === "label" && (typeof text !== "string" || text.length === 0)) {
        return `${label}: "label" needs a "text" string.`;
      }
      if (text !== undefined && (typeof text !== "string" || text.length > MAX_LABEL_CHARS)) {
        return `${label}: label text must be a string of at most ${MAX_LABEL_CHARS} chars.`;
      }
      return null;
    }
    case "polygon":
      return Array.isArray(shape.points) && shape.points.length >= 3 && shape.points.every(isPt)
        ? null
        : `${label}: "polygon" needs at least 3 [x, y] points.`;
    default:
      return `${label}: unknown shape kind "${String(shape.kind)}" — use segment, arrow, circle, arc, point, label or polygon.`;
  }
}

export function validateVisual(v: unknown, label: string): string[] {
  const errors: string[] = [];
  if (typeof v !== "object" || v === null) return [`${label}: "visual" must be an object.`];
  const vis = v as DrillVisual;

  if (vis.type === "number-line") {
    const span = Number(vis.max) - Number(vis.min);
    if (!Number.isFinite(vis.min) || !Number.isFinite(vis.max) || span <= 0 || span > 200) {
      errors.push(`${label}: number-line needs finite min < max with a span of at most 200.`);
      return errors;
    }
    const inRange = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n >= vis.min && n <= vis.max;
    if (vis.points !== undefined && (!Array.isArray(vis.points) || !vis.points.every(inRange))) {
      errors.push(`${label}: number-line "points" must be numbers inside [min, max].`);
    }
    if (
      vis.arrows !== undefined &&
      (!Array.isArray(vis.arrows) ||
        !vis.arrows.every((a) => a && inRange(a.from) && inRange(a.to) && a.from !== a.to))
    ) {
      errors.push(`${label}: number-line "arrows" must be {from, to} pairs inside [min, max].`);
    }
    return errors;
  }

  if (vis.type === "figure") {
    const view = vis.view as { xMin: number; xMax: number; yMin: number; yMax: number } | undefined;
    if (
      !view ||
      !Number.isFinite(view.xMin) ||
      !Number.isFinite(view.xMax) ||
      !Number.isFinite(view.yMin) ||
      !Number.isFinite(view.yMax) ||
      view.xMax <= view.xMin ||
      view.yMax <= view.yMin
    ) {
      return [`${label}: figure "view" needs finite xMin < xMax and yMin < yMax.`];
    }
    const shapes = Array.isArray(vis.shapes) ? vis.shapes : null;
    if (!shapes) return [`${label}: figure "shapes" must be a list.`];
    const reveal = vis.reveal === undefined ? [] : Array.isArray(vis.reveal) ? vis.reveal : null;
    if (reveal === null) return [`${label}: figure "reveal" must be a list of shapes.`];
    if (shapes.length + reveal.length > MAX_FIGURE_SHAPES) {
      return [`${label}: at most ${MAX_FIGURE_SHAPES} shapes per figure.`];
    }
    [...shapes, ...reveal].forEach((s, i) => {
      const err = validateShape(s, `${label}: shape ${i + 1}`);
      if (err && errors.length < 6) errors.push(err);
    });
    return errors;
  }

  return [`${label}: visual "type" must be "number-line" or "figure".`];
}

// ─── The harness ────────────────────────────────────────────────────────────
// Configs tested: the defaults, plus each single choice alone (others at
// defaults) — every choice gets exercised without a combinatorial explosion.

const PROBLEMS_PER_CONFIG = 40;
const MAX_REPORTED_ERRORS = 12;

function harnessConfigs(options: DrillOptionGroup[]): DrillConfig[] {
  const defaults: DrillConfig = {};
  for (const g of options) defaults[g.id] = [...g.defaults];
  const configs: DrillConfig[] = [defaults];
  for (const g of options) {
    for (const c of g.choices) {
      configs.push({ ...defaults, [g.id]: [c.id] });
    }
  }
  return configs;
}

export function validateDrillTopic(topic: EvaluatedTopic): string[] {
  const errors: string[] = [];
  const push = (e: string) => {
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(e);
  };

  for (const config of harnessConfigs(topic.meta.options)) {
    const cfgLabel = JSON.stringify(config);
    for (let i = 0; i < PROBLEMS_PER_CONFIG && errors.length < MAX_REPORTED_ERRORS; i++) {
      const seed = (i * 2654435761 + 12345) >>> 0;
      let problem: DrillProblem;
      try {
        problem = topic.generate(mulberry32(seed), config);
      } catch (e) {
        push(
          `generate() crashed with config ${cfgLabel}: ${e instanceof Error ? e.message : String(e)}`,
        );
        break;
      }
      for (const err of validateProblem(problem, `config ${cfgLabel}, problem ${i + 1}`)) {
        push(err);
      }
    }
    if (errors.length >= MAX_REPORTED_ERRORS) break;
  }

  // Determinism: same seed must mean the same problem (no Math.random, no
  // Date) — retries, race lockstep and resume all depend on it.
  if (errors.length === 0) {
    const defaults = harnessConfigs(topic.meta.options)[0];
    const a = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => topic.generate(mulberry32(i + 7), defaults)),
    );
    const b = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => topic.generate(mulberry32(i + 7), defaults)),
    );
    if (a !== b) {
      push(
        "generate() is not deterministic: the same seed produced different problems. Use only the rng argument for randomness — never Math.random() or Date.",
      );
    }
  }

  return errors;
}

/** One-call flow: evaluate, then run the harness. */
export function loadAndValidateDrillTopicCode(
  code: string,
): { topic: EvaluatedTopic; errors: [] } | { topic: null; errors: string[] } {
  const evaluated = evaluateDrillTopicCode(code);
  if ("errors" in evaluated) return { topic: null, errors: evaluated.errors };
  const errors = validateDrillTopic(evaluated.topic);
  if (errors.length > 0) return { topic: null, errors };
  return { topic: evaluated.topic, errors: [] };
}
