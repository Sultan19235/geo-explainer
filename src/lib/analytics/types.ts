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

// One finished live-quiz session, read by the admin panel from quiz_results
// via the service-role client (RLS there is owner-only, which the admin isn't).
export type QuizSessionRow = {
  id: string;
  teacher_id: string;
  quiz_id: string | null;
  title: string;
  room_code: string;
  student_count: number;
  // Frozen scoreboard jsonb; the shape is ResultStudent[] but the admin UI
  // only trusts name/score/total and treats the rest as optional.
  students: Array<{
    name: string;
    score: number;
    total: number;
    finished?: boolean;
    tabSwitches?: number;
    awaySeconds?: number;
  }>;
  // Absent until the started_at column migration is applied.
  started_at?: string | null;
  ended_at: string;
};

// One bar of an activity sparkline: a day (YYYY-MM-DD, Asia/Almaty) + how many
// activity events the teacher produced that day. Bucketing happens server-side
// so client and server never disagree about day boundaries.
export type DailyActivityPoint = {
  day: string;
  count: number;
};
