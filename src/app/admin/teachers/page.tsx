import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserSummaryRow } from "@/lib/analytics/types";
import { UsersListClient } from "./users-list-client";

export default async function TeachersAnalyticsPage() {
  await requireAdmin();
  const admin = createAdminClient();

  // Most-recently-active teachers first; those who never logged in sort last.
  const { data, error } = await admin
    .from("user_analytics_summary")
    .select(
      "user_id, full_name, email, is_admin, session_count, last_seen_at, first_seen_at, device_count, ip_count, grades, lesson_count, quiz_count",
    )
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .returns<UserSummaryRow[]>();

  return (
    <UsersListClient rows={data ?? []} errorMessage={error?.message ?? null} />
  );
}
