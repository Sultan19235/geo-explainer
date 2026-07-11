"use client";

// Цилиндр demo topic: the native pack content rendered through the shared
// lesson shell. Uploaded topics use FileLessonClient with the same shell.

import { TheoryPlayer } from "@/components/lesson/theory-player";
import { ProblemPlayer } from "@/components/lesson/problem-player";
import { useT } from "@/lib/i18n/context";
import {
  packToPlayerProblem,
  packToPlayerTheory,
} from "@/lib/lesson/player-adapter";
import {
  cylinderProblems,
  cylinderTheory,
} from "@/lib/lesson/packs/cylinder";
import { LessonShell } from "./lesson-shell";

const TOPIC_ID = "cylinder";

export function LessonLabClient() {
  const { lang } = useT();
  const byId = new Map(cylinderProblems.map((pack) => [pack.id, pack]));

  return (
    <LessonShell
      topicId={TOPIC_ID}
      title="Цилиндр"
      subtitle={cylinderTheory.subtitle}
      bank={cylinderProblems}
      theorySlot={
        <TheoryPlayer theory={packToPlayerTheory(cylinderTheory)} lang={lang} />
      }
      renderProblem={(problem, { isFullscreen }) => {
        const pack = byId.get(problem.id);
        if (!pack) return null;
        return (
          <ProblemPlayer
            key={pack.id}
            problem={packToPlayerProblem(pack)}
            lang={lang}
            hotkeys={isFullscreen}
            className={isFullscreen ? "min-h-0 flex-1" : "h-[620px]"}
          />
        );
      }}
    />
  );
}
