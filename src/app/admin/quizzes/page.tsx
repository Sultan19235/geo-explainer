import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  QuizzesListClient,
  type AdminQuizRow,
} from "./quizzes-list-client";

type RawQuizRow = {
  id: string;
  title_kz: string;
  title_ru: string | null;
  display_order: number;
  teacher_html_path: string | null;
  student_html_path: string | null;
  topic_id: string;
  topics: {
    id: string;
    name_kz: string;
    name_ru: string | null;
    display_order: number;
  } | null;
};

export default async function QuizzesAdminPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: quizzesRaw, error } = await admin
    .from("quizzes")
    .select(
      "id, title_kz, title_ru, display_order, teacher_html_path, student_html_path, topic_id, topics(id, name_kz, name_ru, display_order)",
    )
    .returns<RawQuizRow[]>();

  const sorted = (quizzesRaw ?? []).slice().sort((a, b) => {
    const ao = a.topics?.display_order ?? 0;
    const bo = b.topics?.display_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.display_order - b.display_order;
  });

  const quizzes: AdminQuizRow[] = sorted.map((row) => ({
    id: row.id,
    title_kz: row.title_kz,
    title_ru: row.title_ru,
    teacher_html_path: row.teacher_html_path,
    student_html_path: row.student_html_path,
    topic_name_kz: row.topics?.name_kz ?? null,
    topic_name_ru: row.topics?.name_ru ?? null,
  }));

  return (
    <QuizzesListClient
      quizzes={quizzes}
      errorMessage={error?.message ?? null}
    />
  );
}
