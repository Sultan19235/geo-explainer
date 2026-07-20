// Presentation publish index — storage-backed metadata for uploaded
// presentation files. Deliberately NO database table: files live in the
// private `lessons` bucket under presentations/, and one JSON index file is
// the list the hub and the admin page read. Zero migrations — the feature
// works the moment it deploys; a proper table can arrive together with
// catalog placement (/grades) later, backfilled from this index.
//
// The read/write helpers take a service-role client and run server-side
// (admin actions, server pages, the file-serving route); the constants and
// types at the top are also imported by client components — nothing here
// touches secrets on its own.

import type { SupabaseClient } from "@supabase/supabase-js";

export const PRESENT_BUCKET = "lessons";
export const PRESENT_PREFIX = "presentations";
const INDEX_PATH = `${PRESENT_PREFIX}/index.json`;

/** Path segments that are static routes under /labs/present. */
export const RESERVED_PRESENT_IDS = new Set(["file", "demo", "index"]);

export type PresentIndexEntry = {
  id: string;
  title: { kz: string; ru?: string };
  subtitle?: { kz: string; ru?: string };
  /** Slide count — shown on hub/admin cards. */
  slides: number;
  /** Bumped on every re-upload; cache-busts /present-files/<id>?v=N. */
  version: number;
  updatedAt: string; // ISO
};

export function presentFilePath(id: string): string {
  return `${PRESENT_PREFIX}/${id}.js`;
}

/** Numeric-aware id sort: 5.1.2 < 5.1.10 < 5.2.1. */
export function comparePresentEntries(
  a: PresentIndexEntry,
  b: PresentIndexEntry,
): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

/**
 * Strict read for WRITERS (upload/delete): a missing index is a normal empty
 * start, but any other failure — network blip, storage 5xx, corrupt JSON —
 * aborts, because the caller is about to rewrite index.json and a false
 * "empty" read would wipe the whole catalog. (A genuinely corrupt index is
 * recovered by deleting presentations/index.json in the Supabase dashboard:
 * not-found then reads as a fresh start.)
 */
export async function loadPresentIndexStrict(
  admin: SupabaseClient,
): Promise<
  | { ok: true; entries: PresentIndexEntry[] }
  | { ok: false; error: string }
> {
  const { data, error } = await admin.storage
    .from(PRESENT_BUCKET)
    .download(INDEX_PATH);
  if (error) {
    const status = (error as { status?: number }).status;
    const notFound = status === 404 || /not.?found/i.test(error.message ?? "");
    if (notFound) return { ok: true, entries: [] };
    return { ok: false, error: `index.json read failed: ${error.message}` };
  }
  if (!data) return { ok: false, error: "index.json read returned no data" };
  try {
    const parsed = JSON.parse(await data.text()) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) {
      return { ok: false, error: "index.json is malformed (no entries array)" };
    }
    return {
      ok: true,
      entries: (parsed.entries as PresentIndexEntry[])
        .filter(
          (entry) =>
            typeof entry?.id === "string" &&
            typeof entry?.title?.kz === "string" &&
            Number.isFinite(entry?.version),
        )
        .sort(comparePresentEntries),
    };
  } catch (e) {
    return {
      ok: false,
      error: `index.json is corrupt: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Tolerant read for READERS (hub, player, admin list): errors render empty. */
export async function readPresentIndex(
  admin: SupabaseClient,
): Promise<PresentIndexEntry[]> {
  const result = await loadPresentIndexStrict(admin);
  return result.ok ? result.entries : [];
}

/** Returns an error message, or null on success. */
export async function writePresentIndex(
  admin: SupabaseClient,
  entries: PresentIndexEntry[],
): Promise<string | null> {
  const body = JSON.stringify(
    { entries: [...entries].sort(comparePresentEntries) },
    null,
    2,
  );
  const { error } = await admin.storage
    .from(PRESENT_BUCKET)
    .upload(INDEX_PATH, new Blob([body], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json; charset=utf-8",
    });
  return error ? error.message : null;
}
