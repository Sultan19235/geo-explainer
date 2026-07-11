// Lesson content packs: theory + problems rendered by the native lesson player.
// Same localization convention as quiz packs: a text field is either a plain
// string (Kazakh) or {kz, ru}; Russian falls back to Kazakh when missing.

import type { Lang } from "@/lib/i18n/strings";

export type Localized = string | { kz: string; ru?: string };

export type Params = Record<string, number | string>;

export function pickText(value: Localized | undefined, lang: Lang): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return (lang === "ru" ? value.ru : undefined) ?? value.kz ?? "";
}

// Replaces {{name}} tokens with pack param values so the same numbers feed
// both the text and the GeoGebra scene. `{{d}}` → "9".
export function substParams(text: string, params: Params | undefined): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === "number" ? formatNumber(value) : value;
  });
}

export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export type Block =
  | { type: "p"; text: Localized }
  | { type: "given"; latex: string }
  | { type: "find"; text: Localized }
  | { type: "formula"; latex: string; label?: Localized }
  | { type: "callout"; text: Localized; title?: Localized }
  | { type: "answer"; text: Localized };

export type ProblemStep = {
  name: Localized; // "Берілгені", "Шешуі", "Жауабы"
  blocks: Block[];
  // Which scene state this step shows (index into the scene's step list).
  sceneStep?: number;
};

export type SceneRef = {
  id: string;
  // Extra scene params merged over the pack params (e.g. labels: "symbolic").
  params?: Params;
};

export type ProblemPack = {
  id: string;
  number: string;
  title: Localized;
  difficulty?: "easy" | "med" | "hard";
  // Topic tags shown on bank cards and used as filter chips in the picker.
  tags?: Localized[];
  params: Params;
  scene: SceneRef;
  // The problem's condition, pinned above the walkthrough so it never
  // scrolls away while the teacher steps through the solution.
  statement?: Block[];
  steps: ProblemStep[];
};

export type TheorySection = {
  id: string;
  title: Localized;
  blocks: Block[];
  scene?: SceneRef;
  sceneStep?: number;
};

export type TheoryPack = {
  id: string;
  title: Localized;
  subtitle?: Localized;
  params?: Params;
  sections: TheorySection[];
};
