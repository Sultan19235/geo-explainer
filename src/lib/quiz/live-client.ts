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
};

export async function fetchStatus(code: string): Promise<StatusResponse> {
  const res = await fetch(
    `${BACKEND}/status?code=${encodeURIComponent(code)}`,
  );
  // The server 404s unknown codes but still sends { status: "not_found" }.
  const data = (await res.json()) as Partial<StatusResponse>;
  return {
    status: data.status ?? "not_found",
    timeLeft: data.timeLeft,
  };
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
  return {
    status: data.status ?? "not_found",
    timeLeft: data.timeLeft,
  };
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
      body: JSON.stringify({ title, token }),
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
