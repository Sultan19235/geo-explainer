import { createAdminClient } from "@/lib/supabase/admin";
import { readPresentIndex, type PresentIndexEntry } from "@/lib/present/index-store";
import { PresentationsAdminClient, type TopicOption } from "./presentations-client";

export const dynamic = "force-dynamic";

export default async function AdminPresentationsPage() {
  let entries: PresentIndexEntry[] = [];
  let topics: TopicOption[] = [];
  try {
    const admin = createAdminClient();
    const [index, topicRows] = await Promise.all([
      readPresentIndex(admin),
      admin
        .from("topics")
        .select("id, grade_id, name_kz, display_order")
        .order("grade_id")
        .order("display_order"),
    ]);
    entries = index;
    topics = (topicRows.data ?? []) as TopicOption[];
  } catch {
    // Storage unreachable — the upload form still renders.
  }
  return <PresentationsAdminClient entries={entries} topics={topics} />;
}
