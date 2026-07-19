"use client";

// Student-side tournament state (FIFA-playoff duel rooms,
// docs/TOURNAMENT_MODE_SPEC.md §5). Owns the EventSource to /tourney/stream
// and reduces its events into one renderable state object; the TournamentFlow
// screens in pack-quiz-client.tsx are a pure function of it.
//
// Runs NEXT TO useLiveSession, never instead of it: the session hook keeps
// doing presence/heartbeats/beacons exactly as in self-paced rooms, and this
// hook must never cause the session component tree to remount (the unmount
// leave-beacon there fires on unmount — a remount would flash the student as
// "left" on the teacher's board mid-duel).
//
// Three recovery channels, in order of freshness:
//   1. SSE events — the normal path; the connect message is a full `state`
//      snapshot, so every (re)open self-heals (that snapshot is also the ONLY
//      reload recovery: tournament writes nothing new to localStorage).
//   2. visibilitychange — phone screen lock kills the SSE silently (the
//      socket often still reads OPEN), so becoming visible force-reopens.
//   3. The tourney summary riding /status and /submit responses (surfaced by
//      useLiveSession) — when it proves the stream stale (a round/phase we
//      haven't seen), we apply its clock/phase immediately AND reopen the
//      stream, because the summary carries no pairing/result/podium content.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  tourneyStreamUrl,
  type TourneyOpponent,
  type TourneyPhase,
  type TourneyPodiumView,
  type TourneyResultView,
  type TourneyRole,
  type TourneyStudentEvent,
  type TourneySummary,
} from "./live-client";

const RETRY_MS = 2_000; // SSE reopen backoff after an error

// This student's counters, as the server last reported them in a `state`
// snapshot. correct/wrong/seq are the CURRENT round (seq = NEXT expected
// answer seq); wins/totalCorrect span the whole tournament. During a live
// duel the freshest counts come from the /tourney/answer responses instead —
// the duel screen owns those and treats a snapshot with a LARGER seq as the
// resync signal.
export type TourneyYou = {
  correct: number;
  wrong: number;
  seq: number;
  wins: number;
  totalCorrect: number;
};

// Everything the TournamentFlow screens render from. Clock fields come in two
// flavors: openAt/deadline are SERVER epoch ms (kept only to derive the
// round's duration, deadline - openAt — a server-side difference is
// skew-free), while openLocal/deadlineLocal are performance.now() anchors
// computed from remainingMs at event receipt. Countdowns must only ever
// compare performance.now() against the local anchors — never the device
// wall-clock, which students can (and do) change. The wrong-answer freeze
// (lockUntilLocal) is anchored the same way.
export type TourneyState = {
  phase: TourneyPhase;
  round: number; // 0 before the first draw
  roundSec: number;
  seed: number | null; // current round's shared sequence seed
  openAt: number | null;
  deadline: number | null;
  openLocal: number | null; // before this: the 3-2-1 get-ready screen
  deadlineLocal: number | null;
  // performance.now() moment the wrong-answer freeze lifts; null = free.
  lockUntilLocal: number | null;
  you: TourneyYou | null;
  role: TourneyRole; // this student's slot in the current draw
  luckyLoser: boolean; // THIS round's draw brought you back into the bracket
  // Duel partner(s): names from the pairing reveal, live scores folded in by
  // `tick` events, connected/away state by `presence` events.
  opponents: TourneyOpponent[];
  result: TourneyResultView | null;
  podium: TourneyPodiumView | null;
};

const IDLE_STATE: TourneyState = {
  phase: "idle",
  round: 0,
  roundSec: 0,
  seed: null,
  openAt: null,
  deadline: null,
  openLocal: null,
  deadlineLocal: null,
  lockUntilLocal: null,
  you: null,
  role: "waiting",
  luckyLoser: false,
  opponents: [],
  result: null,
  podium: null,
};

// Order of the tournament state machine — used to decide whether a poll-level
// summary is NEWER than what the stream delivered (same round, later phase;
// or a later round — `round` increments at the draw, so it is the primary
// key).
const PHASE_RANK: Record<TourneyPhase, number> = {
  idle: 0,
  pairing: 1,
  duel: 2,
  result: 3,
  podium: 4,
};

// Anchors the countdown to the local monotonic clock. remainingMs is
// server-computed at send time (SSE latency ≈ ms, and the server grants
// +1.5s grace past the deadline anyway), so `performance.now() + remainingMs`
// is the skew-free deadline. The round's opening moment is recovered from
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

