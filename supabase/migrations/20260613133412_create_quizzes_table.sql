-- A topic can have MANY teacher quiz consoles, shown stacked on the lesson page
-- below theory and problems. This table models them like `problems`: one row
-- per quiz, ordered, belonging to a topic.
--
-- teacher_html_path  -> file in the PRIVATE `lessons` bucket; embedded as an
--                       iframe in the (already gated) lesson page via a signed URL.
-- student_html_path  -> file in a PUBLIC bucket; the standalone page students
--                       open by QR on their phones. Nullable (a quiz may be
--                       teacher-only). NOT embedded in the lesson page.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete cascade,
  title_kz text not null,
  title_ru text,
  teacher_html_path text,
  student_html_path text,
  display_order int not null default 0,
  is_ready boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists quizzes_topic_id_idx on public.quizzes (topic_id);

alter table public.quizzes enable row level security;

-- Public read: the lesson page reads quizzes with the anon client, exactly like
-- it reads problems. Access to the lesson itself is enforced by the page
-- (granted_grades / free sample), so a row being selectable is fine — the
-- private teacher_html_path is only ever turned into a signed URL server-side.
drop policy if exists "quizzes are readable by everyone" on public.quizzes;
create policy "quizzes are readable by everyone"
  on public.quizzes for select
  using (true);

-- Writes are admin-only and happen through the service-role client (which
-- bypasses RLS). No insert/update/delete policy is granted to anon or
-- authenticated, so non-admins cannot modify quizzes.
