-- A teacher's saved quiz: a named, reusable selection of questions from one
-- pack quiz, in the teacher's order. Stores only the composition (which
-- questions, what order) — never student results (see the 2026-07-02 decision
-- that dropped quiz_session_results).
--
-- question_ids  -> ordered question ids from the pack. Ids that later vanish
--                  from the pack are dropped at load time, not here.
-- order_mode    -> 'custom' (students follow question_ids) or 'shuffle'
--                  (each student's device deals its own order).

create table if not exists public.saved_quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  question_ids text[] not null check (cardinality(question_ids) between 1 and 500),
  order_mode text not null default 'custom' check (order_mode in ('custom', 'shuffle')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dashboard lists a teacher's quizzes newest-edited first.
create index if not exists saved_quizzes_teacher_idx
  on public.saved_quizzes (teacher_id, updated_at desc);

alter table public.saved_quizzes enable row level security;

-- Owner-only for everything: a teacher sees and edits exactly their own rows.
-- auth.uid() is null for anon, so anonymous requests match nothing.
drop policy if exists "saved quizzes are owner-only" on public.saved_quizzes;
create policy "saved quizzes are owner-only"
  on public.saved_quizzes for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);
