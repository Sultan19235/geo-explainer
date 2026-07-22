-- Grades 5 and 6 in the grade catalog table. The public catalog constant
-- (src/lib/grades.ts) has listed 5-11 since the design refresh, but the
-- grades table was seeded 7-11 in the geometry-only era, so /admin/topics
-- could not create grade 5/6 topics (grade dropdown reads this table and
-- topics.grade_id references it). name_kz is NOT NULL in the table; the UI
-- ignores stored names and labels grades via i18n (grade_label).
insert into public.grades (id, name_kz, name_ru) values
  (5, '5-сынып', '5 класс'),
  (6, '6-сынып', '6 класс')
on conflict (id) do nothing;
