// Lesson-file format: the contract between the teacher's bulk-authored .js
// content files, the standalone previewer, and the site player.
//
// A file is a plain script calling registerLessonProblem(def) or
// registerLessonTheory(def) (globals provided by public/lesson-runtime.js).
// It also carries a machine-readable meta header so the upload server can
// index it without executing user code:
//
//   /*__LESSON_META__
//   { "format": 1, "kind": "problem", "id": "...", ... }
//   __LESSON_META__*/

import type { Localized } from "./types";

export const LESSON_FILE_FORMAT_VERSION = 1;

export type LessonToolkit = {
  api: unknown;
  cmd(command: string): void;
  set(name: string, value: number): void;
  get(name: string): number | undefined;
  exists(name: string): boolean;
  del(name: string): void;
  col(name: string, color: number[]): void;
  fill(name: string, value: number): void;
  vis(name: string, visible: boolean): void;
  show(...names: (string | string[])[]): void;
  hide(...names: (string | string[])[]): void;
  view(direction: string): void;
  hideAxes(): void;
  [helper: string]: unknown;
};

export type LessonFileStep = {
  title: Localized;
  html: { kz: string; ru?: string };
  // Moves the model forward when this step becomes current. Backward
  // navigation replays init + run(0..k) on a clean construction.
  run?: (g: LessonToolkit) => void;
};

export type LessonProblemDef = {
  format: number;
  id: string;
  number?: string;
  title: Localized;
  difficulty?: "easy" | "med" | "hard";
  tags?: Localized[];
  view?: "3d" | "2d";
  // Camera: SetViewDirection argument, e.g. "(1.3,-1.6,0.7)".
  home?: string;
  // Optional visible-box fit [xmin, xmax, ymin, ymax, zmin, zmax].
  fit?: [number, number, number, number, number, number];
  // Show axes/grid instead of the default clean canvas.
  axes?: boolean;
  statement: { kz: string; ru?: string };
  init: (g: LessonToolkit) => void;
  steps: LessonFileStep[];
};

export type LessonTheorySection = {
  title: Localized;
  html: { kz: string; ru?: string };
  view?: "3d" | "2d";
  home?: string;
  fit?: [number, number, number, number, number, number];
  axes?: boolean;
  // Builds this section's model on a clean construction (optional — text-only
  // sections render full-width).
  ggb?: (g: LessonToolkit) => void;
};

export type LessonTheoryDef = {
  format: number;
  id: string;
  title: Localized;
  subtitle?: Localized;
  sections: LessonTheorySection[];
};

// ─── Meta header (parsed server-side without executing the file) ────────────

export type LessonFileMeta = {
  format: number;
  kind: "problem" | "theory";
  id: string;
  number?: string;
  title: { kz: string; ru?: string };
  difficulty?: "easy" | "med" | "hard";
  tags?: { kz: string; ru?: string }[];
};

const META_RE = /\/\*__LESSON_META__\s*([\s\S]*?)\s*__LESSON_META__\*\//;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type MetaParseResult =
  | { ok: true; meta: LessonFileMeta }
  | { ok: false; error: string };

export function parseLessonFileMeta(source: string): MetaParseResult {
  const match = source.match(META_RE);
  if (!match) {
    return { ok: false, error: "meta header not found (__LESSON_META__)" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return { ok: false, error: "meta header is not valid JSON" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "meta header must be a JSON object" };
  }
  const meta = raw as Record<string, unknown>;

  if (meta.format !== LESSON_FILE_FORMAT_VERSION) {
    return { ok: false, error: `unsupported format (expected ${LESSON_FILE_FORMAT_VERSION})` };
  }
  if (meta.kind !== "problem" && meta.kind !== "theory") {
    return { ok: false, error: 'kind must be "problem" or "theory"' };
  }
  if (typeof meta.id !== "string" || !ID_RE.test(meta.id)) {
    return { ok: false, error: "id must be a short lowercase slug (a-z, 0-9, -)" };
  }
  const title = meta.title as Record<string, unknown> | undefined;
  if (!title || typeof title.kz !== "string" || title.kz.length === 0) {
    return { ok: false, error: "title.kz is required" };
  }
  if (
    meta.difficulty !== undefined &&
    meta.difficulty !== "easy" &&
    meta.difficulty !== "med" &&
    meta.difficulty !== "hard"
  ) {
    return { ok: false, error: "difficulty must be easy | med | hard" };
  }

  const tags: { kz: string; ru?: string }[] = [];
  if (meta.tags !== undefined) {
    if (!Array.isArray(meta.tags)) {
      return { ok: false, error: "tags must be an array" };
    }
    for (const tag of meta.tags) {
      if (typeof tag === "string") tags.push({ kz: tag });
      else if (tag && typeof tag.kz === "string") {
        tags.push({ kz: tag.kz, ru: typeof tag.ru === "string" ? tag.ru : undefined });
      } else {
        return { ok: false, error: "each tag must be a string or {kz, ru}" };
      }
    }
  }

  return {
    ok: true,
    meta: {
      format: LESSON_FILE_FORMAT_VERSION,
      kind: meta.kind,
      id: meta.id,
      number: typeof meta.number === "string" ? meta.number : undefined,
      title: { kz: title.kz as string, ru: typeof title.ru === "string" ? title.ru : undefined },
      difficulty: meta.difficulty as LessonFileMeta["difficulty"],
      tags,
    },
  };
}
