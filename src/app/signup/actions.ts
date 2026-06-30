"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureTeacherProfile } from "@/lib/auth/ensure-teacher-profile";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-strength";

export async function signup(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !password) {
    return { error: "Электрондық пошта мен құпиясөзді енгізіңіз." };
  }
  if (!isValidEmail(email)) {
    return { error: "Жарамды электрондық пошта енгізіңіз." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Құпиясөз кемінде 6 таңбадан тұруы керек." };
  }
  if (password !== confirm) {
    return { error: "Құпиясөздер сәйкес келмейді." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Best-effort: create the teachers profile now. If it fails, the user's next
  // login repairs it (see ensureTeacherProfile + login action), so we don't
  // block signup on it.
  if (data.user) {
    await ensureTeacherProfile(data.user.id);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
