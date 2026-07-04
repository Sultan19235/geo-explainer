"use client";

// Student-side session state machine for the live quiz.
//
// Mirrors the behavior of the uploaded HTML student pages exactly:
//   join → waiting (poll /status every 2s) → active (heartbeat /submit every
//   15s; answers and focus changes submit immediately) → ended.
//
// Quiz-agnostic: each quiz passes a storage prefix plus its own "extra" state
// (e.g. picked sections, current question index) which is persisted alongside
// the base fields — spread at the TOP level of the saved JSON, so the old
// uploaded pages' localStorage schema (sections at top level) stays readable.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStatus, submitScore } from "./live-client";

const STATE_TTL = 3 * 60 * 60 * 1000; // saved progress expires after 3h
const HEARTBEAT_MS = 15_000;
const LOBBY_POLL_MS = 2_000;

export type QuizPhase = "checking" | "join" | "waiting" | "active" | "ended";

export type QuizStats = { correct: number; wrong: number; streak: number };

type SavedBase = {
  studentId: string;
  name: string;
  correct: number;
  wrong: number;
  streak: number;
  tabSwitches: number;
  awaySeconds: number;
  ts: number;
};

export type JoinError = "name" | "code" | "not_found" | "ended" | "network";

export type LiveSessionOptions<TExtra extends Record<string, unknown>> = {
  storagePrefix: string;
  // extra state for a fresh join
  defaultExtra: TExtra;
  // restore extra from a parsed saved object (the WHOLE top-level JSON);
  // return null to fall back to defaultExtra
  sanitizeExtra: (raw: Record<string, unknown>) => TExtra | null;
};

export function useLiveSession<TExtra extends Record<string, unknown>>(
  urlCode: string,
  options: LiveSessionOptions<TExtra>,
) {
  // Options are read once on mount; passing a fresh object literal per render
  // is fine.
  const opts = useRef(options).current;

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
  const [extra, setExtraState] = useState<TExtra>(opts.defaultExtra);

  // Mutable session identity + focus trackers. Refs, not state: sendScore is
  // called from timers and window listeners and must never see a stale value.
  const session = useRef({
    code: "",
    studentId: "",
    name: "",
    extra: opts.defaultExtra,
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
      const base: SavedBase = {
        studentId: s.studentId,
        name: s.name,
        correct: s.stats.correct,
        wrong: s.stats.wrong,
        streak: s.stats.streak,
        tabSwitches: s.tabSwitches,
        awaySeconds: away,
        ts: Date.now(),
      };
      localStorage.setItem(
        opts.storagePrefix + s.code,
        JSON.stringify({ ...s.extra, ...base }),
      );
    } catch {
      // storage full/blocked — reconnection just won't survive a reload
    }
  }, [opts]);

  // Merge-update the quiz-specific state and persist it immediately (called
  // on every answer / question move, so a reload resumes mid-quiz).
  const updateExtra = useCallback(
    (patch: Partial<TExtra>) => {
      const s = session.current;
      s.extra = { ...s.extra, ...patch };
      setExtraState(s.extra);
      saveState();
    },
    [saveState],
  );

  const clearSaved = useCallback(() => {
    const code = session.current.code;
    if (!code) return;
    try {
      localStorage.removeItem(opts.storagePrefix + code);
    } catch {}
  }, [opts]);

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

    let saved: (SavedBase & Record<string, unknown>) | null = null;
    try {
      const raw = localStorage.getItem(opts.storagePrefix + urlCode);
      if (raw) {
        const data = JSON.parse(raw) as SavedBase & Record<string, unknown>;
        if (Date.now() - data.ts <= STATE_TTL) saved = data;
        else localStorage.removeItem(opts.storagePrefix + urlCode);
      }
    } catch {}

    if (!saved) {
      setPhase("join");
      return;
    }
    const restored = saved;

    (async () => {
      try {
        const res = await fetchStatus(urlCode);
        if (res.status === "not_found" || res.status === "ended") {
          try {
            localStorage.removeItem(opts.storagePrefix + urlCode);
          } catch {}
          setPhase("join");
          return;
        }
        const s = session.current;
        s.code = urlCode;
        s.studentId = restored.studentId;
        s.name = restored.name;
        s.stats = {
          correct: restored.correct || 0,
          wrong: restored.wrong || 0,
          streak: restored.streak || 0,
        };
        s.tabSwitches = restored.tabSwitches || 0;
        s.awaySeconds = restored.awaySeconds || 0;
        s.extra = opts.sanitizeExtra(restored) ?? opts.defaultExtra;
        setExtraState(s.extra);
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
  }, [urlCode, startQuiz, opts]);

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

  // Reports the "finished" flag (student answered everything) — the teacher
  // console shows the card as done.
  const markFinished = useCallback(() => {
    saveState();
    void sendScore(true);
  }, [saveState, sendScore]);

  return {
    phase,
    join,
    joinError,
    joinPending,
    studentName,
    stats,
    timeLeft,
    recordAnswer,
    markFinished,
    extra,
    updateExtra,
    needsCodeInput: !urlCode,
  };
}
