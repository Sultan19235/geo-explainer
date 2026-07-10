-- Saved outcomes of finished live-quiz sessions, shown in the teacher's
-- profile. Reverses the 2026-07-02 "no class history" decision (user request
-- 2026-07-10). The Hetzner live server still writes nothing — the teacher's
-- console inserts one row per session under RLS when the room ends.
--
-- students     -> frozen scoreboard: [{ name, score, total, finished,
--                 tabSwitches, awaySeconds, answers? }], where answers maps
--                 question id -> 0|1 (present only for pack quizzes; generator
--                 rooms have no stable question ids).
-- question_ids -> the room's questions in the teacher's order, so the detail
--                 view can label per-question columns. Null for generator rooms.
-- quiz_id      -> source pack; kept (set null) if the pack is later deleted so
--                 the history row survives.

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  quiz_id uuid references public.quizzes (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  room_code text not null check (char_length(room_code) between 1 and 8),
  question_ids text[] check (question_ids is null or cardinality(question_ids) between 1 and 500),
  students jsonb not null,
  student_count int not null check (student_count between 1 and 200),
  ended_at timestamptz not null default now()
);

-- Profile lists a teacher's sessions newest first.
create index if not exists quiz_results_teacher_idx
  on public.quiz_results (teacher_id, ended_at desc);

alter table public.quiz_results enable row level security;

-- Owner-only, and deliberately no UPDATE policy: a saved result is a frozen
-- record — it can be read or deleted by its teacher, never edited.
drop policy if exists "quiz results are owner-readable" on public.quiz_results;
create policy "quiz results are owner-readable"
  on public.quiz_results for select
  using (auth.uid() = teacher_id);

drop policy if exists "quiz results are owner-insertable" on public.quiz_results;
create policy "quiz results are owner-insertable"
  on public.quiz_results for insert
  with check (auth.uid() = teacher_id);

drop policy if exists "quiz results are owner-deletable" on public.quiz_results;
create policy "quiz results are owner-deletable"
  on public.quiz_results for delete
  using (auth.uid() = teacher_id);
