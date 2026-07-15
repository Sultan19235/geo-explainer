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
import {
  fetchStatus,
  sendLeaveBeacon,
  submitScore,
  type AnswerMap,
  type QuizFeatures,
} from "./live-client";

const STATE_TTL = 3 * 60 * 60 * 1000; // saved progress expires after 3h
const HEARTBEAT_MS = 15_000;
const LOBBY_POLL_MS = 2_000;

// "kicked": the teacher removed this student; a deliberate re-join is allowed.
export type QuizPhase =
  | "checking"
  | "join"
  | "waiting"
  | "active"
  | "ended"
  | "kicked";

export type QuizStats = { correct: number; wrong: number; streak: number };

const MAX_ANSWER_ENTRIES = 500; // mirrors the server's cap

type SavedBase = {
  studentId: string;
  name: string;
  correct: number;
  wrong: number;
  streak: number;
  tabSwitches: number;
  awaySeconds: number;
  // The page was already marked off-screen when this was saved (markAway ran
  // and counted the exit) — the restore must not count it a second time.
  wasAway?: boolean;
  answers?: AnswerMap;
  finished?: boolean;
  ts: number;
};

// Restore only well-formed entries — old saved states predate the field.
function sanitizeAnswers(raw: unknown): AnswerMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: AnswerMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length === 0 || key.length > 64) continue;
    if (value === 0 || value === 1) out[key] = value;
  }
  return out;
}

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
  // The room's student-aid switches as the server reports them (v7); null
  // until a /status or /submit response carries them (or on old servers,
  // forever — the player falls back to the join link's `off=` param then).
  const [features, setFeatures] = useState<QuizFeatures | null>(null);
  const [extra, setExtraState] = useState<TExtra>(opts.defaultExtra);

  // Mutable session identity + focus trackers. Refs, not state: sendScore is
  // called from timers and window listeners and must never see a stale value.
  const session = useRef({
    code: "",
    studentId: "",
    name: "",
    extra: opts.defaultExtra,
    stats: { correct: 0, wrong: 0, streak: 0 },
    answers: {} as AnswerMap,
    // Sticky "answered everything" flag: every heartbeat re-reports it, so a
    // 15s beat can't silently un-finish the student on the teacher's board.
    finished: false,
    focused: true,
    tabSwitches: 0,
    awaySeconds: 0,
    awayStart: null as number | null,
    // The parting /leave beacon went out (pagehide or unmount). markAway must
    // dispatch nothing after that: its keepalive report would outlive the
    // page, land AFTER the beacon, and resurrect the student to "off-screen"
    // on the teacher's board. Cleared when the page proves alive again.
    leaving: false,
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
        wasAway: !s.focused,
        answers: s.answers,
        finished: s.finished,
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

  // The teacher removed this student. Saved progress is cleared (a re-join is
  // a fresh run) but the name is kept for the pre-filled join form.
  const kickedOut = useCallback(() => {
    const s = session.current;
    if (s.phase === "kicked" || s.phase === "ended") return;
    clearSaved();
    s.phase = "kicked";
    setPhase("kicked");
  }, [clearSaved]);

  const sendScore = useCallback(
    async (opts?: { joining?: boolean; keepalive?: boolean }) => {
      const s = session.current;
      if (!s.code || !s.name) return;
      let away = s.awaySeconds;
      if (s.awayStart) away += Math.round((Date.now() - s.awayStart) / 1000);
      try {
        const res = await submitScore(
          {
            code: s.code,
            studentId: s.studentId,
            name: s.name,
            score: s.stats.correct,
            total: s.stats.correct + s.stats.wrong,
            finished: s.finished,
            focused: s.focused,
            tabSwitches: s.tabSwitches,
            awaySeconds: away,
            answers: Object.keys(s.answers).length > 0 ? s.answers : undefined,
            joining: opts?.joining || undefined,
          },
          { keepalive: opts?.keepalive },
        );
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.features) setFeatures(res.features);
        if (res.kicked) kickedOut();
        else if (res.status === "ended" || res.status === "not_found") endQuiz();
      } catch {
        // offline blip — the next heartbeat retries
      }
    },
    [endQuiz, kickedOut],
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
        // The page wasn't there to measure the time between leaving (last
        // save) and this return — during a running quiz that gap IS away
        // time, so add it. The exit itself only counts if markAway hadn't
        // already counted it before the save (wasAway). The threshold spares
        // honest quick reloads; lobby gaps don't count (quiz hadn't started).
        if (res.status === "active") {
          const goneSeconds = Math.round((Date.now() - restored.ts) / 1000);
          if (goneSeconds >= 5) {
            s.awaySeconds += goneSeconds;
            if (!restored.wasAway) s.tabSwitches += 1;
          }
        }
        s.answers = sanitizeAnswers(restored.answers);
        s.finished = restored.finished === true;
        s.extra = opts.sanitizeExtra(restored) ?? opts.defaultExtra;
        setExtraState(s.extra);
        setStats(s.stats);
        setStudentName(s.name);
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.features) setFeatures(res.features);
        if (res.status === "active") startQuiz();
        else {
          s.phase = "waiting";
          setPhase("waiting");
          // Re-register presence: the pagehide beacon of the load we're
          // recovering from marked this student as "left" on the teacher's
          // board — one submit flips them back. (startQuiz sends its own.)
          void sendScore();
        }
      } catch {
        setPhase("join"); // server unreachable — fresh join screen
      }
    })();
  }, [urlCode, startQuiz, sendScore, opts]);

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
      s.answers = {};
      s.finished = false;
      s.leaving = false;
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
        // Registers the student on the teacher's screen. joining marks this
        // as deliberate, so it also clears a previous kick verdict.
        await sendScore({ joining: true });
        saveState();
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.features) setFeatures(res.features);
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
      if (!s.focused || s.phase === "ended" || s.leaving) return;
      s.focused = false;
      s.tabSwitches++;
      s.awayStart = Date.now();
      saveState(); // persist before a possible tab close
      // keepalive: backgrounding (phone back button out of a QR-opened tab)
      // freezes the page right after this handler — a plain fetch would die
      // mid-flight and the teacher's board would keep showing "on screen".
      void sendScore({ keepalive: true });
    };
    const markBack = () => {
      const s = session.current;
      s.leaving = false; // page proved alive (bfcache return)
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
        const res = await fetchStatus(
          session.current.code,
          session.current.studentId,
        );
        if (typeof res.timeLeft === "number") setTimeLeft(res.timeLeft);
        if (res.features) setFeatures(res.features);
        if (res.kicked) kickedOut();
        else if (res.status === "active") startQuiz();
        else if (res.status === "ended" || res.status === "not_found") {
          endQuiz();
        }
      } catch {}
    }, LOBBY_POLL_MS);
    return () => clearInterval(id);
  }, [phase, startQuiz, endQuiz, kickedOut]);

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
  // questionId (when the quiz has stable ids) files the outcome into the
  // per-question map that rides every /submit, so the teacher's console can
  // save "who got which question" at the end.
  const recordAnswer = useCallback(
    (isCorrect: boolean, questionId?: string) => {
      const s = session.current;
      if (
        questionId &&
        (questionId in s.answers ||
          Object.keys(s.answers).length < MAX_ANSWER_ENTRIES)
      ) {
        s.answers = { ...s.answers, [questionId]: isCorrect ? 1 : 0 };
      }
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
  // console shows the card as done. Sticky in the session ref, so every later
  // heartbeat keeps re-reporting it.
  const markFinished = useCallback(() => {
    session.current.finished = true;
    saveState();
    void sendScore();
  }, [saveState, sendScore]);

  // After a kick: back to the join form (name pre-filled by the quiz UI).
  // join() mints a fresh studentId and sends joining:true, which lifts the
  // kick verdict server-side.
  const rejoin = useCallback(() => {
    const s = session.current;
    if (s.phase !== "kicked") return;
    s.phase = "join";
    setJoinError(null);
    setPhase("join");
  }, []);

  // ── Leaving: tell the teacher's board instead of silently freezing ───────
  // One parting shot for every way the page can go away. Sets `leaving` FIRST
  // so markAway (visibilitychange fires after pagehide during an unload)
  // dispatches nothing more — its keepalive report would land after this
  // beacon and resurrect the student. The away-accounting normally done by
  // markAway happens here instead, so a bfcache return (markBack) and the
  // saved wasAway flag still add up to exactly one counted exit.
  const performLeave = useCallback(() => {
    const s = session.current;
    if (!s.code || !s.studentId || s.leaving) return;
    if (s.phase !== "active" && s.phase !== "waiting") return;
    s.leaving = true;
    if (s.focused) {
      s.focused = false;
      s.tabSwitches++;
      s.awayStart = Date.now();
    }
    saveState(); // a reload/return resumes exactly here
    sendLeaveBeacon(s.code, s.studentId);
  }, [saveState]);

  // pagehide covers browser-back, tab close and reloads; the beacon flips the
  // card to "left" instantly (the server's 45s sweep is the fallback). On a
  // bfcache restore (back INTO the page) one heartbeat flips it back.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      const s = session.current;
      if (!e.persisted || !s.code) return;
      if (s.phase !== "active" && s.phase !== "waiting") return;
      s.leaving = false; // page proved alive again
      void sendScore();
    };
    window.addEventListener("pagehide", performLeave);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", performLeave);
      window.removeEventListener("pageshow", onShow);
    };
  }, [performLeave, sendScore]);

  // Browser-back on the phone can be a soft Next.js route change — the
  // document never unloads, pagehide never fires, and the quiz page just
  // unmounts. Send the same parting shot from the unmount cleanup so the
  // teacher's board flips to "left" instantly on that path too. The ref keeps
  // this effect mount-once (no re-runs re-arming the cleanup), and the phase
  // guard makes the StrictMode dev double-mount a no-op (code is empty then).
  const performLeaveRef = useRef(performLeave);
  performLeaveRef.current = performLeave;
  useEffect(() => {
    return () => performLeaveRef.current();
  }, []);

  return {
    phase,
    join,
    joinError,
    joinPending,
    studentName,
    stats,
    timeLeft,
    features,
    recordAnswer,
    markFinished,
    rejoin,
    extra,
    updateExtra,
    needsCodeInput: !urlCode,
  };
}
