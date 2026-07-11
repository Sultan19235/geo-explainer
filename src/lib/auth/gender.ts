// Gender lives in Supabase auth user_metadata (like full_name), not in the
// teachers table — no migration needed, and it is only used to pick the
// profile avatar. Google sign-ups skip the signup form, so null is a normal
// long-lived state; the dashboard offers a picker.
export type Gender = "male" | "female";

export function parseGender(value: unknown): Gender | null {
  return value === "male" || value === "female" ? value : null;
}
