import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  teacherHasGradeAccess,
  type TeacherAccessRow,
} from "@/lib/teacher-access";
import { TopicListClient, type GradeTopicListItem } from "./topic-list-client";

type TopicRow = {
  id: string;
  grade_id: number;
  slug: string;
  name_kz: string;
  description_kz: string | null;
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
      .select("id, grade_id, slug, name_kz, description_kz, is_free_sample")
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

  const hasGradeAccess = teacherHasGradeAccess(teacher, gradeId);
  const items: GradeTopicListItem[] = (topics ?? []).map((topic) => ({
    id: topic.id,
    gradeId,
    slug: topic.slug,
    name_kz: topic.name_kz,
    description_kz: topic.description_kz,
    is_free_sample: topic.is_free_sample,
    isAccessible: topic.is_free_sample || hasGradeAccess,
  }));

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/grades"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Сыныптар
        </Link>

        <div className="mt-4 mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            {gradeId}-сынып
          </h1>
          <p className="mt-2 text-muted-foreground">
            Жарияланған тақырыптар тізімі.
          </p>
        </div>

        {query.access === "required" && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Кіру қажет — әкімшіге хабарласыңыз.
          </div>
        )}

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Тақырыптарды жүктеу қатесі: {error.message}
          </div>
        ) : (
          <TopicListClient topics={items} />
        )}
      </div>
    </main>
  );
}
