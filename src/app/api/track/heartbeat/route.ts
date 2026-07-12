import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startLoginSession, touchSession } from "@/lib/analytics/track";

// Presence heartbeat: the client pings this every ~45s while the tab is
// visible. It bumps the session's last_seen_at (so we can infer session length
// without a reliable "logout" event) and, on the first ping, records the
// client device fingerprint. The session is identified by the httpOnly cookie,
// so no user id is trusted from the request body.
//
// The analytics cookie lives 12h while Supabase auth lives much longer, so a
// heartbeat that no longer matches a live session re-mints one (method
// "resumed") for the still-authenticated user — otherwise "last activity"
// freezes at the old cookie's expiry while the teacher keeps using the site.
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

  const touched = await touchSession(fingerprint);
  let resumed = false;
  if (!touched) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        resumed = (await startLoginSession(user.id, "resumed")) !== null;
      }
    } catch {
      // best-effort — never fail the heartbeat
    }
  }

  // resumed tells the client to resend its device fingerprint: the fresh
  // session row doesn't have one yet.
  return NextResponse.json({ ok: true, resumed });
}
