"use client";

// Student-side race state (Kahoot-style lockstep rooms, docs/RACE_MODE_SPEC.md
// §6). Owns the EventSource to /race/stream and reduces its events into one
// renderable state object; the RaceFlow screens in pack-quiz-client.tsx are a
// pure function of it.
//
// Runs NEXT TO useLiveSession, never instead of it: the session hook keeps
// doing presence/heartbeats/beacons exactly as in self-paced rooms, and this
// hook must never cause the session component tree to remount (the unmount
// leave-beacon there fires on unmount — a remount would flash the student as
// "left" on the teacher's board mid-race).
//
// Three recovery channels, in order of freshness:
//   1. SSE events — the normal path; the connect message is a full `state`
//      snapshot, so every (re)open self-heals.
//   2. visibilitychange — phone screen lock kills the SSE silently (the
//      socket often still reads OPEN), so becoming visible force-reopens.
//   3. The race summary riding /status and /submit responses (surfaced by
//      useLiveSession) — when it proves the stream stale (a phase/question
//      we haven't seen), we apply its clock/phase immediately AND reopen the
//      stream, because the summary carries no reveal/explain/podium content.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  raceStreamUrl,
  type RaceExplainView,
  type RacePhase,
  type RaceRevealView,
  type RaceStudentEvent,
  type RaceSummary,
} from "./live-client";

const RETRY_MS = 2_000; // SSE reopen backoff after an error

// This student's running totals, as the server last reported them.
export type RaceYou = {
  points: number;
  correct: number;
  streak: number;
  rank: number | null; // null until the standings have ranked this student
  of: number;
};

export type RacePodiumView = {
  top: { name: string; points: number }[]; // final top 3
  // rank is null for a student the final standings never ranked (first
  // contact with the room came after the last reveal) — the podium screen
  // then shows the top-3 without a personal rank line.
  you: { rank: number | null; of: number; points: number; correct: number };
};

// Everything the RaceFlow screens render from. Clock fields come in two
// flavors: openAt/deadline are SERVER epoch ms (kept only to derive the
// question's duration, deadline - openAt — a server-side difference is
// skew-free), while openLocal/deadlineLocal are performance.now() anchors
// computed from remainingMs at event receipt. Countdowns must only ever
// compare performance.now() against the local anchors — never the device
// wall-clock, which students can (and do) change.
export type RaceState = {
  phase: RacePhase;
  qIndex: number; // -1 before the first question opens
  qCount: number;
  qId: string | null;
  openAt: number | null;
  deadline: number | null;
  openLocal: number | null; // before this: the 3-2-1 get-ready screen
  deadlineLocal: number | null;
  answered: boolean; // server's word; the page ORs its own raceAns record in
  you: RaceYou | null;
  reveal: RaceRevealView | null;
  explain: RaceExplainView | null;
  podium: RacePodiumView | null;
};

const IDLE_STATE: RaceState = {
  phase: "idle",
  qIndex: -1,
  qCount: 0,
  qId: null,
  openAt: null,
  deadline: null,
  openLocal: null,
  deadlineLocal: null,
  answered: false,
  you: null,
  reveal: null,
  explain: null,
  podium: null,
};

// Order of the race state machine — used to decide whether a poll-level
// summary is NEWER than what the stream delivered (same question, later
// phase; or a later question).
const PHASE_RANK: Record<RacePhase, number> = {
  idle: 0,
  question: 1,
  reveal: 2,
  explain: 3,
  podium: 4,
};

// Anchors the countdown to the local monotonic clock. remainingMs is
// server-computed at send time (SSE latency ≈ ms, and the server grants
// +1.5s grace past the deadline anyway), so `performance.now() + remainingMs`
// is the skew-free deadline. The question's opening moment is recovered from
// the server-side duration deadline - openAt — NOT from openAt itself, which
// only compares against the (untrusted) device wall-clock.
function anchorClock(ev: {
  openAt?: number;
  deadline?: number;
  remainingMs?: number;
}): { openLocal: number | null; deadlineLocal: number | null } {
  if (typeof ev.deadline !== "number" || typeof ev.remainingMs !== "number") {
    return { openLocal: null, deadlineLocal: null };
  }
  const deadlineLocal = performance.now() + ev.remainingMs;
  const openLocal =
    typeof ev.openAt === "number"
      ? deadlineLocal - (ev.deadline - ev.openAt)
      : null;
  return { openLocal, deadlineLocal };
}

