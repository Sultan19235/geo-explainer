// Thin client for the Hetzner live-score server (server/server.js).
// Students call GET /status and POST /submit; the teacher console also
// creates/starts/ends sessions and listens on the /live SSE stream.

export const QUIZ_BACKEND = (
  process.env.NEXT_PUBLIC_QUIZ_BACKEND_URL ?? "https://mathsabaq.online"
).replace(/\/+$/, "");

const BACKEND = QUIZ_BACKEND;

export type SessionStatus = "waiting" | "active" | "ended" | "not_found";

export type StatusResponse = {
  status: SessionStatus;
  timeLeft?: number; // seconds, present while a session exists
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
  return { status: s, timeLeft: data.timeLeft };
}

export async function fetchStatus(code: string): Promise<StatusResponse> {
  const res = await fetch(
    `${BACKEND}/status?code=${encodeURIComponent(code)}`,
  );
  // The server 404s unknown codes but still sends { status: "not_found" }.
  return parseStatus((await res.json()) as Partial<StatusResponse>, res.status);
}

// Registers presence and reports the score; the response doubles as a status
// check so an ended session is noticed on the next heartbeat.
export async function submitScore(
  payload: SubmitPayload,
): Promise<StatusResponse> {
  const res = await fetch(`${BACKEND}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
};

export type LiveEvent =
  | {
      type: "snapshot";
      students: StudentRecord[];
      status: SessionStatus;
      timeLeft: number;
    }
  | ({ type: "update" } & StudentRecord)
  | { type: "started"; startedAt: number }
  | { type: "ended"; reason: "teacher" | "timeout" };

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
): Promise<
  { code: string; hostSecret: string | null } | { error: "unauthorized" | "network" }
> {
  let token: string | null = null;
  try {
    const res = await fetch("/api/quiz-token");
    if (res.ok) token = ((await res.json()) as { token: string | null }).token;
  } catch {
    // gate dormant or endpoint unreachable — the server decides
  }
  try {
    const res = await fetch(`${BACKEND}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, token, studentPath }),
    });
    if (res.status === 401) return { error: "unauthorized" };
    const data = (await res.json()) as { code?: string; hostSecret?: string };
    if (!data.code) return { error: "network" };
    return { code: data.code, hostSecret: data.hostSecret ?? null };
  } catch {
    return { error: "network" };
  }
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
