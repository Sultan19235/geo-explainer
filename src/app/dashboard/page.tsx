import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { teacherHasGradeAccess } from "@/lib/teacher-access";
import { DashboardClient, type PurchasedGrade } from "./dashboard-client";

async function logout() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

type TeacherProfileRow = {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  granted_grades: number[] | null;
  access_expires_at: string | null;
  is_admin: boolean;
  created_at: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select(
      "full_name, phone, email, granted_grades, access_expires_at, is_admin, created_at",
    )
    .eq("id", user.id)
    .maybeSingle<TeacherProfileRow>();

  const grantedGrades = Array.isArray(teacher?.granted_grades)
    ? [...teacher!.granted_grades].map(Number).sort((a, b) => a - b)
    : [];

  // Count published topics per purchased grade for the cards.
  const topicCounts: Record<number, number> = {};
  if (grantedGrades.length > 0) {
    const { data: topics } = await supabase
      .from("topics")
      .select("grade_id")
      .eq("is_published", true)
      .in("grade_id", grantedGrades)
      .returns<{ grade_id: number | null }[]>();
    for (const grade of grantedGrades) topicCounts[grade] = 0;
    for (const row of topics ?? []) {
      if (typeof row.grade_id === "number" && row.grade_id in topicCounts) {
        topicCounts[row.grade_id] += 1;
      }
    }
  }

  const accessActive = teacherHasGradeAccess(
    teacher
      ? {
          granted_grades: grantedGrades,
          access_expires_at: teacher.access_expires_at,
        }
      : null,
    grantedGrades[0] ?? -1,
  );

  const purchasedGrades: PurchasedGrade[] = grantedGrades.map((gradeId) => ({
    gradeId,
    topicCount: topicCounts[gradeId] ?? 0,
  }));

  return (
    <DashboardClient
      email={teacher?.email ?? user.email ?? ""}
      fullName={teacher?.full_name ?? null}
      phone={teacher?.phone ?? null}
      createdAt={teacher?.created_at ?? null}
      isAdmin={!!teacher?.is_admin}
      purchasedGrades={purchasedGrades}
      accessExpiresAt={teacher?.access_expires_at ?? null}
      accessActive={accessActive}
      logoutAction={logout}
    />
  );
}
