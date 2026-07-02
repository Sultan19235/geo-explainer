"use client";

// Teacher-side session state machine: create room → lobby (students join) →
// live (SSE updates stream in) → results. Mirrors the uploaded teacher.html
// console: same endpoints, same 3s SSE retry, same local 45-min countdown
// with the server's timeLeft as the source of truth on (re)connect.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession,
  endSession,
  QUIZ_BACKEND,
  startSession,
  type LiveEvent,
  type StudentRecord,
} from "./live-client";

const SESSION_SECONDS = 45 * 60;
const SSE_RETRY_MS = 3_000;
const FLASH_MS = 800;

export type TeacherPhase = "setup" | "lobby" | "live" | "results";

// flash marks a card for a moment when a new answer arrives.
export type LiveStudent = StudentRecord & { flash: "ok" | "err" | null };

export function useTeacherSession() {
  const [phase, setPhase] = useState<TeacherPhase>("setup");
  const [code, setCode] = useState<string | null>(null);
  const [students, setStudents] = useState<Map<string, LiveStudent>>(
    () => new Map(),
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<
    "unauthorized" | "network" | null
  >(null);
  const [timeLeft, setTimeLeft] = useState(SESSION_SECONDS);

  const phaseRef = useRef<TeacherPhase>("setup");
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const setPhaseBoth = (p: TeacherPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const closeStream = () => {
    sourceRef.current?.close();
    sourceRef.current = null;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };

  const showResults = useCallback(() => {
    if (phaseRef.current === "results") return;
    setPhaseBoth("results");
    closeStream();
  }, []);

  const applyEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type === "snapshot") {
        setStudents((prev) => {
          const next = new Map<string, LiveStudent>();
          for (const s of event.students) {
            next.set(s.studentId, {
              ...s,
              flash: prev.get(s.studentId)?.flash ?? null,
            });
          }
          return next;
        });
        setTimeLeft(event.timeLeft);
        // Another tab (or a reconnect after refresh) may already be live.
        if (event.status === "active" && phaseRef.current === "lobby") {
          setPhaseBoth("live");
        } else if (event.status === "ended") {
          showResults();
        }
        return;
      }

      if (event.type === "update") {
        setStudents((prev) => {
          const old = prev.get(event.studentId);
          // Flash only when a NEW answer landed (total changed).
          const flash: LiveStudent["flash"] =
            old && event.total !== old.total
              ? event.score > old.score
                ? "ok"
                : "err"
              : (old?.flash ?? null);
          const next = new Map(prev);
          const { type: _type, ...record } = event;
          next.set(event.studentId, { ...record, flash });

          if (flash && (!old || flash !== old.flash || event.total !== old.total)) {
            const existing = flashTimers.current.get(event.studentId);
            if (existing) clearTimeout(existing);
            flashTimers.current.set(
              event.studentId,
              setTimeout(() => {
                flashTimers.current.delete(event.studentId);
                setStudents((current) => {
                  const target = current.get(event.studentId);
                  if (!target?.flash) return current;
                  const cleared = new Map(current);
                  cleared.set(event.studentId, { ...target, flash: null });
                  return cleared;
                });
              }, FLASH_MS),
            );
          }
          return next;
        });
        return;
      }

      if (event.type === "started") {
        setTimeLeft(SESSION_SECONDS);
        if (phaseRef.current === "lobby") setPhaseBoth("live");
        return;
      }

      if (event.type === "ended") {
        showResults();
      }
    },
    [showResults],
  );

  const connectStream = useCallback(
    (roomCode: string) => {
      closeStream();
      const source = new EventSource(
        `${QUIZ_BACKEND}/live?code=${encodeURIComponent(roomCode)}`,
      );
      sourceRef.current = source;
      source.onmessage = (e) => {
        try {
          applyEvent(JSON.parse(e.data) as LiveEvent);
        } catch {
          // malformed frame — ignore
        }
      };
      source.onerror = () => {
        source.close();
        if (sourceRef.current !== source) return;
        if (phaseRef.current === "lobby" || phaseRef.current === "live") {
          retryRef.current = setTimeout(
            () => connectStream(roomCode),
            SSE_RETRY_MS,
          );
        }
      };
    },
    [applyEvent],
  );

  const createRoom = useCallback(
    async (title: string) => {
      setCreating(true);
      setCreateError(null);
      const res = await createSession(title);
      setCreating(false);
      if ("error" in res) {
        setCreateError(res.error);
        return;
      }
      setCode(res.code);
      setStudents(new Map());
      setTimeLeft(SESSION_SECONDS);
      setPhaseBoth("lobby");
      connectStream(res.code);
    },
    [connectStream],
  );

  const start = useCallback(async () => {
    if (!code) return;
    await startSession(code);
    setTimeLeft(SESSION_SECONDS);
    setPhaseBoth("live");
  }, [code]);

  const end = useCallback(async () => {
    if (code) {
      try {
        await endSession(code);
      } catch {
        // results still shown locally; the room times out server-side
      }
    }
    showResults();
  }, [code, showResults]);

  const reset = useCallback(() => {
    closeStream();
    for (const t of flashTimers.current.values()) clearTimeout(t);
    flashTimers.current.clear();
    setStudents(new Map());
    setCode(null);
    setCreateError(null);
    setTimeLeft(SESSION_SECONDS);
    setPhaseBoth("setup");
  }, []);

  // Local countdown while live; the server auto-ends too, but flipping locally
  // keeps the projected screen honest if the network drops at 0:00.
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          showResults();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, showResults]);

  // Cleanup on unmount.
  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      closeStream();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return {
    phase,
    code,
    students,
    creating,
    createError,
    timeLeft,
    createRoom,
    start,
    end,
    reset,
  };
}
