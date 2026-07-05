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
};

export function packPath(quizId: string) {
  return `quiz/${quizId}/pack.json`;
}

// Local pack testing without touching Storage: in development only, the id
// "dev-preview" serves packs/dev-preview.json straight from the repo.
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
    return { id: "dev-preview", title_kz: "Dev preview", title_ru: null, pack };
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

  return {
    id: quiz.id,
    title_kz: quiz.title_kz,
    title_ru: quiz.title_ru,
    pack,
  };
}
