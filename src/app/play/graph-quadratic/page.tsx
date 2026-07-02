import { Suspense } from "react";
import type { Metadata } from "next";
import { QuizClient } from "./quiz-client";

// PUBLIC student quiz page — the native React replacement for the uploaded
// public/play/graph-quadratic/index.html. Students open it by QR
// (?code=XXXXXX&sec=sec1,sec2) with no account; there is intentionally no
// auth here. Speaks the same /status + /submit protocol to the live server.

export const metadata: Metadata = {
  title: "Квадраттық функция — тікелей тест",
  description: "Формула бойынша графикті табу. Бөлме кодымен қосылыңыз.",
  robots: { index: false },
};

export default function GraphQuadraticPlayPage() {
  // useSearchParams (the room code) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <QuizClient />
    </Suspense>
  );
}
