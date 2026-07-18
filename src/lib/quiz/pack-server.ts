// Server-side pack loading. Import only from server components/routes.

import { promises as fs } from "fs";
import path from "path";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePack, type QuizPack } from "./pack";

const PACK_BUCKET = "quizzes-public";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuizWithPack = {
  id: string;
  title_kz: string;
  title_ru: string | null;
  pack: QuizPack;
  // Uploaded drill-generator file (pack.generator = {type:"drill", file:true}):
  // the .js source, executed only inside the student page's sandbox worker.
  generatorCode: string | null;
};

export function packPath(quizId: string) {
  return `quiz/${quizId}/pack.json`;
}

export function drillGenPath(quizId: string) {
  return `quiz/${quizId}/generator.js`;
}

// Local pack testing without touching Storage: in development only, the id
// "dev-preview" serves packs/dev-preview.json straight from the repo (and
// packs/dev-preview.generator.js for an uploaded-generator pack).
// Documented in docs/QUIZ_PACK_FORMAT.md.
async function loadDevPreview(): Promise<QuizWithPack | null> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "packs", "dev-preview.json"),
      "utf8",
    );
    const { pack, errors } = validatePack(JSON.parse(raw));
    if (!pack) {
      console.error("dev-preview pack invalid:", errors);
      return null;
    }
    let generatorCode: string | null = null;
    if (pack.generator?.type === "drill" && pack.generator.file) {
      generatorCode = await fs
        .readFile(
          path.join(process.cwd(), "packs", "dev-preview.generator.js"),
          "utf8",
        )
        .catch(() => null);
    }
    return {
      id: "dev-preview",
      title_kz: "Dev preview",
      title_ru: null,
      pack,
      generatorCode,
    };
  } catch {
    return null;
  }
}

// Cache tag for one pack file; admin upload/delete revalidates it so a new
// pack is served immediately despite the cache below.
export function packCacheTag(storagePath: string) {
  return `quiz-pack:${storagePath}`;
}

async function downloadPackFresh(
  storagePath: string,
): Promise<QuizPack | null> {
  const admin = createAdminClient();
  const { data: file, error } = await admin.storage
    .from(PACK_BUCKET)
    .download(storagePath);
  if (error || !file) return null;
  try {
    const { pack, errors } = validatePack(JSON.parse(await file.text()));
    if (!pack) {
      console.error(`pack at ${storagePath} invalid:`, errors);
      return null;
    }
    return pack;
  } catch {
    return null;
  }
}

// Light path for pages that already hold the quiz row: just fetch + validate
// the pack file. Cached — the pack is the largest payload on the lesson
// quizzes page and only ever changes via admin re-upload.
export async function downloadPack(
  storagePath: string,
): Promise<QuizPack | null> {
  return unstable_cache(
    () => downloadPackFresh(storagePath),
    ["quiz-pack", storagePath],
    { revalidate: 300, tags: [packCacheTag(storagePath)] },
  )();
}

// Uploaded drill-generator source. Cached and tagged with the PACK's cache
// tag — the admin action revalidates that tag on every (re)upload, and file
// and pack always change together.
export async function downloadDrillGeneratorCode(
  quizId: string,
): Promise<string | null> {
  const storagePath = drillGenPath(quizId);
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data: file, error } = await admin.storage
        .from(PACK_BUCKET)
        .download(storagePath);
      if (error || !file) return null;
      return file.text();
    },
    ["drill-generator", storagePath],
    { revalidate: 300, tags: [packCacheTag(packPath(quizId))] },
  )();
}

export async function loadQuizWithPack(
  quizId: string,
): Promise<QuizWithPack | null> {
  if (quizId === "dev-preview" && process.env.NODE_ENV !== "production") {
    return loadDevPreview();
  }
  if (!UUID_RE.test(quizId)) return null;

  const admin = createAdminClient();
  const { data: quiz } = await admin
    .from("quizzes")
    .select("id, title_kz, title_ru, is_ready, pack_path")
    .eq("id", quizId)
    .maybeSingle<{
      id: string;
      title_kz: string;
      title_ru: string | null;
      is_ready: boolean;
      pack_path: string | null;
    }>();

  if (!quiz || !quiz.is_ready || !quiz.pack_path) return null;

  const pack = await downloadPack(quiz.pack_path);
  if (!pack) return null;

  const generatorCode =
    pack.generator?.type === "drill" && pack.generator.file
      ? await downloadDrillGeneratorCode(quiz.id)
      : null;

  return {
    id: quiz.id,
    title_kz: quiz.title_kz,
    title_ru: quiz.title_ru,
    pack,
    generatorCode,
  };
}
