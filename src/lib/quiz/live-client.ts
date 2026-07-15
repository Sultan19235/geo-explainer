// Thin client for the Hetzner live-score server (server/server.js).
// Students call GET /status and POST /submit; the teacher console also
// creates/starts/ends sessions and listens on the /live SSE stream.

export const QUIZ_BACKEND = (
  process.env.NEXT_PUBLIC_QUIZ_BACKEND_URL ?? "https://mathsabaq.online"
).replace(/\/+$/, "");

const BACKEND = QUIZ_BACKEND;

export type SessionStatus = "waiting" | "active" | "ended" | "not_found";

// Which student aids the teacher allowed for this room, chosen once at room
// start. Server-carried (v7 /status + /submit) so a student editing the join
// link can't re-enable what the teacher switched off.
export type QuizFeatures = {
  figure: boolean; // GeoGebra figure behind the "Сызба" toggle
  theory: boolean; // per-question "Формулалар" panel
  hints: boolean; // progressive hints
  calculator: boolean; // built-in calculator
};

export const ALL_FEATURES: QuizFeatures = {
  figure: true,
  theory: true,
  hints: true,
  calculator: true,
};

export const FEATURE_KEYS = [
  "figure",
  "theory",
  "hints",
  "calculator",
] as const satisfies readonly (keyof QuizFeatures)[];

// Missing keys default to true so a payload from a newer server (more flags)
// or an older console (fewer) can never lock students out of everything.
function sanitizeFeatures(raw: unknown): QuizFeatures | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out = { ...ALL_FEATURES };
  for (const key of FEATURE_KEYS) {
    if (r[key] === false) out[key] = false;
  }
  return out;
}

export type StatusResponse = {
  status: SessionStatus;
  timeLeft?: number; // seconds, present while a session exists
  // v6: the teacher removed this student from the room. Rides /status (lobby
  // polls) and /submit (heartbeats); old servers never send it.
  kicked?: boolean;
  // v7: the room's student-aid switches; absent on old servers.
  features?: QuizFeatures;
};

// Per-question outcomes, question id -> 1 (correct) | 0 (wrong). Only quizzes
// with stable question ids send it (pack quizzes); generator quizzes make a
// fresh question per student, so there is nothing comparable to key on.
export type AnswerMap = Record<string, 0 | 1>;

export type SubmitPayload = {
  code: string;
  studentId: string;
  name: string;
  score: number;
  total: number;
  finished: boolean;
  focused: boolean;
  tabSwitches: number;
  awaySeconds: number;
  answers?: AnswerMap;
  // Deliberate (re-)join, not a passive heartbeat: clears a kick verdict and
  // the server's sticky finished flag for a fresh run.
  joining?: boolean;
};

// "not_found" is a load-bearing verdict: the teacher hook deletes its
// reload-recovery blob on it, and the student page ends the quiz. So only a
// response that explicitly carries a known status may produce one — anything
// else (the rate-limiter's 429 {error}, JSON error pages) throws and is
// handled like a network blip by every caller.
function parseStatus(data: Partial<StatusResponse>, httpStatus: number) {
  const s = data.status;
  if (s !== "waiting" && s !== "active" && s !== "ended" && s !== "not_found") {
    throw new Error(`quiz backend: unexpected status response (${httpStatus})`);
  }
  return {
    status: s,
    timeLeft: data.timeLeft,
    kicked: data.kicked === true,
    features: sanitizeFeatures(data.features),
  };
}

// studentId lets the server attach the kicked verdict — the lobby's only
// channel for it, since waiting students poll here and never /submit.
export async function fetchStatus(
  code: string,
  studentId?: string,
): Promise<StatusResponse> {
  const params = new URLSearchParams({ code });
  if (studentId) params.set("studentId", studentId);
  const res = await fetch(`${BACKEND}/status?${params.toString()}`);
  // The server 404s unknown codes but still sends { status: "not_found" }.
  return parseStatus((await res.json()) as Partial<StatusResponse>, res.status);
}

