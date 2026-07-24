// Drill topic contract — the "recipe card" interface.
//
// A topic is one small pure module: metadata + teacher-facing option groups +
// a generate() function that invents one problem from a seeded RNG. The shared
// engine (keypad, checking, feedback, retry queue) never changes when a topic
// is added; new topics only get registered in registry.ts.

import type { Exact, ExactStyle } from "./exact";
import type { Rng } from "./rng";

export type DrillText = { kz: string; ru: string };

/** Extra keypad keys beyond the always-present digits and backspace.
 * (π and √ share one physical keypad slot — no answer ever needs both.) */
export type DrillKey = "comma" | "minus" | "pi" | "frac" | "sqrt";

export const DRILL_KEYS: DrillKey[] = ["comma", "minus", "pi", "frac", "sqrt"];

export function isDrillKey(value: unknown): value is DrillKey {
  return DRILL_KEYS.includes(value as DrillKey);
}

/**
 * Which extra keys an answer string needs to be typed on the keypad —
 * "2π/3" → pi + frac, "43,5" → comma, "-8" → minus. Pack authors write the
 * answer exactly as a student would type it, so the keypad configures itself.
 */
export function keysForAnswer(answer: string): DrillKey[] {
  const keys: DrillKey[] = [];
  if (answer.includes(",")) keys.push("comma");
  if (answer.includes("-") || answer.includes("−")) keys.push("minus");
  if (answer.includes("π")) keys.push("pi");
  if (answer.includes("/")) keys.push("frac");
  if (answer.includes("√")) keys.push("sqrt");
  return keys;
}

// ─── Visual bricks ──────────────────────────────────────────────────────────
// A problem can request a visual, declaratively: the engine owns every pixel
// (colors, stroke widths, phone-tested sizes); the generator only describes
// WHAT to show. Two bricks:
//   number-line — the polished special-case for integer/decimal hops;
//   figure      — a generic picture described as a list of safe shape parts
//                 (math coordinates; the description is data, so the upload
//                 harness can check it, and files never touch the screen).

/** Brand-palette color names — the engine maps them to real colors. */
export type FigureColor = "blue" | "red" | "green" | "orange" | "slate";

export type FigureShape =
  | { kind: "segment"; from: [number, number]; to: [number, number]; color?: FigureColor; dash?: boolean }
  | { kind: "arrow"; from: [number, number]; to: [number, number]; color?: FigureColor }
  | { kind: "circle"; center: [number, number]; radius: number; color?: FigureColor; fill?: boolean }
  | { kind: "arc"; center: [number, number]; radius: number; startDeg: number; endDeg: number; color?: FigureColor; arrow?: boolean }
  | { kind: "point"; at: [number, number]; color?: FigureColor; label?: string }
  | { kind: "label"; at: [number, number]; text: string; color?: FigureColor }
  | { kind: "polygon"; points: Array<[number, number]>; color?: FigureColor; fill?: boolean };

export type DrillVisual =
  | {
      type: "number-line";
      min: number;
      max: number;
      /** Dots marked on the line from the start (e.g. the starting number). */
      points?: number[];
      /** Hop arrows revealed together with the answer — the "why" picture. */
      arrows?: Array<{ from: number; to: number }>;
    }
  | {
      type: "figure";
      /** Math-coordinate window the shapes live in (y grows upward). */
      view: { xMin: number; xMax: number; yMin: number; yMax: number };
      /** Draw a light grid and x/y axes behind the shapes. */
      grid?: boolean;
      axes?: boolean;
      /** Shapes visible from the start. */
      shapes: FigureShape[];
      /** Shapes revealed together with the answer — the "why" picture. */
      reveal?: FigureShape[];
    };

export type DrillProblem = {
  /** MathText format — plain text with $...$ KaTeX segments. */
  prompt: DrillText;
  answer: Exact;
  /** How the correct answer is rendered in feedback ("fraction" for 2π/3, "decimal" for 43,5). */
  answerStyle: ExactStyle;
  keys: DrillKey[];
  /** One-line "why" shown after a wrong answer, MathText format. */
  solution?: DrillText;
  /** Template id inside the topic (e.g. "deg2rad") — retry bookkeeping/analytics. */
  variant: string;
  /** Optional visual brick under the prompt (number line, …). */
  visual?: DrillVisual;
};

