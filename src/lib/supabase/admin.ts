import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. This client uses the Supabase service role key and BYPASSES
// Row Level Security entirely. Never import it from a Client Component, a
// "use client" file, or any route handler that doesn't first verify the
// caller is an admin. Treat any code path that touches it as fully
// privileged.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE env vars (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