// Registers presence and reports the score; the response doubles as a status
// check so an ended session is noticed on the next heartbeat. keepalive lets
// a report outlive the page: a phone backgrounded via the back button (QR
// students have no in-app history, so back leaves the browser) freezes the
// page right after visibilitychange and a plain fetch dies mid-flight — the
// teacher's board then never learns the student went off-screen.
export async function submitScore(
  payload: SubmitPayload,
  opts?: { keepalive?: boolean },
): Promise<StatusResponse> {
  const res = await fetch(`${BACKEND}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: opts?.keepalive === true,
  });
  const data = (await res.json()) as Partial<StatusResponse & { ok: boolean }>;
  return parseStatus(data, res.status);
}

export type ResolveResult =
  | { status: SessionStatus; studentPath: string | null }
  | { error: "network" };

// Universal join: turns a room code the teacher wrote on the board into that
// room's student join path (GET /resolve, server v5+). On older servers the
// route is missing entirely — the HTML 404 fails JSON parsing and reports as
// "network", which the /join page shows as a retryable error.
export async function resolveCode(code: string): Promise<ResolveResult> {
  try {
    const res = await fetch(
      `${BACKEND}/resolve?code=${encodeURIComponent(code)}`,
    );
    // 404 is a real answer (unknown code; v5 sends a JSON body). Anything
    // else non-ok — 429 from the shared per-IP limiter, 5xx — is a retryable
    // failure, NOT "wrong code": a whole school can share one NAT'd IP.
    if (!res.ok && res.status !== 404) return { error: "network" };
    const data = (await res.json()) as {
      status?: SessionStatus;
      studentPath?: unknown;
    };
    return {
      status: data.status ?? "not_found",
      studentPath:
        typeof data.studentPath === "string" ? data.studentPath : null,
    };
  } catch {
    return { error: "network" };
  }
}

// The student page is closing (browser back, tab close): one best-effort
// parting shot so the teacher's board flips to "left" instantly instead of
// waiting out the server's 45s staleness sweep. text/plain on purpose — a
// cross-origin application/json beacon needs a preflight sendBeacon can't do.
export function sendLeaveBeacon(code: string, studentId: string): void {
  const body = JSON.stringify({ code, studentId });
  try {
    if (
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(`${BACKEND}/leave`, new Blob([body], { type: "text/plain" }))
    ) {
      return;
    }
  } catch {
    // sendBeacon unavailable/refused — fall through to keepalive fetch
  }
  try {
    void fetch(`${BACKEND}/leave`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // page is going away — nothing else to try
  }
}

// ─── Teacher side ───────────────────────────────────────────────────────────

// One student row as the /live SSE stream reports it.
export type StudentRecord = {
  studentId: string;
  name: string;
  score: number;
  total: number;
  finished: boolean;
  focused: boolean;
  tabSwitches: number;
  awaySeconds: number;
  answers?: AnswerMap;
  updatedAt: number;
  // v6: false once the student's page is gone (leave beacon or >45s of
  // heartbeat silence). Absent on old servers — treat as connected.
  connected?: boolean;
};

export type LiveEvent =
  | {
      type: "snapshot";
      students: StudentRecord[];
      status: SessionStatus;
      timeLeft: number;
    }
  | ({ type: "update" } & StudentRecord)
  | { type: "kicked"; studentId: string }
  | { type: "started"; startedAt: number }
  | { type: "ended"; reason: "teacher" | "timeout" };

// The teacher already has a live room; the server refused to open a second.
export type ActiveRoomConflict = {
  code: string;
  title: string;
  status: "waiting" | "active";
};

// Opens a room. Fetches the site's short-lived auth token first (same-origin;
// returns token:null while the gate is dormant) and passes it to /session.
// The server returns a per-session hostSecret that proves this browser owns the
// room; it must be sent with /start, /end and /live. Older servers omit it, so
// it's optional here (null → the server's host-secret gate is dormant anyway).
export async function createSession(
  title: string,
  // The room's student join link, site-relative and WITHOUT the code (it
  // doesn't exist yet), e.g. "/play/algebra-7?q=a,b". The server (v5+) stores
  // it so the universal /join page can turn a typed room code back into this
  // exact quiz; older servers simply ignore the field.
  studentPath?: string,
  // The room's student-aid switches (v7 servers store and serve them back on
  // /status and /submit; older servers ignore the field).
  features?: QuizFeatures,
): Promise<
  | { code: string; hostSecret: string | null }
  | { error: "unauthorized" | "network" }
  | { error: "active_room"; room: ActiveRoomConflict }
> {
  const token = await fetchOwnerToken();
  try {
    const res = await fetch(`${BACKEND}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, token, studentPath, features }),
    });
    if (res.status === 401) return { error: "unauthorized" };
    if (res.status === 409) {
      // v6 one-room-per-teacher rule: the server names the live room so the
      // console can offer "end it and start the new one".
      const data = (await res.json()) as {
        code?: string;
        title?: string;
        status?: string;
      };
      if (data.code) {
        return {
          error: "active_room",
          room: {
            code: data.code,
            title: data.title ?? "",
            status: data.status === "active" ? "active" : "waiting",
          },
        };
      }
      return { error: "network" };
    }
    const data = (await res.json()) as { code?: string; hostSecret?: string };
    if (!data.code) return { error: "network" };
    return { code: data.code, hostSecret: data.hostSecret ?? null };
  } catch {
    return { error: "network" };
  }
}

// The site-issued teacher token (null while the gate is dormant). Fetched
// same-origin so it carries the auth cookies.
async function fetchOwnerToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/quiz-token");
    if (res.ok) return ((await res.json()) as { token: string | null }).token;
  } catch {
    // gate dormant or endpoint unreachable — the server decides
  }
  return null;
}

// The teacher SSE stream URL, carrying the hostSecret in the query string
// because EventSource can't set request headers.
export function liveStreamUrl(code: string, hostSecret: string | null): string {
  const params = new URLSearchParams({ code });
  if (hostSecret) params.set("hostSecret", hostSecret);
  return `${BACKEND}/live?${params.toString()}`;
}

export async function startSession(
  code: string,
  hostSecret: string | null = null,
): Promise<void> {
  await fetch(`${BACKEND}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret }),
  });
}

export async function endSession(
  code: string,
  hostSecret: string | null = null,
): Promise<void> {
  await fetch(`${BACKEND}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret }),
  });
}

// End a room this console does NOT hold the hostSecret for (it lives in
// another tab or device) by proving ownership with a fresh teacher token —
// the resolution path for an active_room conflict.
export async function endSessionAsOwner(code: string): Promise<void> {
  const token = await fetchOwnerToken();
  await fetch(`${BACKEND}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, token }),
  });
}

// Teacher removes one student from the room (v6). The SSE 'kicked' event
// echoes back to every console tab, so the caller may also drop the card
// optimistically.
export async function kickStudent(
  code: string,
  hostSecret: string | null,
  studentId: string,
): Promise<void> {
  await fetch(`${BACKEND}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostSecret, studentId }),
  });
}
