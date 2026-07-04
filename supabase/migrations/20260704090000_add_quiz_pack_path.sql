-- Quiz engine v1: a quiz can now be a JSON "pack" (questions as data rendered
-- by the native React engine) instead of uploaded teacher/student HTML files.
-- pack_path points at quiz/<id>/pack.json in the quizzes-public bucket.
alter table public.quizzes
  add column if not exists pack_path text;