// The wrong-answer freeze, anchored exactly like the round deadline: the
// server sends a REMAINING duration, so performance.now() + lockRemainMs is
// skew-free. 0/absent → no freeze running.
function anchorLock(lockRemainMs: number | undefined): number | null {
  if (typeof lockRemainMs !== "number" || lockRemainMs <= 0) return null;
  return performance.now() + lockRemainMs;
}

// Folds a tick/presence payload into the opponent list. Keyed by studentId
// (additive `id` field on the wire) so two same-named opponents in a trio
// can't conflate; name is the fallback for a spec-literal server that omits
// ids. An event may carry just the opponent it is about (the partner who
// scored), so this merges field-wise instead of replacing the list.
function oppKey(o: TourneyOpponent): string {
  return o.id != null ? `id:${o.id}` : `name:${o.name}`;
}

function mergeOpponents(
  prev: TourneyOpponent[],
  incoming: TourneyOpponent[],
): TourneyOpponent[] {
  if (prev.length === 0) return incoming;
  const next = prev.map((o) => {
    const upd = incoming.find((i) => oppKey(i) === oppKey(o));
    return upd ? { ...o, ...upd } : o;
  });
  for (const i of incoming) {
    if (!prev.some((o) => oppKey(o) === oppKey(i))) next.push(i);
  }
  return next;
}

// One SSE event → next state. Pure, so a burst of events (the connect
// snapshot immediately followed by a live transition) folds correctly.
function applyTourneyEvent(
  prev: TourneyState,
  ev: TourneyStudentEvent,
): TourneyState {
  switch (ev.type) {
    case "state": {
      // Full resync: the connect snapshot (and the shape a reopen restores).
      const { openLocal, deadlineLocal } = anchorClock(ev);
      const you = ev.you; // typed required; ?. below guards junk payloads
      return {
        phase: ev.phase,
        round: ev.round,
        roundSec: ev.roundSec,
        seed: ev.seed ?? null,
        openAt: ev.openAt ?? null,
        deadline: ev.deadline ?? null,
        openLocal,
        deadlineLocal,
        lockUntilLocal: anchorLock(you?.lockRemainMs),
        you: you
          ? {
              correct: you.correct,
              wrong: you.wrong,
              seq: you.seq,
              wins: you.wins,
              totalCorrect: you.totalCorrect,
            }
          : prev.you,
        role: you?.role ?? prev.role,
        // The snapshot doesn't carry the lucky-loser flag — keep it only if
        // we're still in the round whose pairing event delivered it.
        luckyLoser: ev.round === prev.round ? prev.luckyLoser : false,
        opponents: ev.pair?.opponents ?? [],
        result: ev.result ?? null,
        podium: ev.podium ?? null,
      };
    }
    case "pairing":
      return {
        ...prev,
        phase: "pairing",
        round: ev.round,
        // The fresh seed arrives with the `duel` event (or a resync `state`);
        // the previous round's must not leak into this one's problems.
        seed: null,
        openAt: null,
        deadline: null,
        openLocal: null,
        deadlineLocal: null,
        lockUntilLocal: null,
        role: ev.role,
        luckyLoser: ev.luckyLoser === true,
        opponents: ev.opponents,
        // New round's counts start clean (the server resets its scores at
        // round start; cosmetic here — the pairing screen shows no counts).
        you: prev.you ? { ...prev.you, correct: 0, wrong: 0, seq: 1 } : null,
        result: null,
        podium: null,
      };
    case "duel": {
      const { openLocal, deadlineLocal } = anchorClock(ev);
      return {
        ...prev,
        phase: "duel",
        round: ev.round,
        roundSec: ev.roundSec,
        seed: ev.seed,
        openAt: ev.openAt,
        deadline: ev.deadline,
        openLocal,
        deadlineLocal,
        lockUntilLocal: null,
        you: prev.you
          ? { ...prev.you, correct: 0, wrong: 0, seq: 1 }
          : { correct: 0, wrong: 0, seq: 1, wins: 0, totalCorrect: 0 },
        // Keep the pairing's names/presence, zero the visible scores.
        opponents: prev.opponents.map((o) => ({ ...o, correct: 0 })),
        result: null,
        podium: null,
      };
    }
    case "tick":
      return { ...prev, opponents: mergeOpponents(prev.opponents, ev.opponents) };
    case "presence":
      return { ...prev, opponents: mergeOpponents(prev.opponents, ev.opponents) };
    case "result":
      return {
        ...prev,
        phase: "result",
        round: ev.round,
        openAt: null,
        deadline: null,
        openLocal: null,
        deadlineLocal: null,
        lockUntilLocal: null,
        result: {
          round: ev.round,
          won: ev.won,
          eliminated: ev.eliminated,
          champion: ev.champion,
          you: ev.you,
          opponents: ev.opponents,
          nextRole: ev.nextRole,
        },
        // Keep the header pills honest between full snapshots: fold the
        // settled round into the totals locally; the next `state` snapshot
        // re-syncs them authoritatively.
        you: prev.you
          ? {
              ...prev.you,
              correct: ev.you.correct,
              wrong: ev.you.wrong,
              wins: prev.you.wins + (ev.won ? 1 : 0),
              totalCorrect: prev.you.totalCorrect + ev.you.correct,
            }
          : prev.you,
        opponents: mergeOpponents(prev.opponents, ev.opponents),
      };
    case "podium":
      return {
        ...prev,
        phase: "podium",
        openAt: null,
        deadline: null,
        openLocal: null,
        deadlineLocal: null,
        lockUntilLocal: null,
        podium: { champion: ev.champion, top: ev.top, you: ev.you },
      };
    default:
      // Unknown event type from a newer server — ignore, same contract as
      // the teacher console's stream.
      return prev;
  }
}

