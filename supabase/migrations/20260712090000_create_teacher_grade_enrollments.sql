-- Sellable per-grade access: one row per (teacher, grade, period). An admin
-- "enrolls" a teacher by inserting rows from /admin/teachers/[id] via the
-- service role; nothing else writes here. A row grants grade_id while
-- now() is in [starts_at, expires_at) and revoked_at is null. Multiple rows
-- per (teacher, grade) are expected — every sale or extension adds a row, so
-- the table doubles as the audit trail of who was sold what and when.
--
-- Replaces the legacy teachers.granted_grades + teachers.access_expires_at
-- pair (one shared expiry for all grades — can't express "grade 7 until May,
-- grade 9 until December"). The legacy columns are backfilled below and then
-- left untouched: an old deploy keeps working off them (rollback safety),
-- while new code reads enrollments only.

create table if not exists public.teacher_grade_enrollments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  grade_id int not null check (grade_id between 1 and 12),
  starts_at timestamptz not null default now(),
  -- null = unlimited access.
  expires_at timestamptz check (expires_at is null or expires_at > starts_at),
  -- Soft revoke: the row stays for the audit trail but stops granting access.
  revoked_at timestamptz,
  -- Free-form origin note stamped by the admin ("3 сынып пакеті, Kaspi, 09.2026").
  package_label text check (package_label is null or char_length(package_label) <= 200),
  created_by uuid references public.teachers (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The access gates and the admin detail page both ask "this teacher's rows".
create index if not exists teacher_grade_enrollments_teacher_idx
  on public.teacher_grade_enrollments (teacher_id, grade_id);

alter table public.teacher_grade_enrollments enable row level security;

-- Teachers read their own enrollments: the grade gates and the dashboard load
-- them with the anon server client. All writes go through the service role
-- after requireAdmin() — no insert/update/delete policy exists on purpose.
drop policy if exists "enrollments are readable by their teacher" on public.teacher_grade_enrollments;
create policy "enrollments are readable by their teacher"
  on public.teacher_grade_enrollments for select
  using (auth.uid() = teacher_id);

-- Backfill from the legacy columns so nobody loses access when the app
-- switches to reading enrollments. Idempotent: only teachers with no
-- enrollment rows at all are backfilled, so re-running cannot duplicate.
-- to_jsonb() + the case guard tolerate granted_grades being jsonb, a native
-- int array, or null; non-numeric junk elements are skipped (they never
-- granted access under the legacy check either).
insert into public.teacher_grade_enrollments
  (teacher_id, grade_id, starts_at, expires_at, package_label)
select
  t.id,
  g.grade,
  -- Normally the account's created_at; clamped below the expiry so a stale
  -- "expired before signup" legacy date can't trip the period check and
  -- abort the whole migration.
  case
    when t.access_expires_at is not null
     and t.access_expires_at <= coalesce(t.created_at, now())
      then t.access_expires_at - interval '1 day'
    else coalesce(t.created_at, now())
  end,
  t.access_expires_at,
  'backfill: granted_grades'
from public.teachers t
cross join lateral (
  -- 1-2 digits only: also protects the ::int cast from absurd numeric junk
  -- ("99999999999" would overflow int4 and abort the migration).
  select case when v.value ~ '^[0-9]{1,2}$' then v.value::int end as grade
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(to_jsonb(t.granted_grades)) = 'array' then to_jsonb(t.granted_grades)
      else '[]'::jsonb
    end
  ) as v (value)
) g
where g.grade between 1 and 12
  and not exists (
    select 1 from public.teacher_grade_enrollments e where e.teacher_id = t.id
  );
