// Row shapes for the admin user-analytics views/tables. Shared between the
// server pages (which query them via the service-role client) and the client
// components (which render them).

export type UserSummaryRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_admin: boolean;
  session_count: number;
  last_seen_at: string | null;
  first_seen_at: string | null;
  device_count: number;
  ip_count: number;
  grades: number[] | null;
  lesson_count: number;
  quiz_count: number;
};

export type SessionRow = {
  id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  end_reason: string | null;
  login_method: "password" | "oauth" | "signup" | null;
  ip: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  fingerprint: string | null;
};

export type ActivityRow = {
  id: string;
  type: "view_grade" | "view_lesson" | "open_quiz";
  occurred_at: string;
  grade_id: number | null;
  topic_id: string | null;
  quiz_id: string | null;
  topic_name_kz: string | null;
  topic_name_ru: string | null;
  topic_slug: string | null;
  quiz_title_kz: string | null;
  quiz_title_ru: string | null;
  path: string | null;
};
