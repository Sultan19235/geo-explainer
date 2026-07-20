import { createAdminClient } from "@/lib/supabase/admin";
import { readPresentIndex, type PresentIndexEntry } from "@/lib/present/index-store";
import { PresentationsAdminClient } from "./presentations-client";

export const dynamic = "force-dynamic";

export default async function AdminPresentationsPage() {
  let entries: PresentIndexEntry[] = [];
  try {
    const admin = createAdminClient();
    entries = await readPresentIndex(admin);
  } catch {
    // Storage unreachable — the upload form still renders.
  }
  return <PresentationsAdminClient entries={entries} />;
}
