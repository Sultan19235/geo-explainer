-- Promote the lesson-file pilot to the main site: a catalog topic
-- (grades navigation, access gate, quizzes FK) can point at a lesson topic
-- (bulk-uploaded .js content). A linked topic's learn page renders the
-- native lesson player instead of the legacy theory/problem HTML iframes.
--
-- The catalog topic stays the source of truth for grade, slug, publishing
-- and access (is_free_sample / granted_grades); lesson_topics.published
-- keeps governing only the /labs/lesson listing. One lesson topic can back
-- at most one catalog topic.

alter table public.topics
  add column if not exists lesson_topic_id uuid
    references public.lesson_topics (id) on delete set null;

create unique index if not exists topics_lesson_topic_id_key
  on public.topics (lesson_topic_id)
  where lesson_topic_id is not null;