// Defensive read of a podium payload. The v8 connect snapshot additively
// embeds `podium` when phase === 'podium' (a server-side superset of the spec
// §2.5 state shape) so a phone connecting during podium still has its top-3 —
// but the field is untyped on RaceStudentEvent's 'state' arm, hence the
// unknown-shaped gate here. Malformed → null, and the screen just waits.
function readPodium(raw: unknown): RacePodiumView | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as { top?: unknown; you?: unknown };
  if (!Array.isArray(p.top)) return null;
  const top = p.top.filter(
    (row): row is { name: string; points: number } =>
      typeof row === "object" &&
      row !== null &&
      typeof (row as { name?: unknown }).name === "string" &&
      typeof (row as { points?: unknown }).points === "number",
  );
  // `you` degrades, never gates: a student the standings couldn't rank (late
  // joiner, rank:null from the server) must still see the top-3 — dropping
  // the whole podium here would strand them on the waiting screen.
  const you = (
    p.you && typeof p.you === "object" ? p.you : {}
  ) as Partial<RacePodiumView["you"]>;
  return {
    top,
    you: {
      rank: typeof you.rank === "number" ? you.rank : null,
      of: typeof you.of === "number" ? you.of : top.length,
      points: typeof you.points === "number" ? you.points : 0,
      correct: typeof you.correct === "number" ? you.correct : 0,
    },
  };
}

// One SSE event → next state. Pure, so a burst of events (the connect
// snapshot immediately followed by a live transition) folds correctly.
function applyRaceEvent(prev: RaceState, ev: RaceStudentEvent): RaceState {
  switch (ev.type) {
    case "state": {
      // Full resync: the connect snapshot (and the shape a reopen restores).
      const { openLocal, deadlineLocal } = anchorClock(ev);
      return {
        phase: ev.phase,
        qIndex: ev.qIndex,
        qCount: ev.qCount,
        qId: ev.qId ?? null,
        openAt: ev.openAt ?? null,
        deadline: ev.deadline ?? null,
        openLocal,
        deadlineLocal,
        answered: ev.answered === true,
        you: ev.you ?? prev.you,
        reveal: ev.reveal ?? null,
        explain: ev.explain ?? null,
        podium:
          readPodium((ev as { podium?: unknown }).podium) ??
          (ev.phase === "podium" ? prev.podium : null),
      };
    }
    case "question": {
      const { openLocal, deadlineLocal } = anchorClock(ev);
      return {
        ...prev,
        phase: "question",
        qIndex: ev.qIndex,
        qCount: ev.qCount,
        qId: ev.qId,
        openAt: ev.openAt,
        deadline: ev.deadline,
        openLocal,
        deadlineLocal,
        answered: false,
        reveal: null,
        explain: null,
        podium: null,
      };
    }
    case "reveal":
      return {
        ...prev,
        phase: "reveal",
        qIndex: ev.qIndex,
        qId: ev.qId,
        reveal: ev,
        // Keep the header pills honest between full snapshots. `correct`
        // accumulates locally (the reveal view has no running count); the
        // next `state` snapshot re-syncs it authoritatively.
        you: {
          points: ev.you.totalPoints,
          correct: (prev.you?.correct ?? 0) + (ev.you.ok ? 1 : 0),
          streak: ev.you.streak,
          rank: ev.you.rank,
          of: ev.you.of,
        },
      };
    case "explain":
      return {
        ...prev,
        phase: "explain",
        qIndex: ev.qIndex,
        qId: ev.qId,
        explain: ev,
      };
    case "podium":
      return {
        ...prev,
        phase: "podium",
        podium: { top: ev.top, you: ev.you },
      };
    default:
      // Unknown event type from a newer server — ignore, same contract as
      // the teacher console's stream.
      return prev;
  }
}

// Poll-level catch-up: the summary carries phase/question/clock but NO
// content views — those belong to the reopened stream's snapshot, so the old
// ones are dropped rather than shown against the wrong question.
function applySummary(prev: RaceState, s: RaceSummary): RaceState {
  const { openLocal, deadlineLocal } = anchorClock(s);
  const samePlace = s.qIndex === prev.qIndex && s.phase === prev.phase;
  return {
    ...prev,
    phase: s.phase,
    qIndex: s.qIndex,
    qCount: s.qCount,
    qId: s.qId ?? prev.qId,
    openAt: s.openAt ?? null,
    deadline: s.deadline ?? null,
    openLocal,
    deadlineLocal,
    answered: s.answered === true,
    reveal: samePlace ? prev.reveal : null,
    explain: samePlace ? prev.explain : null,
    podium: samePlace ? prev.podium : null,
  };
}

