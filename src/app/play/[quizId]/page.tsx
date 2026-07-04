import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadQuizWithPack } from "@/lib/quiz/pack-server";
import { loc } from "@/lib/quiz/pack";
import { PackQuizClient } from "./pack-quiz-client";

// PUBLIC student page of the quiz engine. Students open it by QR
// (?code=XXXXXX) with no account — intentionally no auth, same as the legacy
// /play/q/<id> pages. The quiz content comes from the pack (quiz/<id>/pack.json).
//
// ?preview=1 renders a browse-all-questions mode instead of the live flow —
// admins only (and /play/dev-preview in development).

type Params = { quizId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { quizId } = await params;
  const data = await loadQuizWithPack(quizId);
  return {
    title: data ? `${loc(data.pack.title, "kz")} — тікелей тест` : "Тест",
    robots: { index: false },
  };
}

async function isAdminViewer(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: teacher } = await supabase
    .from("teachers")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(teacher?.is_admin);
}

export default async function PackPlayPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { quizId } = await params;
  const data = await loadQuizWithPack(quizId);
  if (!data) notFound();

  const sp = await searchParams;
  let preview = false;
  if (sp.preview !== undefined) {
    preview = data.id === "dev-preview" ? true : await isAdminViewer();
  }

  return (
    // useSearchParams (the room code) requires a Suspense boundary.
    <Suspense fallback={null}>
      <PackQuizClient quizId={data.id} pack={data.pack} preview={preview} />
    </Suspense>
  );
}
