-- Read-only aggregate views powering the admin Users analytics page.
--
-- These are queried ONLY by the service-role admin client (the admin panel is
-- gated by requireAdmin). security_invoker = true makes the base tables' RLS
-- apply to normal roles — which have no policy, so anon/authenticated get
-- nothing — while the service role bypasses RLS and sees everything. Grants are
-- also revoked from anon/authenticated as defense in depth, and granted
-- explicitly to service_role.

-- One row per teacher with rolled-up session + activity metrics.
create or replace view public.user_analytics_summary
with (security_invoker = true) as
select
  t.id                                        as user_id,
  t.full_name,
  t.email,
  t.is_admin,
  coalesce(s.session_count, 0)                as session_count,
  s.last_seen_at,
  s.first_seen_at,
  coalesce(s.device_count, 0)                 as device_count,
  coalesce(s.ip_count, 0)                     as ip_count,
  coalesce(e.grades, '{}')                    as grades,
  coalesce(e.lesson_count, 0)                 as lesson_count,
  coalesce(e.quiz_count, 0)                   as quiz_count
from public.teachers t
left join (
  select
    user_id,
    count(*)                                                           as session_count,
    max(last_seen_at)                                                  as last_seen_at,
    min(started_at)                                                    as first_seen_at,
    count(distinct fingerprint) filter (where fingerprint is not null) as device_count,
    count(distinct ip)          filter (where ip is not null)          as ip_count
  from public.login_sessions
  group by user_id
) s on s.user_id = t.id
left join (
  select
    user_id,
    array_agg(distinct grade_id) filter (
      where type = 'view_grade' and grade_id is not null
    )                                                     as grades,
    count(distinct topic_id) filter (where type = 'view_lesson') as lesson_count,
    count(distinct quiz_id)  filter (where type = 'open_quiz')   as quiz_count
  from public.activity_events
  group by user_id
) e on e.user_id = t.id;

revoke all on public.user_analytics_summary from anon, authenticated;
grant select on public.user_analytics_summary to service_role;

-- Activity events with the referenced topic/quiz names joined in, for the
-- per-user activity timeline.
create or replace view public.user_activity_detail
with (security_invoker = true) as
select
  e.id,
  e.user_id,
  e.session_id,
  e.type,
  e.occurred_at,
  e.grade_id,
  e.topic_id,
  e.quiz_id,
  e.path,
  tp.name_kz as topic_name_kz,
  tp.name_ru as topic_name_ru,
  tp.slug    as topic_slug,
  q.title_kz as quiz_title_kz,
  q.title_ru as quiz_title_ru
from public.activity_events e
left join public.topics  tp on tp.id = e.topic_id
left join public.quizzes q  on q.id = e.quiz_id;

revoke all on public.user_activity_detail from anon, authenticated;
grant select on public.user_activity_detail to service_role;
