// Normalizes the two content sources — native packs (types.ts) and uploaded
// lesson files (file-format.ts) — into one shape the players render. Pack
// content carries blocks; file content carries bilingual HTML. Both carry a
// GgbView source (registry scene or file program).

import type { LessonProblemDef, LessonTheoryDef } from "./file-format";
import { sceneFromFileProgram, type BuiltScene } from "./scenes";
import type { Block, Localized, Params, ProblemPack, TheoryPack } from "./types";

export type PlayerGgbSource =
  | { kind: "scene"; sceneId: string; params: Params }
  | { kind: "program"; program: BuiltScene; programKey: string };

// What the bank drawer and the navigator need to know about a problem —
// metadata from the DB row, plus the statement once the file is parsed
// (filled in progressively by the lesson page's background preload).
export type BankProblem = {
  id: string;
  number: string;
  title: Localized;
  difficulty?: "easy" | "med" | "hard";
  tags?: Localized[];
  statementHtml?: { kz: string; ru?: string };
};

export type PlayerStep = {
  name: Localized;
  blocks?: Block[];
  html?: { kz: string; ru?: string };
  sceneStep: number;
};

export type PlayerProblem = {
  key: string;
  number: string;
  title: Localized;
  params?: Params;
  statementBlocks?: Block[];
  statementHtml?: { kz: string; ru?: string };
  steps: PlayerStep[];
  // Absent for figure-less problems — the player renders text full-width.
  ggb?: PlayerGgbSource;
};

export type PlayerTheorySection = {
  id: string;
  title: Localized;
  blocks?: Block[];
  html?: { kz: string; ru?: string };
  ggb?: PlayerGgbSource;
  sceneStep: number;
};

export type PlayerTheory = {
  title: Localized;
  subtitle?: Localized;
  params?: Params;
  sections: PlayerTheorySection[];
};

// ─── Pack adapters ───────────────────────────────────────────────────────────

export function packToPlayerProblem(pack: ProblemPack): PlayerProblem {
  return {
    key: pack.id,
    number: pack.number,
    title: pack.title,
    params: pack.params,
    statementBlocks: pack.statement,
    steps: pack.steps.map((step) => ({
      name: step.name,
      blocks: step.blocks,
      sceneStep: step.sceneStep ?? 0,
    })),
    ggb: {
      kind: "scene",
      sceneId: pack.scene.id,
      params: { ...pack.params, ...pack.scene.params },
    },
  };
}

export function packToPlayerTheory(pack: TheoryPack): PlayerTheory {
  return {
    title: pack.title,
    subtitle: pack.subtitle,
    params: pack.params,
    sections: pack.sections.map((section) => ({
      id: section.id,
      title: section.title,
      blocks: section.blocks,
      ggb: section.scene
        ? {
            kind: "scene",
            sceneId: section.scene.id,
            params: { ...pack.params, ...section.scene.params },
          }
        : undefined,
      sceneStep: section.sceneStep ?? 0,
    })),
  };
}

// ─── Lesson-file adapters ────────────────────────────────────────────────────

export function fileToPlayerProblem(
  def: LessonProblemDef,
  fallbackNumber?: string,
): PlayerProblem {
  return {
    key: def.id,
    number: def.number ?? fallbackNumber ?? "",
    title: def.title,
    statementHtml: def.statement,
    steps: def.steps.map((step, index) => ({
      name: step.title,
      html: step.html,
      sceneStep: index,
    })),
    ggb: def.init
      ? {
          kind: "program",
          programKey: def.id,
          program: sceneFromFileProgram({
            view: def.view,
            home: def.home,
            fit: def.fit,
            axes: def.axes,
            init: def.init as unknown as (g: unknown) => void,
            stepRuns: def.steps.map(
              (step) =>
                step.run as unknown as ((g: unknown) => void) | undefined,
            ),
          }),
        }
      : undefined,
  };
}

export function fileToPlayerTheory(defs: LessonTheoryDef[]): PlayerTheory | null {
  if (defs.length === 0) return null;
  const sections: PlayerTheorySection[] = [];
  for (const def of defs) {
    def.sections.forEach((section, index) => {
      const id = `${def.id}:${index}`;
      sections.push({
        id,
        title: section.title,
        html: section.html,
        ggb: section.ggb
          ? {
              kind: "program",
              programKey: id,
              program: sceneFromFileProgram({
                view: section.view,
                home: section.home,
                fit: section.fit,
                axes: section.axes,
                init: section.ggb as unknown as (g: unknown) => void,
                stepRuns: [],
              }),
            }
          : undefined,
        sceneStep: 0,
      });
    });
  }
  return {
    title: defs[0].title,
    subtitle: defs[0].subtitle,
    sections,
  };
}
