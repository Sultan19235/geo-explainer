-- Product decision (2026-07-02): class history is not saved — live sessions
-- are ephemeral and nothing persists after a quiz ends. This reverts
-- 20260702080000_quiz_session_results.sql; server v3 no longer writes here.
drop table if exists public.quiz_session_results;
