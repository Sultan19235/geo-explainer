-- Final results of live quiz sessions, written by the Hetzner realtime server
-- (service role) when a session ends — teacher pressed "end" or the 45-minute
-- timer expired. Until now results lived only in the server's memory and
-- evaporated; this is the durable copy teachers' history views will read.
--
-- One row per session; per-student final scores are a jsonb array (~30
-- students/room, ~20k sessions/day at full scale — small either way).
-- quiz_id / teacher_user_id are nullable: consoles uploaded before v2 send
-- neither, and the auth gate may be off (no teacher identity known).

create table if not exists public.quiz_session_results (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references public.quizzes (id) on delete set null,
  teacher_user_id uuid,
  code text not null,
  title text,
  ended_reason text not null check (ended_reason in ('teacher', 'timeout')),
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  student_count int not null default 0,
  -- [{student_id, name, score, total, finished, tab_switches, away_seconds}]
  students jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_session_results_quiz_id_idx
  on public.quiz_session_results (quiz_id);
create index if not exists quiz_session_results_teacher_idx
  on public.quiz_session_results (teacher_user_id);
create index if not exists quiz_session_results_created_idx
  on public.quiz_session_results (created_at desc);

alter table public.quiz_session_results enable row level security;

-- No policies on purpose: only service-role clients (the Hetzner server and
-- the admin pages) touch this table. A teacher-scoped read policy comes later
-- with the results-history UI.
