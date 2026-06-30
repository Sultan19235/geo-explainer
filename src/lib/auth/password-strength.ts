// Shared, language-agnostic helpers for client + server validation of the
// signup form. Labels for the strength score live in i18n (see STRINGS).

// Pragmatic email check: a single @, non-empty local part, and a dotted domain.
// Server-side Supabase is the source of truth; this just catches typos early.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export const MIN_PASSWORD_LENGTH = 6;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

// Counts how many "strength" criteria a password satisfies. Returns 0-4 so the
// UI can render a 4-segment meter and pick a label.
export function passwordScore(password: string): PasswordScore {
  if (!password) return 0;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // A short password can never read as more than "weak", regardless of variety.
  if (password.length < 8 && score > 1) score = 1;

  return score as PasswordScore;
}
