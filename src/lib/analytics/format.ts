import type { useT } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/strings";

// Presentation helpers for the analytics UI. Pure functions that take the
// translate fn + lang so they stay locale-aware without a hook.
type Translate = ReturnType<typeof useT>["t"];

// A teacher whose account has logged in from this many distinct devices is
// flagged as possible account-sharing.
export const SHARING_DEVICE_THRESHOLD = 3;

// A session (or teacher) counts as online if its last heartbeat is fresher
// than this. Heartbeats fire every 45s while the tab is visible, so 3 minutes
// = four missed beats — enough slack for a backgrounded tab or a network blip.
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

// Truthful session status: `ended_at` only exists for explicit logouts, so a
// null ended_at means "active" ONLY while heartbeats are still arriving.
// Everything else was abandoned (tab closed, cookie expired) → "dropped".
// `now` is null during SSR/first client render; callers pass a server-supplied
// timestamp then, so the status is stable across hydration.
export type SessionStatus = "active" | "ended" | "dropped";

export function sessionStatus(
  s: { ended_at: string | null; last_seen_at: string },
  now: number,
): SessionStatus {
  if (s.ended_at) return "ended";
  const lastSeen = new Date(s.last_seen_at).getTime();
  return now - lastSeen < ONLINE_THRESHOLD_MS ? "active" : "dropped";
}

export function isOnline(lastSeenIso: string | null, now: number): boolean {
  if (!lastSeenIso) return false;
  return now - new Date(lastSeenIso).getTime() < ONLINE_THRESHOLD_MS;
}

// Pin all absolute timestamps to Kazakhstan time (UTC+5). This is a Kazakh
// product, so admins/teachers read these in local time — but it's also load-
// bearing for correctness: a fixed timeZone makes formatDateTime produce the
// same string on the server (UTC on Vercel) and in the browser, avoiding a
// React hydration mismatch on the SSR'd analytics timestamps.
const APP_TIME_ZONE = "Asia/Almaty";

export function formatDateTime(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "kk-KZ", {
      timeZone: APP_TIME_ZONE,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

// Date only ("11 июл 2027 г." / "11 шіл 2027 ж."), for access periods where
// the time of day is noise.
export function formatDate(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "kk-KZ", {
      timeZone: APP_TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// Time-of-day only, for the compact end of a "start – end" range where the
// date half is already on screen.
export function formatTime(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "kk-KZ", {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

// The Almaty calendar day (YYYY-MM-DD) an instant falls on. Used server-side
// to bucket sparkline days and client-side to group the activity log — both
// pin to APP_TIME_ZONE so day boundaries agree everywhere.
export function almatyDayKey(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// "11 шіл, жұма" / "11 июл, пятница" — header for a day group / sparkline bar.
export function formatDayLabel(dayKey: string, lang: Lang): string {
  try {
    // Anchor to noon UTC so the label never slides to a neighbor day when the
    // date-only string is re-interpreted in APP_TIME_ZONE (UTC+5).
    const date = new Date(`${dayKey}T12:00:00Z`);
    return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "kk-KZ", {
      timeZone: APP_TIME_ZONE,
      day: "numeric",
      month: "short",
      weekday: "long",
    }).format(date);
  } catch {
    return dayKey;
  }
}

// Relative "last active" label. `now` is null during SSR / first client render
// (so server and client output match), then set on mount — at which point this
// switches from an absolute timestamp to a live relative label.
export function formatLastSeen(
  iso: string | null,
  t: Translate,
  lang: Lang,
  now: number | null,
): string {
  if (!iso) return t("ua_never");
  if (now === null) return formatDateTime(iso, lang);

  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t("ua_ago_now");
  if (minutes < 60) return t("ua_ago_min")(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("ua_ago_hour")(hours);
  return t("ua_ago_day")(Math.floor(hours / 24));
}

export function formatDuration(
  startIso: string,
  endIso: string,
  t: Translate,
): string {
  const total = Math.max(
    0,
    Math.round(
      (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
    ),
  );
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return t("ua_minutes")(minutes);
  if (minutes === 0) return t("ua_hours")(hours);
  return `${t("ua_hours")(hours)} ${t("ua_minutes")(minutes)}`;
}
