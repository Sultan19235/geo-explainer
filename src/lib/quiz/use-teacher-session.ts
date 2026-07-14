"use client";

// Teacher-side session state machine: create room → lobby (students join) →
// live (SSE updates stream in) → results. Mirrors the uploaded teacher.html
// console: same endpoints, same 3s SSE retry, same local 45-min countdown
// with the server's timeLeft as the source of truth on (re)connect.
//
// The open room's {code, hostSecret} are also mirrored to localStorage, so an
// accidental reload or closed tab doesn't orphan a running class: the room
// itself lives on in the server's memory (teacher connected or not), and on
// the next mount the hook checks the stored room against /status and offers a
// reconnect — the /live snapshot then restores the whole scoreboard.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession,
  endSession,
  endSessionAsOwner,
  fetchStatus,
  kickStudent,
  liveStreamUrl,
  startSession,
  type ActiveRoomConflict,
  type LiveEvent,
  type QuizFeatures,
  type StudentRecord,
} from "./live-client";
import { isRoomResultSaved } from "./result-claims";

const SESSION_SECONDS = 45 * 60;
const SSE_RETRY_MS = 3_000;
const FLASH_MS = 800;

const STORAGE_PREFIX = "msq-live-room:";
// Matches the server's eviction horizon: idle sessions are deleted ~4h after
// creation, so anything older is gone no matter what /status would say.
const STORED_ROOM_TTL_MS = 4 * 60 * 60 * 1000;

// Hosting heartbeat: while a console has the room open (lobby/live) it stamps
// `<storageKey>:alive` every few seconds. Another tab mounting the same
// console then knows the room is ACTIVELY hosted and must not offer (or end)
// it — the resume banner is for orphaned rooms only. The stamp is removed on
// pagehide, so the same tab's own reload sees no fresh heartbeat and gets its
// banner immediately; only a hard crash leaves a stamp behind, which goes
// stale within ALIVE_FRESH_MS anyway.
//
// ALIVE_FRESH_MS must exceed the worst background-tab timer throttling:
// Chrome's intensive throttling runs a hidden tab's timers as rarely as once
// per MINUTE, and a minimized console mid-quiz is completely normal. 75s
// keeps a throttled-but-alive host "fresh"; a crashed host goes stale within
// the same 75s, and suppressed consoles re-check on a short loop
// (ALIVE_RECHECK_MS) so the banner still appears soon after a real crash.
const ALIVE_SUFFIX = ":alive";
const ALIVE_BEAT_MS = 4_000;
const ALIVE_FRESH_MS = 75_000;
const ALIVE_RECHECK_MS = 15_000;

function otherTabIsHosting(storageKey: string): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey + ALIVE_SUFFIX);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < ALIVE_FRESH_MS;
  } catch {
    return false;
  }
}

export type TeacherPhase = "setup" | "lobby" | "live" | "results";

// flash marks a card for a moment when a new answer arrives.
// awaySince (client-only) anchors the live "away" clock: the moment we last
// saw a heartbeat report the student off-screen. Cards tick up from here so the
// away timer grows in real time instead of only jumping to the true total when
// the student returns — an off-screen tab throttles its heartbeat to a crawl.
export type LiveStudent = StudentRecord & {
  flash: "ok" | "err" | null;
  awaySince: number | null;
};

// Re-derived on every incoming report. Re-anchored on each off-screen beat so
// the local clock re-syncs with the accumulated awaySeconds the beat carries
// (no double-count); cleared once the student is back on screen. A student
// who LEFT (connected:false) keeps an anchor too: their page is gone and
// can't report, so the board's local clock is the only thing still counting —
// the student adds the gone-time to its own total on return, so the numbers
// reconcile instead of jumping back.
function awayAnchor(record: StudentRecord): number | null {
  if (record.connected === false || !record.focused) return Date.now();
  return null;
}