export type DrillChoice = { id: string; label: DrillText };

/** A tick-tile group on the setup screen; at least one choice stays selected. */
export type DrillOptionGroup = {
  id: string;
  label: DrillText;
  choices: DrillChoice[];
  defaults: string[];
};

/** Selected choice ids per option group id. */
export type DrillConfig = Record<string, string[]>;

/** One rung of a difficulty ladder: a named preset of option selections.
 * `config` may cover only some groups — the rest run on defaults. */
export type DrillLevel = {
  label: DrillText;
  config: DrillConfig;
};

export type DrillTopic = {
  id: string;
  title: DrillText;
  subtitle: DrillText;
  options: DrillOptionGroup[];
  /** Optional difficulty ladder (2–10 rungs). A topic without levels is a
   * single-level drill — nothing about the endless flow changes. */
  levels?: DrillLevel[];
  generate: (rng: Rng, config: DrillConfig) => DrillProblem;
};

export function defaultConfig(topic: Pick<DrillTopic, "options">): DrillConfig {
  const config: DrillConfig = {};
  for (const group of topic.options) config[group.id] = [...group.defaults];
  return config;
}

/** The effective config a ladder rung plays with: defaults overridden by the
 * level's preset. generate() never knows levels exist — it just gets a config. */
export function resolveLevelConfig(
  topic: Pick<DrillTopic, "options">,
  level: Pick<DrillLevel, "config">,
): DrillConfig {
  const config = defaultConfig(topic);
  for (const [groupId, ids] of Object.entries(level.config)) config[groupId] = [...ids];
  return config;
}

// ─── Join-link config codec ─────────────────────────────────────────────────
// The teacher's option ticks ride the student join link as one `dopt=` param:
// "direction:deg2rad|rad2deg;range:basic". Ids are [a-z0-9-] by convention so
// the separators are safe; decode is lenient — unknown ids are dropped later
// by groupSelection's defaults fallback.

export function encodeDrillConfig(config: DrillConfig): string {
  return Object.entries(config)
    .filter(([, ids]) => ids.length > 0)
    .map(([groupId, ids]) => `${groupId}:${ids.join("|")}`)
    .join(";");
}

export function decodeDrillConfig(raw: string | null): DrillConfig | null {
  if (!raw) return null;
  const config: DrillConfig = {};
  for (const part of raw.split(";")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const groupId = part.slice(0, colon);
    const ids = part.slice(colon + 1).split("|").filter(Boolean);
    if (ids.length > 0) config[groupId] = ids;
  }
  return Object.keys(config).length > 0 ? config : null;
}

// ─── Level-mode settings codec ──────────────────────────────────────────────
// When a topic has a ladder and the teacher runs it in level mode, the two
// room settings ride the join link as one `lvl=` param: "70x10" = pass at
// 70% of a 10-question batch. Absent param = level mode off (plain endless).

export type DrillLevelSettings = {
  /** Pass threshold, percent of the batch that must be correct (50–100). */
  pass: number;
  /** Questions per level batch (4–20). */
  size: number;
};

export const DEFAULT_LEVEL_SETTINGS: DrillLevelSettings = { pass: 70, size: 10 };

export function encodeLevelSettings(s: DrillLevelSettings): string {
  return `${s.pass}x${s.size}`;
}

export function decodeLevelSettings(raw: string | null): DrillLevelSettings | null {
  if (!raw) return null;
  const m = /^(\d{1,3})x(\d{1,2})$/.exec(raw);
  if (!m) return null;
  const pass = Number(m[1]);
  const size = Number(m[2]);
  if (pass < 50 || pass > 100 || size < 4 || size > 20) return null;
  return { pass, size };
}

/** Correct answers needed to pass a batch: ceil(size × pass%), min 1. */
export function levelPassCount(s: DrillLevelSettings): number {
  return Math.max(1, Math.ceil((s.size * s.pass) / 100));
}

/** Selected ids for a group, falling back to defaults so generate() never sees an empty group. */
export function groupSelection(
  topic: DrillTopic,
  config: DrillConfig,
  groupId: string,
): string[] {
  const group = topic.options.find((g) => g.id === groupId);
  const selected = config[groupId]?.filter((id) =>
    group?.choices.some((c) => c.id === id),
  );
  return selected && selected.length > 0 ? selected : (group?.defaults ?? []);
}
