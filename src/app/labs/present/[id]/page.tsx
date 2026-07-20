import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { readPresentIndex } from "@/lib/present/index-store";
import { PresentPlayerLoader } from "@/components/present/player-loader";

export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9][a-z0-9.-]{1,39}$/;

async function findEntry(rawId: string) {
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return null; // malformed percent-encoding → 404, not 500
  }
  if (!ID_RE.test(id)) return null;
  try {
    const admin = createAdminClient();
    const entries = await readPresentIndex(admin);
    return entries.find((entry) => entry.id === id) ?? null;
  } catch {
    return null;
  }
}

/**
 * Cache-buster: the upload timestamp, NOT the version counter — the counter
 * resets after delete + re-upload of the same id, which would resurrect a
 * year-long immutable cache of the OLD file. Timestamps only grow.
 */
function cacheKey(entry: { updatedAt: string; version: number }): string {
  const time = Date.parse(entry.updatedAt);
  return Number.isFinite(time) ? String(time) : `v${entry.version}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = await findEntry(id);
  return { title: entry ? `${entry.title.kz} — презентация` : "Презентация" };
}

export default async function PresentPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const entry = await findEntry(rawId);
  if (!entry) notFound();

  return (
    <PresentPlayerLoader
      src={`/present-files/${entry.id}?v=${cacheKey(entry)}`}
      backHref="/labs/present"
    />
  );
}
