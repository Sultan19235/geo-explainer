import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadQuizWithPack, UUID_RE } from "@/lib/quiz/pack-server";
import { loc } from "@/lib/quiz/pack";
import type { QuizOrderMode, SavedQuizRef } from "@/lib/quiz/saved-quiz";
import { PackConsoleClient } from "./pack-console-client";

// Standalone teacher console (full screen, for the projector). The same
// console is embedded in the lesson page's quizzes tab; this page requires a
// signed-in user so the console isn't hosted anonymously. The deeper paid
// check lands with the /session token gate (QUIZ_TOKEN_SECRET).

export const metadata: Metadata = { robots: { index: false } };

type SavedQuizRow = {
  id: string;
  name: string;
  quiz_id: string;
  question_ids: string[];
  order_mode: string;
};

export default async function PackHostPage({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { quizId } = await params;
  const { saved: savedParam } = await searchParams;

  const data = await loadQuizWithPack(quizId);
  if (!data) notFound();

  const isDevPreview = data.id === "dev-preview";
  let savedQuiz: SavedQuizRef | null = null;
  let initialSelectedIds: string[] | undefined;
  let initialOrderMode: QuizOrderMode | undefined;

  if (!isDevPreview) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // ?saved=<id> opens the console editing one of the teacher's saved
    // quizzes (dashboard "Open"). RLS scopes the select to the owner, so a
    // foreign or stale id loads nothing and the console starts fresh.
    if (savedParam && UUID_RE.test(savedParam)) {
      const { data: row } = await supabase
        .from("saved_quizzes")
        .select("id, name, quiz_id, question_ids, order_mode")
        .eq("id", savedParam)
        .maybeSingle<SavedQuizRow>();
      if (row && row.quiz_id === data.id) {
        // Drop ids that have left the pack since the quiz was saved. If none
        // survive, keep the saved identity but fall back to the whole pack.
        const packIds = new Set(data.pack.questions.map((q) => q.id));
        const kept = row.question_ids.filter((id) => packIds.has(id));
        savedQuiz = {
          id: row.id,
          name: row.name,
          missing: row.question_ids.length - kept.length,
        };
        if (kept.length > 0) initialSelectedIds = kept;
        initialOrderMode = row.order_mode === "shuffle" ? "shuffle" : "custom";
      }
    }
  }

  return (
    <main className="min-h-dvh">
      <title>{`${loc(data.pack.title, "kz")} — консоль`}</title>
      <PackConsoleClient
        quizId={data.id}
        title={data.pack.title}
        questions={data.pack.questions}
        tagGroups={data.pack.tagGroups}
        canSave={!isDevPreview}
        savedQuiz={savedQuiz}
        initialSelectedIds={initialSelectedIds}
        initialOrderMode={initialOrderMode}
      />
    </main>
  );
}
