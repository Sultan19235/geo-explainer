import { NextResponse } from "next/server";
import { touchSession } from "@/lib/analytics/track";

// Presence heartbeat: the client pings this every ~45s while the tab is
// visible. It bumps the session's last_seen_at (so we can infer session length
// without a reliable "logout" event) and, on the first ping, records the
// client device fingerprint. The session is identified by the httpOnly cookie,
// so no user id is trusted from the request body.
export async function POST(request: Request) {
  let fingerprint: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.fingerprint === "string") {
      fingerprint = body.fingerprint.slice(0, 128);
    }
  } catch {
    // empty / malformed body is fine — still a valid heartbeat
  }

  await touchSession(fingerprint);
  return NextResponse.json({ ok: true });
}
