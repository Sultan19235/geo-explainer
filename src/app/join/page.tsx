import { Suspense } from "react";
import type { Metadata } from "next";
import { JoinClient } from "./join-client";

// PUBLIC universal entrance — students type the room code from the board
// (matem.school → homepage box → here) instead of scanning a quiz-specific
// QR. The code is resolved against the live server, which answers with the
// room's student join path. No account, no auth — same policy as /play pages.

export const metadata: Metadata = {
  title: "Сабаққа қосылу — бөлме коды",
  description: "Мұғалім берген бөлме кодын енгізіп, сабаққа қосылыңыз.",
};

export default function JoinPage() {
  // useSearchParams (?code= deep links from QR) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <JoinClient />
    </Suspense>
  );
}