// What survives a reload. `ctx` is the console's own room setup (selected
// questions, generator ticks…) — opaque here, replayed by the console before
// resuming so the join link/QR and the autosave's question columns match the
// room the students are already in.
type StoredRoom = {
  v: 1;
  code: string;
  hostSecret: string | null;
  createdAt: number;
  ctx?: unknown;
  // Bumped on resume purely so the stored JSON CHANGES: other tabs' storage
  // listeners then retract their standing banners for this room (a 'storage'
  // event only fires when the value actually differs).
  adoptedAt?: number;
};

// A stored room that /status confirmed still exists, offered to the teacher.
export type ResumableRoom = {
  code: string;
  status: "waiting" | "active" | "ended";
  ctx: unknown;
};

function readStoredRoom(key: string): StoredRoom | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredRoom>;
    if (
      data.v !== 1 ||
      typeof data.code !== "string" ||
      data.code.length === 0 ||
      typeof data.createdAt !== "number" ||
      Date.now() - data.createdAt > STORED_ROOM_TTL_MS
    ) {
      return null;
    }
    return {
      v: 1,
      code: data.code,
      hostSecret: typeof data.hostSecret === "string" ? data.hostSecret : null,
      createdAt: data.createdAt,
      ctx: data.ctx,
    };
  } catch {
    return null;
  }
}

