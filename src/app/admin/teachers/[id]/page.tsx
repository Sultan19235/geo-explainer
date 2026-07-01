import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActivityRow,
  SessionRow,
  UserSummaryRow,
} from "@/lib/analytics/types";
import { UserDetailClient } from "./user-detail-client";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [summaryRes, sessionsRes, eventsRes] = await Promise.all([
    admin
      .from("user_analytics_summary")
      .select(
        "user_id, full_name, email, is_admin, session_count, last_seen_at, first_seen_at, device_count, ip_count, grades, lesson_count, quiz_count",
      )
      .eq("user_id", id)
      .maybeSingle<UserSummaryRow>(),
    admin
      .from("login_sessions")
      .select(
        "id, started_at, last_seen_at, ended_at, end_reason, login_method, ip, browser, os, device_type, fingerprint",
      )
      .eq("user_id", id)
      .order("started_at", { ascending: false })
      .limit(100)
      .returns<SessionRow[]>(),
    admin
      .from("user_activity_detail")
      .select(
        "id, type, occurred_at, grade_id, topic_id, quiz_id, topic_name_kz, topic_name_ru, topic_slug, quiz_title_kz, quiz_title_ru, path",
      )
      .eq("user_id", id)
      .order("occurred_at", { ascending: false })
      .limit(200)
      .returns<ActivityRow[]>(),
  ]);

  if (!summaryRes.data) {
    notFound();
  }

  return (
    <UserDetailClient
      summary={summaryRes.data}
      sessions={sessionsRes.data ?? []}
      events={eventsRes.data ?? []}
    />
  );
}
