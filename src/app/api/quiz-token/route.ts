import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

// Issues a short-lived proof that "a signed-in teacher is asking to open a
// quiz room" (PLAN.md "Gate 2"). The teacher console fetches this right before
// POST /session; the Hetzner live server verifies it with the shared
// QUIZ_TOKEN_SECRET. The console iframe is same-origin (served via
// /api/lesson-html), so this request carries the site's auth cookies.
//
// Token format: base64url(JSON {uid, exp}) + "." + base64url(HMAC-SHA256).
// While QUIZ_TOKEN_SECRET is unset here, we return token:null and the console
// proceeds tokenless — the Hetzner side only enforces once ITS secret is set.

const TOKEN_TTL_SECONDS = 10 * 60;

export async function GET() {
  const secret = process.env.QUIZ_TOKEN_SECRET;
  if (!secret) {
    return Response.json(
      { token: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: "Not signed in" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const payload = Buffer.from(
    JSON.stringify({
      uid: user.id,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return Response.json(
    { token: `${payload}.${signature}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