export function useTeacherSession(options?: { persistKey?: string }) {
  // No persistKey → no persistence (old behavior); both real consoles pass one.
  const storageKey = options?.persistKey
    ? `${STORAGE_PREFIX}${options.persistKey}`
    : null;

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
  const [resumable, setResumable] = useState<ResumableRoom | null>(null);
  // v6 one-room-per-teacher: the server refused to open a room because this
  // teacher already has a live one. The console asks "end it and start new?"
  // and answers through resolveConflict.
  const [conflict, setConflict] = useState<ActiveRoomConflict | null>(null);
  // The arguments of the create that hit the conflict, replayed on "yes".
  const conflictRetryRef = useRef<
    [string, string | undefined, unknown, QuizFeatures | undefined] | null
  >(null);

  const phaseRef = useRef<TeacherPhase>("setup");
  // Per-session teacher credential from /session; required by /start, /end and
  // the /live stream once the server's host-secret gate is enforced.
  const hostSecretRef = useRef<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Mirror of the stored blob, so callbacks can reach the open/offered room
  // without re-reading localStorage.
  const storedRef = useRef<StoredRoom | null>(null);
  // Mirror of `students`, for callbacks that must not re-subscribe on every
  // SSE update (the dead-room check in the retry path).
  const studentsRef = useRef<Map<string, LiveStudent>>(new Map());
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  const setPhaseBoth = (p: TeacherPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // Bumped on every deliberate stream teardown. Async continuations spawned
  // by the retry path capture the generation they belong to and bail if it
  // moved on — an in-flight fetchStatus can't be aborted, so without this a
  // stale continuation could hijack a NEWER room's console (freeze it as
  // results, or re-attach the stream to the old dead room).
  const streamGenRef = useRef(0);

  const closeStream = () => {
    streamGenRef.current += 1;
    sourceRef.current?.close();
    sourceRef.current = null;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };

  const persistRoom = useCallback(
    (room: StoredRoom) => {
      storedRef.current = room;
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(room));
      } catch {
        // storage blocked/full — the room just won't survive a reload
      }
    },
    [storageKey],
  );

  const clearStoredRoom = useCallback(() => {
    storedRef.current = null;
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  const showResults = useCallback(() => {
    if (phaseRef.current === "results") return;
    setPhaseBoth("results");
    closeStream();
    // The blob is deliberately KEPT through results: if the profile autosave
    // fails (or the teacher is signed out), a reload can re-open this ended
    // room from the banner and recover — the server holds the scoreboard for
    // ~4h. Duplicate rows are prevented by the autosave's cross-tab claim
    // registry; reset() clears the blob when the teacher moves on.
  }, []);

  const reset = useCallback(() => {
    // Walking away from an open room (the lobby's "back" button) also closes
    // it server-side, so students aren't stranded in a dead waiting room.
    if (code && (phaseRef.current === "lobby" || phaseRef.current === "live")) {
      void endSession(code, hostSecretRef.current).catch(() => {});
    }
    closeStream();
    for (const t of flashTimers.current.values()) clearTimeout(t);
    flashTimers.current.clear();
    setStudents(new Map());
    setCode(null);
    hostSecretRef.current = null;
    setCreateError(null);
    setTimeLeft(SESSION_SECONDS);
    clearStoredRoom();
    setResumable(null);
    setPhaseBoth("setup");
  }, [code, clearStoredRoom]);

  const applyEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type === "snapshot") {
        setStudents((prev) => {
          const next = new Map<string, LiveStudent>();
          for (const s of event.students) {
            next.set(s.studentId, {
              ...s,
              flash: prev.get(s.studentId)?.flash ?? null,
              awaySince: awayAnchor(s),
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
          // A resume into an ended room arrives ALREADY at results, where
          // showResults() no-ops — close its stream explicitly (idempotent).
          closeStream();
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
          next.set(event.studentId, {
            ...record,
            flash,
            awaySince: awayAnchor(record),
          });

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

      if (event.type === "kicked") {
        // Echo of a /kick (possibly from another console tab): drop the card.
        setStudents((prev) => {
          if (!prev.has(event.studentId)) return prev;
          const next = new Map(prev);
          next.delete(event.studentId);
          return next;
        });
        const timer = flashTimers.current.get(event.studentId);
        if (timer) {
          clearTimeout(timer);
          flashTimers.current.delete(event.studentId);
        }
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
        liveStreamUrl(roomCode, hostSecretRef.current),
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
        // The stream dropped on its own (nothing bumped the generation), so
        // whatever phase we're in, this room still owns the console — keep
        // trying. Every continuation below re-checks the generation because
        // reset/createRoom/showResults may supersede this room while the
        // timer or the (unabortable) fetch is in flight.
        const gen = streamGenRef.current;
        retryRef.current = setTimeout(() => {
          if (streamGenRef.current !== gen) return;
          // A dropped stream is usually a blip — but when the server says the
          // room no longer exists (restart/eviction), reconnecting is
          // hopeless and this console holds the only copy of the scoreboard:
          // freeze it as results instead of retrying forever.
          void fetchStatus(roomCode)
            .then((res) => {
              if (streamGenRef.current !== gen) return;
              if (res.status === "not_found") {
                if (studentsRef.current.size > 0) showResults();
                else reset(); // empty lobby of a dead room — start over
                return;
              }
              connectStream(roomCode);
            })
            .catch(() => {
              // 429/5xx/offline — can't tell anything, keep trying.
              if (streamGenRef.current !== gen) return;
              connectStream(roomCode);
            });
        }, SSE_RETRY_MS);
      };
    },
    [applyEvent, showResults, reset],
  );

  const createRoom = useCallback(
    // studentPath = the room's join link without the code (see createSession);
    // consoles pass it so students can enter by typing the code on /join.
    // ctx = the console's setup for this room, persisted opaquely so a reload
    // can restore the exact same selection before reconnecting.
    // features = the room's student-aid switches, stored server-side (v7) so
    // students can't re-enable them by editing the join link.
    async (
      title: string,
      studentPath?: string,
      ctx?: unknown,
      features?: QuizFeatures,
    ) => {
      setCreating(true);
      setCreateError(null);
      const res = await createSession(title, studentPath, features);
      setCreating(false);
      if ("error" in res) {
        if (res.error === "active_room") {
          // This teacher already has a live room (v6 rule). Hold the create's
          // arguments; the console confirms and calls resolveConflict.
          conflictRetryRef.current = [title, studentPath, ctx, features];
          setConflict(res.room);
        } else {
          setCreateError(res.error);
        }
        return;
      }
      // Opening a fresh room supersedes a leftover one (an ignored resume
      // offer, or one whose /status probe hadn't resolved before the teacher
      // clicked): close it server-side so its students see "ended" instead
      // of answering a class nobody watches. Read the blob directly — the
      // probe may still be in flight — but NEVER end a room another tab is
      // actively hosting (fresh heartbeat).
      const leftover =
        storedRef.current ?? (storageKey ? readStoredRoom(storageKey) : null);
      if (
        leftover &&
        leftover.code !== res.code &&
        !(storageKey && otherTabIsHosting(storageKey))
      ) {
        void endSession(leftover.code, leftover.hostSecret).catch(() => {});
      }
      setResumable(null);
      hostSecretRef.current = res.hostSecret;
      persistRoom({
        v: 1,
        code: res.code,
        hostSecret: res.hostSecret,
        createdAt: Date.now(),
        ctx,
      });
      setCode(res.code);
      setStudents(new Map());
      setTimeLeft(SESSION_SECONDS);
      setPhaseBoth("lobby");
      connectStream(res.code);
    },
    [connectStream, persistRoom, storageKey],
  );

  // Answer to the active-room conflict: end the old room and replay the
  // create that was refused, or just dismiss.
  const resolveConflict = useCallback(
    async (endOldAndCreate: boolean) => {
      const c = conflict;
      const args = conflictRetryRef.current;
      setConflict(null);
      conflictRetryRef.current = null;
      if (!endOldAndCreate || !c) return;
      try {
        await endSessionAsOwner(c.code);
      } catch {
        // ending failed (offline?) — the retried create will 409 again and
        // re-surface the conflict rather than silently doing nothing
      }
      if (args) await createRoom(...args);
    },
    [conflict, createRoom],
  );

  // Remove one student from the room. Optimistic: the card disappears now;
  // the server's 'kicked' broadcast keeps other console tabs in sync.
  const kick = useCallback(
    (studentId: string) => {
      if (!code) return;
      void kickStudent(code, hostSecretRef.current, studentId).catch(() => {});
      setStudents((prev) => {
        if (!prev.has(studentId)) return prev;
        const next = new Map(prev);
        next.delete(studentId);
        return next;
      });
    },
    [code],
  );

  const start = useCallback(async () => {
    if (!code) return;
    await startSession(code, hostSecretRef.current);
    setTimeLeft(SESSION_SECONDS);
    setPhaseBoth("live");
  }, [code]);

  const end = useCallback(async () => {
    if (code) {
      try {
        await endSession(code, hostSecretRef.current);
      } catch {
        // results still shown locally; the room times out server-side
      }
    }
    showResults();
  }, [code, showResults]);

  // On mount: if a room from a previous page-load is still alive on the
  // server, offer to reconnect instead of silently starting from scratch.
  // While another tab's heartbeat says the room is actively hosted, keep
  // re-checking on a short loop instead of giving up — if that tab crashed,
  // its stamp goes stale and the banner must still appear here.
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = () => {
      if (cancelled || phaseRef.current !== "setup") return;
      const stored = readStoredRoom(storageKey);
      if (!stored) return;
      // A console in another tab is hosting this room RIGHT NOW — it is not
      // orphaned, and offering it here would let one click end a live class.
      if (otherTabIsHosting(storageKey)) {
        timer = setTimeout(attempt, ALIVE_RECHECK_MS);
        return;
      }
      fetchStatus(stored.code)
        .then((res) => {
          if (cancelled || phaseRef.current !== "setup") return;
          if (res.status === "not_found") {
            // Definitive answer from the server: the room is gone.
            try {
              window.localStorage.removeItem(storageKey);
            } catch {}
            return;
          }
          if (res.status === "ended" && isRoomResultSaved(stored.code)) {
            // Finished AND already saved to the profile — nothing left to
            // recover, don't nag with a banner.
            try {
              window.localStorage.removeItem(storageKey);
            } catch {}
            return;
          }
          storedRef.current = stored;
          setResumable({
            code: stored.code,
            status: res.status,
            ctx: stored.ctx,
          });
        })
        .catch(() => {
          // Backend unreachable or rate-limited — keep the blob and try
          // again shortly; a one-off blip must not kill recovery in this tab.
          if (cancelled || phaseRef.current !== "setup") return;
          timer = setTimeout(attempt, ALIVE_RECHECK_MS);
        });
    };

    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [storageKey]);

  // While the offer stands, watch for another tab taking the room over
  // (removing or replacing the blob) — the banner must not act on stale data.
  useEffect(() => {
    if (!storageKey || !resumable) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      storedRef.current = null;
      setResumable(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, resumable]);

  // Reconnect to the offered room. The console applies `resumable.ctx` to its
  // own state BEFORE calling this, so everything derived from the setup
  // (join link, QR, autosave columns) matches the room students are in.
  const resume = useCallback(() => {
    const stored = storedRef.current;
    if (!stored || !resumable) return;
    setResumable(null);
    hostSecretRef.current = stored.hostSecret;
    // Re-persist with a bumped adoption stamp: the changed JSON fires the
    // storage listener in every OTHER tab still showing a banner for this
    // room, retracting offers that are now stale.
    persistRoom({ ...stored, adoptedAt: Date.now() });
    setCode(stored.code);
    setStudents(new Map());
    setTimeLeft(SESSION_SECONDS); // the snapshot corrects this within ~1 RTT
    // waiting → back to the lobby; active → live; ended → straight to
    // results (no 45:00 live-screen flash) — the stream still opens so the
    // snapshot can fill the scoreboard in, then closes itself.
    setPhaseBoth(
      resumable.status === "waiting"
        ? "lobby"
        : resumable.status === "active"
          ? "live"
          : "results",
    );
    connectStream(stored.code);
  }, [resumable, connectStream, persistRoom]);

  const discardResume = useCallback(() => {
    const stored = storedRef.current;
    // Re-check the heartbeat AT CLICK TIME (createRoom does the same): the
    // room may have been re-adopted by another tab after this banner was
    // offered — then it is that tab's live class, not an orphan: retract the
    // offer locally and leave both the room and its blob alone.
    if (storageKey && otherTabIsHosting(storageKey)) {
      storedRef.current = null;
      setResumable(null);
      return;
    }
    // Best-effort close of the abandoned room, so students in it see "ended"
    // rather than a class nobody watches.
    if (stored) void endSession(stored.code, stored.hostSecret).catch(() => {});
    clearStoredRoom();
    setResumable(null);
  }, [clearStoredRoom, storageKey]);

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

  // While a room is open, stamp the hosting heartbeat so other tabs of the
  // same console don't offer (or end) a room that isn't orphaned at all.
  useEffect(() => {
    if (!storageKey) return;
    if (phase !== "lobby" && phase !== "live") return;
    const aliveKey = storageKey + ALIVE_SUFFIX;
    const beat = () => {
      try {
        window.localStorage.setItem(aliveKey, String(Date.now()));
      } catch {}
    };
    const clear = () => {
      try {
        window.localStorage.removeItem(aliveKey);
      } catch {}
    };
    beat();
    const id = setInterval(beat, ALIVE_BEAT_MS);
    // Timers are heavily throttled in hidden tabs, so also stamp on every
    // visibility flip — hiding leaves a fresh stamp behind, and the throttled
    // interval (worst case ~1/min) stays inside ALIVE_FRESH_MS after that.
    document.addEventListener("visibilitychange", beat);
    // On reload/close the stamp must vanish immediately, so this same tab's
    // next load gets its resume banner without waiting out the staleness.
    window.addEventListener("pagehide", clear);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("pagehide", clear);
      clear();
    };
  }, [phase, storageKey]);

  // While a room is open, warn before reload/close. The room is recoverable
  // now, but the projector going blank mid-class is still a disruption worth
  // a confirmation dialog.
  useEffect(() => {
    if (phase !== "lobby" && phase !== "live") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome still requires returnValue to be set for the dialog to show.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

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
    resumable,
    conflict,
    resolveConflict,
    kick,
    createRoom,
    start,
    end,
    reset,
    resume,
    discardResume,
  };
}
