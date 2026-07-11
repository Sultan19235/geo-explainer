"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureTeacherProfile } from "@/lib/auth/ensure-teacher-profile";
import { startLoginSession } from "@/lib/analytics/track";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-strength";

export type SignupState = {
  error?: string;
  ok?: boolean;
  email?: string;
  fullName?: string;
};

export async function signup(
  _prevState: SignupState | undefined,
  formData: FormData,
): Promise<SignupState> {
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const gender = String(formData.get("gender") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  if (!firstName || !lastName) {
    return { error: "Атыңыз бен тегіңізді енгізіңіз." };
  }
  if (gender !== "male" && gender !== "female") {
    return { error: "Жынысыңызды таңдаңыз." };
  }
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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // gender lives in user_metadata (like full_name); it only picks the
    // profile avatar.
    options: { data: { full_name: fullName, gender } },
  });

  if (error) {
    return { error: error.message };
  }

  // Supabase does not error on an already-registered email (anti-enumeration);
  // instead it returns a user with an empty `identities` array and sends no
  // confirmation code. Detect that and tell the user the email is taken.
  if (!data.user || (data.user.identities?.length ?? 0) === 0) {
    return { error: "Бұл электрондық пошта тіркелген. Кіріңіз." };
  }

  // Supabase emailed a 6-digit confirmation code. Switch the UI to the
  // code-entry step; the teacher profile is created after the code verifies.
  return { ok: true, email, fullName };
}

export type VerifyState = { error?: string };

export async function verifyOtp(
  _prevState: VerifyState | undefined,
  formData: FormData,
): Promise<VerifyState> {
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const token = String(formData.get("token") ?? "").replace(/\D/g, "");

  if (!email || token.length !== 6) {
    return { error: "Код қате немесе мерзімі өтіп кеткен." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error || !data.user) {
    return { error: "Код қате немесе мерзімі өтіп кеткен." };
  }

  // The account is confirmed and a session now exists. Best-effort profile
  // creation; the next login repairs it if this fails (see ensureTeacherProfile).
  await ensureTeacherProfile(data.user.id, { fullName, email });
  await startLoginSession(data.user.id, "signup");

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type ResendState = { error?: string; sent?: boolean };

export async function resendOtp(
  _prevState: ResendState | undefined,
  formData: FormData,
): Promise<ResendState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !isValidEmail(email)) {
    return { error: "Жарамды электрондық пошта енгізіңіз." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    return { error: error.message };
  }
  return { sent: true };
}
