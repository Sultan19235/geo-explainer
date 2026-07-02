"use client";

// Student-side session state machine for the live quiz.
//
// Mirrors the behavior of the uploaded HTML student page exactly:
//   join → waiting (poll /status every 2s) → active (heartbeat /submit every
//   15s; answers and focus changes submit immediately) → ended.
// Reconnection uses the same localStorage key and schema as the old page, so
// a student mid-session keeps their score across the old→new page swap.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStatus, submitScore } from "./live-client";
import { isSectionId, SECTION_IDS, type SectionId } from "./quadratic";

const STORAGE_KEY_PREFIX = "ms_graph_";
const STATE_TTL = 3 * 60 * 60 * 1000; // saved progress expires after 3h
const HEARTBEAT_MS = 15_000;
const LOBBY_POLL_MS = 2_000;

export type QuizPhase = "checking" | "join" | "waiting" | "active" | "ended";

export type QuizStats = { correct: number; wrong: number; streak: number };

type SavedState = {
  studentId: string;
  name: string;
  correct: number;
  wrong: number;
  streak: number;
  tabSwitches: number;
  awaySeconds: number;
  sections: SectionId[];
  ts: number;
};

export type JoinError = "name" | "code" | "not_found" | "ended" | "network";

export function useLiveSession(urlCode: string, urlSections: SectionId[]) {
  const [phase, setPhase] = useState<QuizPhase>(
    urlCode ? "checking" : "join",
  );
  const [joinError, setJoinError] = useState<JoinError | null>(null);
  const [joinPending, setJoinPending] = useState(false);
  const [stats, setStats] = useState<QuizStats>({
    correct: 0,
    wrong: 0,
    streak: 0,
  });
  const [studentName, setStudentName] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Mutable session identity + focus trackers. Refs, not state: sendScore is
  // called from timers and window listeners and must never see a stale value.
  const session = useRef({
    code: "",
    studentId: "",
    name: "",
    sections: urlSections,
    stats: { correct: 0, wrong: 0, streak: 0 },
    focused: true,
    tabSwitches: 0,
    awaySeconds: 0,
    awayStart: null as number | null,
    phase: "join" as QuizPhase,
  });

  const saveState = useCallback(() => {
    const s = session.current;
    if (!s.code) return;
    let away = s.awaySeconds;
    if (s.awayStart) away += Math.round((Date.now() - s.awayStart) / 1000);
    try {
      localStorage.setItem(
        STORAGE_KEY_PREFIX + s.code,
        JSON.stringify({
          studentId: s.studentId,
          name: s.name,
          correct: s.stats.correct,
          wrong: s.stats.wrong,
          streak: s.stats.streak,
          tabSwitches: s.tabSwitches,
          awaySeconds: away,
          sections: s.sections,
          ts: Date.now(),
        } satisfies SavedState),
      );
    } catch {
      // storage full/blocked — reconnection just won't survive a reload
    }
  }, []);

  const clearSaved = useCallback(() => {
    const code = session.current.code;
    if (!code) return;
    try {
      localStorage.removeItem(STORAGE_KEY_PREFIX + code);
    } catch {}
  }, []);

  const endQuiz = useCallback(() => {
    if (session.current.phase === "ended") return;
    session.current.phase = "ended";
    setPhase("ended");
    clearSaved();
  }, [clearSaved]);

  const sendScore = useCallback(
    async (finished = false) => {
      const s = session.current;
      if (!s.code || !s.name) return;
      let away = s.awaySeconds;
      if (s.awayStart) away += Math.round((Date.now() - s.awayStart) / 1000);
      try {
        const res = await submitScore({
          code: s.code,
          studentId: s.studentId,
          name: s.name,
          score: s.stats.correct,
          total: s.stats.correct + s.stats.wrong,
          finished,
          focused: s.focused,
          tabSwitches: s.tabSwitches,
          awaySeconds: away,
        });
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.status === "ended" || res.status === "not_found") endQuiz();
      } catch {
        // offline blip — the next heartbeat retries
      }
    },
    [endQuiz],
  );

  const startQuiz = useCallback(() => {
    if (session.current.phase === "active") return;
    session.current.phase = "active";
    setPhase("active");
    void sendScore();
  }, [sendScore]);

  // ── Reconnect on load (same flow as the old page) ────────────────────────
  const reconnectTried = useRef(false);
  useEffect(() => {
    if (reconnectTried.current) return;
    reconnectTried.current = true;
    if (!urlCode) return;

    let saved: SavedState | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + urlCode);
      if (raw) {
        const data = JSON.parse(raw) as SavedState;
        if (Date.now() - data.ts <= STATE_TTL) saved = data;
        else localStorage.removeItem(STORAGE_KEY_PREFIX + urlCode);
      }
    } catch {}

    if (!saved) {
      setPhase("join");
      return;
    }

    (async () => {
      try {
        const res = await fetchStatus(urlCode);
        if (res.status === "not_found" || res.status === "ended") {
          try {
            localStorage.removeItem(STORAGE_KEY_PREFIX + urlCode);
          } catch {}
          setPhase("join");
          return;
        }
        const s = session.current;
        s.code = urlCode;
        s.studentId = saved.studentId;
        s.name = saved.name;
        s.stats = {
          correct: saved.correct || 0,
          wrong: saved.wrong || 0,
          streak: saved.streak || 0,
        };
        s.tabSwitches = saved.tabSwitches || 0;
        s.awaySeconds = saved.awaySeconds || 0;
        if (saved.sections?.length) {
          s.sections = saved.sections.filter(isSectionId);
          if (!s.sections.length) s.sections = [...SECTION_IDS];
        }
        setStats(s.stats);
        setStudentName(s.name);
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.status === "active") startQuiz();
        else {
          s.phase = "waiting";
          setPhase("waiting");
        }
      } catch {
        setPhase("join"); // server unreachable — fresh join screen
      }
    })();
  }, [urlCode, startQuiz]);

  // ── Join ─────────────────────────────────────────────────────────────────
  const join = useCallback(
    async (name: string, codeInput: string) => {
      const trimmed = name.trim();
      const code = (urlCode || codeInput.trim()).toUpperCase();
      if (!trimmed) {
        setJoinError("name");
        return;
      }
      if (code.length < 4) {
        setJoinError("code");
        return;
      }
      setJoinError(null);
      setJoinPending(true);

      const s = session.current;
      s.code = code;
      s.name = trimmed;
      s.studentId = "stu_" + Math.random().toString(36).slice(2, 11);
      s.stats = { correct: 0, wrong: 0, streak: 0 };
      setStats(s.stats);
      setStudentName(trimmed);

      try {
        const res = await fetchStatus(code);
        if (res.status === "not_found") {
          setJoinError("not_found");
          return;
        }
        if (res.status === "ended") {
          setJoinError("ended");
          return;
        }
        await sendScore(); // registers the student on the teacher's screen
        saveState();
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.status === "active") startQuiz();
        else {
          s.phase = "waiting";
          setPhase("waiting");
        }
      } catch {
        setJoinError("network");
      } finally {
        setJoinPending(false);
      }
    },
    [urlCode, sendScore, saveState, startQuiz],
  );

  // ── Focus tracking (visibility + window focus) ───────────────────────────
  useEffect(() => {
    const markAway = () => {
      const s = session.current;
      if (!s.focused || s.phase === "ended") return;
      s.focused = false;
      s.tabSwitches++;
      s.awayStart = Date.now();
      saveState(); // persist before a possible tab close
      void sendScore();
    };
    const markBack = () => {
      const s = session.current;
      if (s.focused) return;
      s.focused = true;
      if (s.awayStart) {
        s.awaySeconds += Math.round((Date.now() - s.awayStart) / 1000);
        s.awayStart = null;
      }
      void sendScore();
    };
    const onVisibility = () => {
      if (document.hidden) markAway();
      else markBack();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", markAway);
    window.addEventListener("focus", markBack);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", markAway);
      window.removeEventListener("focus", markBack);
    };
  }, [saveState, sendScore]);

  // ── Lobby: poll /status every 2s until the teacher starts ────────────────
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(async () => {
      try {
        const res = await fetchStatus(session.current.code);
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.status === "active") startQuiz();
        else if (res.status === "ended" || res.status === "not_found") {
          endQuiz();
        }
      } catch {}
    }, LOBBY_POLL_MS);
    return () => clearInterval(id);
  }, [phase, startQuiz, endQuiz]);

  // ── Active: presence heartbeat + local countdown ─────────────────────────
  useEffect(() => {
    if (phase !== "active") return;
    const beat = setInterval(() => void sendScore(), HEARTBEAT_MS);
    const tick = setInterval(
      () => setTimeLeft((t) => (t === null ? t : Math.max(0, t - 1))),
      1000,
    );
    return () => {
      clearInterval(beat);
      clearInterval(tick);
    };
  }, [phase, sendScore]);

  // ── Answers ──────────────────────────────────────────────────────────────
  const recordAnswer = useCallback(
    (isCorrect: boolean) => {
      const s = session.current;
      s.stats = isCorrect
        ? {
            correct: s.stats.correct + 1,
            wrong: s.stats.wrong,
            streak: s.stats.streak + 1,
          }
        : {
            correct: s.stats.correct,
            wrong: s.stats.wrong + 1,
            streak: 0,
          };
      setStats(s.stats);
      saveState();
      void sendScore();
    },
    [saveState, sendScore],
  );

  return {
    phase,
    join,
    joinError,
    joinPending,
    studentName,
    stats,
    timeLeft,
    recordAnswer,
    sections: session.current.sections,
    needsCodeInput: !urlCode,
  };
}
