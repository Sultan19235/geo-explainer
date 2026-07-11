-- Adds quiz_results.started_at for sessions saved after the console started
-- recording the room's live-start moment (admin analytics shows duration).
--
-- The base 20260710120000 migration now also creates this column, so this is
-- a no-op on fresh databases — it only matters where quiz_results was already
-- created from the earlier version of that file.

alter table public.quiz_results
  add column if not exists started_at timestamptz;