// Poll-level catch-up: the summary carries phase/round/clock but NO content
// views — those belong to the reopened stream's snapshot, so the old ones are
// dropped rather than shown against the wrong round.
function applySummary(prev: TourneyState, s: TourneySummary): TourneyState {
  const { openLocal, deadlineLocal } = anchorClock(s);
  const samePlace = s.round === prev.round && s.phase === prev.phase;
  return {
    ...prev,
    phase: s.phase,
    round: s.round,
    roundSec: s.roundSec,
    seed: s.seed ?? (samePlace ? prev.seed : null),
    openAt: s.openAt ?? null,
    deadline: s.deadline ?? null,
    openLocal,
    deadlineLocal,
    lockUntilLocal: samePlace ? prev.lockUntilLocal : null,
    // A round change means fresh per-round counters — carrying the old
    // round's seq/correct here would mount the new duel at the previous
    // round's sequence position (and the strictly-greater seq guard in the
    // duel screen would then reject the reopened stream's honest snapshot).
    // role/wins survive: the summary carries neither, and the snapshot that
    // follows the stream reopen corrects them within a beat.
    you:
      s.round !== prev.round && prev.you
        ? { ...prev.you, correct: 0, wrong: 0, seq: 1 }
        : prev.you,
    luckyLoser: samePlace ? prev.luckyLoser : false,
    opponents: samePlace ? prev.opponents : [],
    result: samePlace ? prev.result : null,
    podium: samePlace ? prev.podium : null,
  };
}

export function useTourneySession({
  code,
  studentId,
  enabled,
  summary,
}: {
  code: string;
  studentId: string;
  // Open the stream only once the room is known active AND a tournament — an
  // EventSource against a self-paced room would 400 and retry forever.
  enabled: boolean;
  // The tourney summary useLiveSession surfaces from /status + /submit.
  summary: TourneySummary | null;
}): { connected: boolean; state: TourneyState } {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TourneyState>(IDLE_STATE);

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
      es = new EventSource(tourneyStreamUrl(code, studentId));
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
      let ev: TourneyStudentEvent;
      try {
        ev = JSON.parse(e.data) as TourneyStudentEvent;
      } catch {
        return; // keep-alives are comments and never land here; junk is junk
      }
      if (!ev || typeof ev !== "object") return;
      if (typeof (ev as { type?: unknown }).type !== "string") return;
      setState((prev) => applyTourneyEvent(prev, ev));
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
  // stream (later round, or later phase of the same one), the stream is
  // stale by definition — the server broadcasts every transition. Apply the
  // summary's phase/clock at once (the countdown must not wait 2s) and
  // reopen for the content views (pairing/result/podium and the per-student
  // counters, which the summary never carries).
  useEffect(() => {
    if (!enabled || !summary) return;
    const cur = stateRef.current;
    const newer =
      summary.round > cur.round ||
      (summary.round === cur.round &&
        PHASE_RANK[summary.phase] > PHASE_RANK[cur.phase]);
    if (newer) {
      setState((prev) => applySummary(prev, summary));
      openRef.current();
    }
  }, [summary, enabled]);

  return { connected, state };
}
