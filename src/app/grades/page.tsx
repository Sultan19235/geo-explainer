import { createClient } from "@/lib/supabase/server";
import { GRADES } from "@/lib/grades";
import { GradesClient, type GradeCounts } from "./grades-client";

type PublishedTopicRow = {
  id: string;
  grade_id: number | null;
};

type QuizTopicRow = {
  topic_id: string | null;
};

export default async function GradesCatalogPage() {
  const supabase = await createClient();

  const [topicsRes, quizzesRes] = await Promise.all([
    supabase
      .from("topics")
      .select("id, grade_id")
      .eq("is_published", true)
      .returns<PublishedTopicRow[]>(),
    supabase.from("quizzes").select("topic_id").returns<QuizTopicRow[]>(),
  ]);

  const counts: Record<number, GradeCounts> = {};
  for (const grade of GRADES) counts[grade] = { topics: 0, quizzes: 0 };

  const topicGrade = new Map<string, number>();
  for (const row of topicsRes.data ?? []) {
    if (typeof row.grade_id === "number" && row.grade_id in counts) {
      counts[row.grade_id].topics += 1;
      topicGrade.set(row.id, row.grade_id);
    }
  }

  // Quizzes hang off topics, so only quizzes of published topics count.
  for (const row of quizzesRes.data ?? []) {
    const grade = row.topic_id ? topicGrade.get(row.topic_id) : undefined;
    if (grade !== undefined) counts[grade].quizzes += 1;
  }

  return (
    <GradesClient counts={counts} errorMessage={topicsRes.error?.message ?? null} />
  );
}
