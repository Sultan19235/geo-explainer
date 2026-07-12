// Shared, language-agnostic helpers for client + server validation of the
// signup form. Labels for the strength score live in i18n (see STRINGS).

// Pragmatic email check: a single @, non-empty local part, and a dotted domain.
// Server-side Supabase is the source of truth; this just catches typos early.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// Raised from 6 (2026-07 security audit): accounts now hold paid access.
// Must match the Supabase dashboard's Auth min-password setting.
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

// The four criteria that make up a strong password. `key` maps to an i18n
// string so the UI can render a labelled checklist.
export type PasswordRule = "length" | "case" | "number" | "symbol";

export function passwordChecks(password: string): Record<PasswordRule, boolean> {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    case: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

// Counts how many "strength" criteria a password satisfies. Returns 0-4 so the
// UI can render a 4-segment meter and pick a label.
export function passwordScore(password: string): PasswordScore {
  if (!password) return 0;

  const checks = passwordChecks(password);
  let score = Object.values(checks).filter(Boolean).length;

  // A short password can never read as more than "weak", regardless of variety.
  if (!checks.length && score > 1) score = 1;

  return score as PasswordScore;
}
