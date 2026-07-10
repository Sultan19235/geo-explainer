import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { teacherHasGradeAccess } from "@/lib/teacher-access";
import { endLoginSession } from "@/lib/analytics/track";
import type { SavedQuizSummary } from "@/lib/quiz/saved-quiz";
import {
  QUIZ_RESULTS_DASHBOARD_LIMIT,
  type QuizResultSummary,
  type ResultStudent,
} from "@/lib/quiz/quiz-result";
import { DashboardClient, type PurchasedGrade } from "./dashboard-client";

async function logout() {
  "use server";
  await endLoginSession("logout");
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

type SavedQuizRow = {
  id: string;
  name: string;
  quiz_id: string;
  question_ids: string[];
  order_mode: string;
  updated_at: string;
  quizzes: { title_kz: string; title_ru: string | null } | null;
};

type QuizResultRow = {
  id: string;
  quiz_id: string | null;
  title: string;
  room_code: string;
  question_ids: string[] | null;
  students: ResultStudent[];
  student_count: number;
  ended_at: string;
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

  // The teacher's saved quizzes, newest-edited first. RLS scopes the select
  // to this user; the quizzes join resolves the source pack's title.
  const { data: savedRows } = await supabase
    .from("saved_quizzes")
    .select(
      "id, name, quiz_id, question_ids, order_mode, updated_at, quizzes(title_kz, title_ru)",
    )
    .order("updated_at", { ascending: false })
    .returns<SavedQuizRow[]>();

  const savedQuizzes: SavedQuizSummary[] = (savedRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    quizId: row.quiz_id,
    quizTitleKz: row.quizzes?.title_kz ?? "",
    quizTitleRu: row.quizzes?.title_ru ?? null,
    questionCount: row.question_ids?.length ?? 0,
    orderMode: row.order_mode === "shuffle" ? "shuffle" : "custom",
    updatedAt: row.updated_at,
  }));

  // Auto-saved live-quiz outcomes, newest first (RLS scopes to this teacher).
  // Errors — e.g. the quiz_results migration not applied yet — degrade to an
  // empty history section instead of breaking the profile.
  const { data: resultRows } = await supabase
    .from("quiz_results")
    .select(
      "id, quiz_id, title, room_code, question_ids, students, student_count, ended_at",
    )
    .order("ended_at", { ascending: false })
    .limit(QUIZ_RESULTS_DASHBOARD_LIMIT)
    .returns<QuizResultRow[]>();

  const quizResults: QuizResultSummary[] = (resultRows ?? []).map((row) => ({
    id: row.id,
    quizId: row.quiz_id,
    title: row.title,
    roomCode: row.room_code,
    questionIds: row.question_ids,
    students: Array.isArray(row.students) ? row.students : [],
    studentCount: row.student_count,
    endedAt: row.ended_at,
  }));

  return (
    <DashboardClient
      email={teacher?.email ?? user.email ?? ""}
      fullName={teacher?.full_name ?? null}
      phone={teacher?.phone ?? null}
      createdAt={teacher?.created_at ?? null}
      isAdmin={!!teacher?.is_admin}
      purchasedGrades={purchasedGrades}
      savedQuizzes={savedQuizzes}
      quizResults={quizResults}
      accessExpiresAt={teacher?.access_expires_at ?? null}
      accessActive={accessActive}
      logoutAction={logout}
    />
  );
}