export function useRaceSession({
  code,
  studentId,
  enabled,
  summary,
}: {
  code: string;
  studentId: string;
  // Open the stream only once the room is known active AND a race — an
  // EventSource against a self-paced room would 400 and retry forever.
  enabled: boolean;
  // The race summary useLiveSession surfaces from /status + /submit.
  summary: RaceSummary | null;
}): { connected: boolean; state: RaceState } {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<RaceState>(IDLE_STATE);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation counter: every open() invalidates all callbacks of the
  // previous EventSource, so a slow-dying old socket can never write state
  // over a fresh one (StrictMode's dev double-mount included).
  const genRef = useRef(0);
  // Mirror of `state` for effect-side comparisons without depending on it
  // (the summary effect must not re-run on every SSE event).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const open = useCallback(() => {
    genRef.current += 1;
    const gen = genRef.current;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    esRef.current?.close();
    esRef.current = null;
    if (!enabled || !code || !studentId) return;

    let es: EventSource;
    try {
      es = new EventSource(raceStreamUrl(code, studentId));
    } catch {
      // EventSource unavailable/refused — fall back to the poll-level
      // summary channel entirely (state still advances every heartbeat).
      return;
    }
    esRef.current = es;
    es.onopen = () => {
      if (gen === genRef.current) setConnected(true);
    };
    es.onmessage = (e) => {
      if (gen !== genRef.current) return;
      let ev: RaceStudentEvent;
      try {
        ev = JSON.parse(e.data) as RaceStudentEvent;
      } catch {
        return; // keep-alives are comments and never land here; junk is junk
      }
      if (!ev || typeof ev !== "object") return;
      if (typeof (ev as { type?: unknown }).type !== "string") return;
      setState((prev) => applyRaceEvent(prev, ev));
    };
    es.onerror = () => {
      if (gen !== genRef.current) return;
      // Manage the retry ourselves (flat 2s backoff) instead of trusting the
      // browser's native reconnect: a 400 (e.g. the room ended) closes the
      // source for good natively, and we'd never notice.
      setConnected(false);
      es.close();
      retryRef.current = setTimeout(() => openRef.current(), RETRY_MS);
    };
  }, [code, studentId, enabled]);

  // Self-reference for timers/listeners without making `open` its own dep.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    open();
    return () => {
      // Invalidate before closing so the onerror of a dying socket can't
      // schedule a retry into the void.
      genRef.current += 1;
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = null;
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [open]);

  // Screen lock / app switch kills the SSE on phones, usually without an
  // error event — the socket still reads OPEN. Becoming visible again always
  // force-reopens; the connect snapshot makes the reopen self-healing and
  // cheap enough not to bother detecting "was it actually dead". This touches
  // ONLY our EventSource — the live session's visibility/beacon machinery is
  // a separate listener and stays untouched.
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (!document.hidden) openRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  // Poll-level resync: when a /status / /submit summary is AHEAD of the
  // stream (later question, or later phase of the same one), the stream is
  // stale by definition — the server broadcasts every transition. Apply the
  // summary's phase/clock at once (the countdown must not wait 2s) and
  // reopen for the content views. A summary merely CONFIRMING the current
  // place only contributes its answered flag (the server may know about an
  // answer this device sent from a previous load).
  useEffect(() => {
    if (!enabled || !summary) return;
    const cur = stateRef.current;
    const newer =
      summary.qIndex > cur.qIndex ||
      (summary.qIndex === cur.qIndex &&
        PHASE_RANK[summary.phase] > PHASE_RANK[cur.phase]);
    if (newer) {
      setState((prev) => applySummary(prev, summary));
      openRef.current();
    } else if (
      summary.qIndex === cur.qIndex &&
      summary.phase === cur.phase &&
      summary.answered === true &&
      !cur.answered
    ) {
      setState((prev) => ({ ...prev, answered: true }));
    }
  }, [summary, enabled]);

  return { connected, state };
}
