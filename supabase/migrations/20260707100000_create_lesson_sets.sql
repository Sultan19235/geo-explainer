-- A teacher's saved lesson set: a named, reusable, ordered selection of
-- problems from one topic's bank in the lesson player (e.g. 20 of 100
-- cylinder problems, reused across classes for a week). Stores only the
-- composition — never student results (see the 2026-07-02 decision that
-- dropped quiz_session_results).
--
-- topic_id     -> pack topic slug, e.g. 'cylinder'.
-- problem_ids  -> ordered problem ids from the pack. Ids that later vanish
--                 from the pack are dropped at load time, not here.

create table if not exists public.lesson_sets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  topic_id text not null check (char_length(topic_id) between 1 and 64),
  name text not null check (char_length(name) between 1 and 120),
  problem_ids text[] not null check (cardinality(problem_ids) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The picker lists a teacher's sets for one topic, newest-edited first.
create index if not exists lesson_sets_teacher_topic_idx
  on public.lesson_sets (teacher_id, topic_id, updated_at desc);

alter table public.lesson_sets enable row level security;

-- Owner-only for everything: a teacher sees and edits exactly their own rows.
-- auth.uid() is null for anon, so anonymous requests match nothing.
drop policy if exists "lesson sets are owner-only" on public.lesson_sets;
create policy "lesson sets are owner-only"
  on public.lesson_sets for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);
