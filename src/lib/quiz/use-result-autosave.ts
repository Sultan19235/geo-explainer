"use client";

// Auto-saves the final scoreboard to the teacher's profile (quiz_results)
// the moment a room reaches the results phase — teachers close the projector
// tab fast, so waiting for a manual "save" button would lose most sessions.
// Saves once per room; "New session" re-arms it.

import { useCallback, useEffect, useRef, useState } from "react";
import { saveQuizResultAction } from "./quiz-result-actions";
import { isRoomResultSaved, markRoomResultSaved } from "./result-claims";
import type { ResultStudent } from "./quiz-result";
import type { LiveStudent, TeacherPhase } from "./use-teacher-session";

// off → this console can't save (signed-out / dev-preview); the results
// screen falls back to the old "write it down" note.
export type ResultSaveStatus = "idle" | "saving" | "saved" | "error" | "off";

// First-live-moment registry, keyed by room code. A console reload mid-quiz
// re-enters "live" through the recovery banner — capturing a fresh timestamp
// there would shrink the saved duration, so the FIRST claim per room wins.
// Same shape/TTL discipline as result-claims: rooms die server-side within
// hours, stale entries are pruned on write.
const START_KEY = "msq-room-started";
const START_TTL_MS = 6 * 60 * 60 * 1000;

function claimRoomStart(code: string): string {
  const nowIso = new Date().toISOString();
  try {
    const raw = window.localStorage.getItem(START_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const clean: Record<string, string> = {};
    for (const [key, iso] of Object.entries(map)) {
      if (
        typeof iso === "string" &&
        Date.now() - Date.parse(iso) < START_TTL_MS
      ) {
        clean[key] = iso;
      }
    }
    if (!clean[code]) clean[code] = nowIso;
    window.localStorage.setItem(START_KEY, JSON.stringify(clean));
    return clean[code];
  } catch {
    return nowIso; // storage blocked — worst case a resume-time duration
  }
}

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
  // When this room went live, so the saved result can carry a duration.
  // Captured on the setup→live transition, cleared when the room resets.
  const startedAtRef = useRef<string | null>(null);

  const save = useCallback(async () => {
    if (!code || students.size === 0) return;
    // This room can reach results in more than one place (a reload resumed
    // through the recovery banner, a second console tab) — if any instance
    // already saved it, don't insert a duplicate row.
    if (isRoomResultSaved(code)) {
      setStatus("saved");
      return;
    }
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
        startedAt: startedAtRef.current,
      });
      if (res.ok) {
        markRoomResultSaved(code);
        setStatus("saved");
      } else if (res.error === "unauthorized") setStatus("off");
      else setStatus("error");
    } catch {
      setStatus("error"); // network blip — the retry button re-runs this
    }
  }, [code, students, quizId, title, questionIds]);

  useEffect(() => {
    if (phase === "setup") {
      // reset() cleared the room — re-arm for the next session.
      savedCodeRef.current = null;
      startedAtRef.current = null;
      setStatus("idle");
      return;
    }
    if (phase === "live" && code && startedAtRef.current === null) {
      startedAtRef.current = claimRoomStart(code);
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
