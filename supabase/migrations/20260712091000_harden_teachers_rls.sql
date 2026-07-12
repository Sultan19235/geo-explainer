-- Locks down public.teachers, closing the self-promote risk flagged in the
-- 2026-07-10 security audit: the table predates tracked migrations, so its
-- live policies are unknown to the repo. A permissive UPDATE policy (or RLS
-- being off) would let any signed-in teacher set is_admin = true or stuff
-- granted_grades on their own row with a hand-crafted PostgREST request.
--
-- This drops whatever policies exist and recreates exactly what the app
-- needs. Every anon-client use of teachers is a SELECT of the caller's own
-- row (require-admin, dashboard, grade gates, lesson-files route, play page,
-- labs lesson). The only writes are service-role — ensure-teacher-profile's
-- upsert and the admin enrollment actions — and the service role bypasses
-- RLS. So: RLS on, self-SELECT only, no write policies on purpose.
--
-- The user_analytics_summary view (security_invoker) is only ever queried
-- with the service role, so it is unaffected.

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'teachers'
  loop
    execute format('drop policy %I on public.teachers', p.policyname);
  end loop;
end $$;

alter table public.teachers enable row level security;

create policy "teachers can read their own row"
  on public.teachers for select
  using (auth.uid() = id);
