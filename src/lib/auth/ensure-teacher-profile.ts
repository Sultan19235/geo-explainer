import { createAdminClient } from "@/lib/supabase/admin";

// Ensures a `teachers` profile row exists for a freshly authenticated user.
//
// Uses the SERVICE-ROLE admin client on purpose: a brand-new user has no RLS
// policy permitting them to insert their own row, so this must bypass RLS.
//
// upsert + ignoreDuplicates means it is safe to call on every login: an
// existing row (including an admin's) is never overwritten or demoted. New
// teachers start owning nothing — granted_grades is empty until an admin
// grants access.
//
// Returns false on failure so callers can decide whether to surface an error.
// Login treats it as best-effort (don't block sign-in); signup does too,
// because login is the backstop that repairs any row that failed to write here.
export async function ensureTeacherProfile(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("teachers").upsert(
    {
      id: userId,
      is_admin: false,
      granted_grades: [],
      access_expires_at: null,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  return !error;
}
