"use server";

// Admin actions for presentation files. Upload philosophy: the admin's
// BROWSER runs the full evaluator + validator (evaluatePresentationCode)
// before anything is sent here — the server never executes uploaded code.
// Function-scope shadowing is much weaker in Node than in a browser tab
// (globalThis still reaches process.env), so server-side execution is off
// the table by design. This action does non-executing checks only: size,
// the register call being present, and a well-shaped meta. The player
// re-evaluates and re-validates the stored file on every open, so a
// mismatched meta can at worst mislabel a card — an admin-only surface.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  comparePresentEntries,
  loadPresentIndexStrict,
  PRESENT_BUCKET,
  presentFilePath,
  RESERVED_PRESENT_IDS,
  writePresentIndex,
  type PresentIndexEntry,
} from "@/lib/present/index-store";

const ID_RE = /^[a-z0-9][a-z0-9.-]{1,39}$/;
const FILE_MAX_BYTES = 300_000;
const MAX_SLIDES = 80;
const MAX_FILES = 50;
const MAX_TITLE = 200;

export type PresentUploadMeta = {
  id: string;
  titleKz: string;
  titleRu?: string;
  subtitleKz?: string;
  subtitleRu?: string;
  slides: number;
};

export type PresentUploadResult = {
  name: string;
  ok: boolean;
  message: string;
};

function metaError(meta: PresentUploadMeta): string | null {
  if (!ID_RE.test(meta.id)) return "invalid id";
  if (RESERVED_PRESENT_IDS.has(meta.id)) {
    return `id "${meta.id}" is reserved — pick another slug`;
  }
  if (typeof meta.titleKz !== "string" || meta.titleKz.trim().length === 0) {
    return "invalid title";
  }
  if (
    !Number.isInteger(meta.slides) ||
    meta.slides < 1 ||
    meta.slides > MAX_SLIDES
  ) {
    return "invalid slide count";
  }
  return null;
}

export async function uploadPresentationsAction(input: {
  files: { name: string; text: string; meta: PresentUploadMeta }[];
}): Promise<{ ok: boolean; results: PresentUploadResult[] }> {
  await requireAdmin();
  if (!Array.isArray(input.files) || input.files.length === 0) {
    return { ok: false, results: [] };
  }

  const admin = createAdminClient();
  // Strict read: aborting beats rewriting the index from a false-empty read
  // and wiping the catalog.
  const indexRead = await loadPresentIndexStrict(admin);
  if (!indexRead.ok) {
    return {
      ok: false,
      results: [{ name: "index.json", ok: false, message: indexRead.error }],
    };
  }
  const byId = new Map(indexRead.entries.map((entry) => [entry.id, entry]));
  const results: PresentUploadResult[] = [];
  let changed = false;

  for (const file of input.files.slice(MAX_FILES)) {
    results.push({
      name: String(file.name ?? "file"),
      ok: false,
      message: `батч шегі ${MAX_FILES} файл — бұл файл жүктелмеді, қайта жүктеңіз`,
    });
  }
  for (const file of input.files.slice(0, MAX_FILES)) {
    const name = String(file.name ?? "file");
    const text = String(file.text ?? "");
    const meta = file.meta;

    if (text.length === 0 || text.length > FILE_MAX_BYTES) {
      results.push({ name, ok: false, message: "файл бос немесе тым үлкен" });
      continue;
    }
    if (!text.includes("registerPresentation(")) {
      results.push({
        name,
        ok: false,
        message: "registerPresentation({...}) табылмады",
      });
      continue;
    }
    const shapeError =
      meta && typeof meta === "object" ? metaError(meta) : "missing meta";
    if (shapeError) {
      results.push({ name, ok: false, message: shapeError });
      continue;
    }

    const { error: uploadError } = await admin.storage
      .from(PRESENT_BUCKET)
      .upload(
        presentFilePath(meta.id),
        new Blob([text], { type: "text/javascript" }),
        { upsert: true, contentType: "text/javascript; charset=utf-8" },
      );
    if (uploadError) {
      results.push({ name, ok: false, message: uploadError.message });
      continue;
    }

    const existing = byId.get(meta.id);
    const entry: PresentIndexEntry = {
      id: meta.id,
      title: {
        kz: meta.titleKz.trim().slice(0, MAX_TITLE),
        ...(meta.titleRu?.trim()
          ? { ru: meta.titleRu.trim().slice(0, MAX_TITLE) }
          : {}),
      },
      ...(meta.subtitleKz?.trim()
        ? {
            subtitle: {
              kz: meta.subtitleKz.trim().slice(0, MAX_TITLE),
              ...(meta.subtitleRu?.trim()
                ? { ru: meta.subtitleRu.trim().slice(0, MAX_TITLE) }
                : {}),
            },
          }
        : {}),
      slides: meta.slides,
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    byId.set(meta.id, entry);
    changed = true;
    results.push({
      name,
      ok: true,
      message: existing
        ? `жаңартылды (${meta.id} · v${entry.version})`
        : `қосылды (${meta.id})`,
    });
  }

  if (changed) {
    const writeError = await writePresentIndex(
      admin,
      [...byId.values()].sort(comparePresentEntries),
    );
    if (writeError) {
      results.push({ name: "index.json", ok: false, message: writeError });
    }
    revalidatePath("/labs/present");
    revalidatePath("/admin/presentations");
  }
  return { ok: results.every((result) => result.ok), results };
}

export async function deletePresentationAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!ID_RE.test(input.id)) return { ok: false, error: "invalid id" };

  const admin = createAdminClient();
  // Read the index STRICTLY first — a false-empty read here would rewrite
  // the catalog down to nothing. Then remove the file, then delist: if the
  // file removal fails the entry stays listed and the delete can be retried.
  const indexRead = await loadPresentIndexStrict(admin);
  if (!indexRead.ok) return { ok: false, error: indexRead.error };

  const { error: removeError } = await admin.storage
    .from(PRESENT_BUCKET)
    .remove([presentFilePath(input.id)]);
  if (removeError) return { ok: false, error: removeError.message };

  const writeError = await writePresentIndex(
    admin,
    indexRead.entries.filter((entry) => entry.id !== input.id),
  );
  if (writeError) return { ok: false, error: writeError };
  revalidatePath("/labs/present");
  revalidatePath("/admin/presentations");
  return { ok: true };
}
