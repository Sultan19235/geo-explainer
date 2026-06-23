import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureTeacherProfile } from "@/lib/auth/ensure-teacher-profile";

// Only allow same-origin relative paths as the post-login destination, so a
// crafted ?next= can't be used to bounce users to another site. Rejects
// absolute URLs, protocol-relative (//host) and backslash (/\host) tricks.
function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/dashboard";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // OAuth users (e.g. Google) never pass through the email login/signup
      // actions, so create their teachers profile here. Best-effort — the next
      // login repairs it if it fails (see ensureTeacherProfile).
      if (data.user) {
        await ensureTeacherProfile(data.user.id);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
