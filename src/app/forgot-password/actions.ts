"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureTeacherProfile } from "@/lib/auth/ensure-teacher-profile";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-strength";

export type ResetRequestState = {
  error?: string;
  ok?: boolean;
  email?: string;
};

// Step 1: email the teacher a 6-digit recovery code. Mirrors the signup OTP
// flow; the "Reset Password" email template must emit {{ .Token }}.
export async function requestPasswordReset(
  _prevState: ResetRequestState | undefined,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !isValidEmail(email)) {
    return { error: "Жарамды электрондық пошта енгізіңіз." };
  }

  const supabase = await createClient();
  // Anti-enumeration: Supabase never reveals whether the email exists, so we
  // always advance to the code-entry step regardless of the outcome.
  await supabase.auth.resetPasswordForEmail(email);

  return { ok: true, email };
}

export type ResetState = { error?: string };

// Step 2: verify the recovery code (which opens a session) and set the new
// password in one shot.
export async function resetPassword(
  _prevState: ResetState | undefined,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").replace(/\D/g, "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || token.length !== 6) {
    return { error: "Код қате немесе мерзімі өтіп кеткен." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Құпиясөз кемінде ${MIN_PASSWORD_LENGTH} таңбадан тұруы керек.`,
    };
  }
  if (password !== confirm) {
    return { error: "Құпиясөздер сәйкес келмейді." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });

  if (error || !data.user) {
    return { error: "Код қате немесе мерзімі өтіп кеткен." };
  }

  // A session now exists; update the password within it.
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { error: updateError.message };
  }

  // Self-heal the profile, same backstop as login/signup.
  await ensureTeacherProfile(data.user.id, { email });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type ResendState = { error?: string; sent?: boolean };

export async function resendResetCode(
  _prevState: ResendState | undefined,
  formData: FormData,
): Promise<ResendState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !isValidEmail(email)) {
    return { error: "Жарамды электрондық пошта енгізіңіз." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);
  return { sent: true };
}
