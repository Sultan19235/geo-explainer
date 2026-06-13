-- Add a pointer from a topic to its teacher-facing quiz HTML file.
--
-- The file itself lives in the private `lessons` Storage bucket (same pattern
-- as topics.theory_html_path) and is served later through a gated route.
-- This is a SEPARATE column from theory_html_path on purpose — a topic's
-- theory page and its live-quiz teacher console are distinct assets.
--
-- Nullable: a topic may have no quiz yet. Student quiz files are NOT recorded
-- here — their URL is derived by convention from the topic slug (/play/<slug>/).

alter table public.topics
  add column if not exists quiz_teacher_html_path text;
