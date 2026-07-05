import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadQuizWithPack } from "@/lib/quiz/pack-server";
import { loc } from "@/lib/quiz/pack";
import { PackConsoleClient } from "./pack-console-client";

// Standalone teacher console (full screen, for the projector). The same
// console is embedded in the lesson page's quizzes tab; this page requires a
// signed-in user so the console isn't hosted anonymously. The deeper paid
// check lands with the /session token gate (QUIZ_TOKEN_SECRET).

export const metadata: Metadata = { robots: { index: false } };

export default async function PackHostPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;

  const data = await loadQuizWithPack(quizId);
  if (!data) notFound();

  if (data.id !== "dev-preview") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  return (
    <main className="min-h-dvh">
      <title>{`${loc(data.pack.title, "kz")} — консоль`}</title>
      <PackConsoleClient
        quizId={data.id}
        title={data.pack.title}
        questions={data.pack.questions}
        tagGroups={data.pack.tagGroups}
      />
    </main>
  );
}
