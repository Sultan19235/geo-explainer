-- Grades 5 and 6 in the grade catalog table. The public catalog constant
-- (src/lib/grades.ts) has listed 5-11 since the design refresh, but the
-- grades table was seeded 7-11 in the geometry-only era, so /admin/topics
-- could not create grade 5/6 topics (grade dropdown reads this table and
-- topics.grade_id references it). Names are not stored here — the UI names
-- grades via i18n (grade_label).
insert into public.grades (id) values (5), (6)
on conflict (id) do nothing;
