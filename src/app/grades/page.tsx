import { createClient } from "@/lib/supabase/server";
import { GradesClient } from "./grades-client";

const GRADES = [7, 8, 9, 10, 11] as const;

type PublishedTopicGradeRow = {
  grade_id: number | null;
};

export default async function GradesCatalogPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("topics")
    .select("grade_id")
    .eq("is_published", true)
    .returns<PublishedTopicGradeRow[]>();

  const counts: Record<number, number> = {};
  for (const grade of GRADES) counts[grade] = 0;
  for (const row of data ?? []) {
    if (typeof row.grade_id === "number" && row.grade_id in counts) {
      counts[row.grade_id] += 1;
    }
  }

  return (
    <GradesClient counts={counts} errorMessage={error?.message ?? null} />
  );
}
