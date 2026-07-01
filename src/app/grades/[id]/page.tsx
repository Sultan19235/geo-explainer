import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/analytics/track";
import {
  teacherHasGradeAccess,
  type TeacherAccessRow,
} from "@/lib/teacher-access";
import { GradeDetailClient } from "./grade-detail-client";
import type { GradeTopicListItem } from "./topic-list-client";

type TopicRow = {
  id: string;
  grade_id: number;
  slug: string;
  name_kz: string;
  name_ru: string | null;
  description_kz: string | null;
  description_ru: string | null;
  is_free_sample: boolean;
};

const VALID_GRADES = new Set([7, 8, 9, 10, 11]);

export default async function GradeTopicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ access?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const gradeId = Number(id);

  if (!VALID_GRADES.has(gradeId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: topics, error }, { data: teacher }] = await Promise.all([
    supabase
      .from("topics")
      .select(
        "id, grade_id, slug, name_kz, name_ru, description_kz, description_ru, is_free_sample",
      )
      .eq("grade_id", gradeId)
      .eq("is_published", true)
      .order("display_order", { ascending: true })
      .order("name_kz", { ascending: true })
      .returns<TopicRow[]>(),
    user
      ? supabase
          .from("teachers")
          .select("granted_grades, access_expires_at")
          .eq("id", user.id)
          .maybeSingle<TeacherAccessRow>()
      : Promise.resolve({ data: null }),
  ]);

  // Track that a signed-in teacher opened this grade. Runs after the response
  // is sent, so it never delays render.
  if (user) {
    after(() =>
      logActivity(user.id, "view_grade", {
        gradeId,
        path: `/grades/${gradeId}`,
      }),
    );
  }

  const hasGradeAccess = teacherHasGradeAccess(teacher, gradeId);
  const items: GradeTopicListItem[] = (topics ?? []).map((topic) => ({
    id: topic.id,
    gradeId,
    slug: topic.slug,
    name_kz: topic.name_kz,
    name_ru: topic.name_ru,
    description_kz: topic.description_kz,
    description_ru: topic.description_ru,
    is_free_sample: topic.is_free_sample,
    isAccessible: topic.is_free_sample || hasGradeAccess,
  }));

  return (
    <GradeDetailClient
      gradeId={gradeId}
      topics={items}
      errorMessage={error?.message ?? null}
      accessRequired={query.access === "required"}
    />
  );
}
