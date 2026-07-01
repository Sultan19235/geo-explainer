-- User (teacher) analytics: login history + activity tracking for the admin panel.
--
-- Two tables, both written and read ONLY through the service-role admin client:
--   * login_sessions  — one row per login. Answers "when did they log in, from
--                        where (IP + device), how long were they active".
--   * activity_events — one row per meaningful action (opened a grade, a lesson,
--                        a quiz). Answers "what content did they use".
--
-- RLS is enabled with NO anon/authenticated policies on purpose: the app never
-- touches these tables with the user's session. Writes happen server-side via
-- the service role (fire-and-forget from auth flows and tracked pages); reads
-- happen only in the admin panel, which is already gated by requireAdmin().

create table if not exists public.login_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.teachers (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,                       -- 'logout' (explicit) | null | future: 'timeout'
  login_method text,                     -- 'password' | 'oauth' | 'signup'
  ip text,
  user_agent text,
  browser text,
  os text,
  device_type text,                      -- 'mobile' | 'tablet' | 'desktop'
  fingerprint text                       -- lightweight client device hash (account-sharing signal)
);

-- Most queries are "this user's sessions, newest first".
create index if not exists login_sessions_user_id_idx
  on public.login_sessions (user_id, started_at desc);

-- Account-sharing detection groups a user's sessions by device.
create index if not exists login_sessions_fingerprint_idx
  on public.login_sessions (user_id, fingerprint);

alter table public.login_sessions enable row level security;

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.teachers (id) on delete cascade,
  -- Nullable + ON DELETE SET NULL: an event outlives its session row so the
  -- activity timeline is never truncated by session cleanup.
  session_id uuid references public.login_sessions (id) on delete set null,
  type text not null,                    -- 'view_grade' | 'view_lesson' | 'open_quiz'
  occurred_at timestamptz not null default now(),
  grade_id int,
  topic_id uuid,                         -- references topics(id); no FK to keep writes cheap
  quiz_id uuid,                          -- references quizzes(id); no FK to keep writes cheap
  path text
);

create index if not exists activity_events_user_id_idx
  on public.activity_events (user_id, occurred_at desc);

create index if not exists activity_events_type_idx
  on public.activity_events (user_id, type);

alter table public.activity_events enable row level security;
