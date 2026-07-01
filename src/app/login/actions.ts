"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureTeacherProfile } from "@/lib/auth/ensure-teacher-profile";
import { startLoginSession } from "@/lib/analytics/track";

export async function login(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Электрондық пошта мен құпиясөзді енгізіңіз." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Localize the common auth failures; anything rarer (rate limit, config)
    // falls through with Supabase's own message.
    if (error.code === "invalid_credentials") {
      return { error: "Электрондық пошта немесе құпиясөз қате." };
    }
    if (error.code === "email_not_confirmed") {
      return {
        error: "Электрондық пошта расталмаған. Алдымен поштаңызды растаңыз.",
      };
    }
    return { error: error.message };
  }

  // Self-heal: guarantee a teachers profile exists on every login. This is the
  // backstop for any row that failed to write at signup time. Best-effort —
  // don't block sign-in if it fails.
  if (data.user) {
    await ensureTeacherProfile(data.user.id);
    await startLoginSession(data.user.id, "password");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
