import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadQuizWithPack } from "@/lib/quiz/pack-server";
import { loc, type QuizPack } from "@/lib/quiz/pack";
import { PackQuizClient } from "./pack-quiz-client";

// PUBLIC student page of the quiz engine. Students open it by QR
// (?code=XXXXXX) with no account — intentionally no auth, same as the legacy
// /play/q/<id> pages. The quiz content comes from the pack (quiz/<id>/pack.json).
//
// ?preview=1 renders a browse-all-questions mode instead of the live flow —
// admins only (and /play/dev-preview in development).
//
// ?race=1 marks a race-mode room (docs/RACE_MODE_SPEC.md §5): the server
// grades every answer, so the pack this component sends to the browser is
// stripped of everything that gives the answer away.

type Params = { quizId: string };

// Everything a race student's browser must NOT receive during the question:
// the graded fields, plus the solution content (that arrives over the race
// SSE stream at the explain phase, never earlier). hints/theory/image/
// geogebra/options/text all stay — they're needed while the question is open.
const RACE_STRIP_KEYS = [
  "correct",
  "answer",
  "accept",
  "solution",
  "solutionSteps",
  "solutionGeogebra",
] as const;

// Deep-strips answers for ?race=1 links. Self-paced links never come through
// here — their pack must stay byte-for-byte what it always was (the client
// grades locally and reveals the solution after each answer).
//
// Residual risk (accepted for v1, documented in the spec): the raw pack JSON
// is still publicly fetchable from the quizzes-public bucket by a determined
// student; a private race bucket / signed URLs are future work.
function stripRaceAnswers(pack: QuizPack): QuizPack {
  return {
    ...pack,
    questions: pack.questions.map((q) => {
      const safe = { ...q };
      for (const key of RACE_STRIP_KEYS) delete safe[key];
      return safe;
    }),
  };
}

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

  // Race rooms only: answers never reach the phone (server-side grading).
  const pack = sp.race === "1" ? stripRaceAnswers(data.pack) : data.pack;

  return (
    // useSearchParams (the room code) requires a Suspense boundary.
    <Suspense fallback={null}>
      <PackQuizClient quizId={data.id} pack={pack} preview={preview} />
    </Suspense>
  );
}
