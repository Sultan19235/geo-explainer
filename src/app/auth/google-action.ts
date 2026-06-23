"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Kicks off the Google OAuth flow. Supabase returns a provider URL that we
// redirect the browser to; Google then sends the user back to /auth/callback
// with a code, which exchangeCodeForSession turns into a session.
//
// Shared by both the login and signup pages — for OAuth there is no real
// distinction between the two (a first-time Google user is created on the fly).
export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient();

  // Prefer the configured site URL; fall back to the request origin so this
  // still works in preview/local environments.
  const headerList = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    headerList.get("origin") ??
    `https://${headerList.get("host")}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  // Initiating OAuth rarely fails (only on config/network issues). If it does,
  // bounce back to /login with a flag so the page can show a message.
  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}
