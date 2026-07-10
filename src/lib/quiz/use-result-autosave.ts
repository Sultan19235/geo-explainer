"use client";

// Auto-saves the final scoreboard to the teacher's profile (quiz_results)
// the moment a room reaches the results phase — teachers close the projector
// tab fast, so waiting for a manual "save" button would lose most sessions.
// Saves once per room; "New session" re-arms it.

import { useCallback, useEffect, useRef, useState } from "react";
import { saveQuizResultAction } from "./quiz-result-actions";
import type { ResultStudent } from "./quiz-result";
import type { LiveStudent, TeacherPhase } from "./use-teacher-session";

// off → this console can't save (signed-out / dev-preview); the results
// screen falls back to the old "write it down" note.
export type ResultSaveStatus = "idle" | "saving" | "saved" | "error" | "off";

export function useResultAutosave({
  phase,
  code,
  students,
  enabled,
  quizId,
  title,
  questionIds,
}: {
  phase: TeacherPhase;
  code: string | null;
  students: Map<string, LiveStudent>;
  enabled: boolean;
  quizId: string | null;
  title: string;
  questionIds: string[] | null;
}) {
  const [status, setStatus] = useState<ResultSaveStatus>("idle");
  const savedCodeRef = useRef<string | null>(null);

  const save = useCallback(async () => {
    if (!code || students.size === 0) return;
    setStatus("saving");
    const list: ResultStudent[] = Array.from(students.values())
      .sort((a, b) => {
        const pA = a.total > 0 ? a.score / a.total : 0;
        const pB = b.total > 0 ? b.score / b.total : 0;
        return pB !== pA ? pB - pA : b.score - a.score;
      })
      .map((s) => ({
        name: s.name,
        score: s.score,
        total: s.total,
        finished: s.finished,
        tabSwitches: s.tabSwitches,
        awaySeconds: s.awaySeconds,
        answers: s.answers,
      }));
    try {
      const res = await saveQuizResultAction({
        quizId,
        title,
        roomCode: code,
        questionIds,
        students: list,
      });
      if (res.ok) setStatus("saved");
      else if (res.error === "unauthorized") setStatus("off");
      else setStatus("error");
    } catch {
      setStatus("error"); // network blip — the retry button re-runs this
    }
  }, [code, students, quizId, title, questionIds]);

  useEffect(() => {
    if (phase === "setup") {
      // reset() cleared the room — re-arm for the next session.
      savedCodeRef.current = null;
      setStatus("idle");
      return;
    }
    if (phase !== "results") return;
    if (!enabled) {
      setStatus("off");
      return;
    }
    if (!code || students.size === 0) return;
    if (savedCodeRef.current === code) return; // late SSE updates re-fire this effect
    savedCodeRef.current = code;
    void save();
  }, [phase, enabled, code, students, save]);

  return { status, retry: save };
}
