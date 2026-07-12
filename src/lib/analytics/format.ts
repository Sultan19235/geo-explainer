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

// Kazakh month/weekday names, spelled out by hand: many ICU builds (Node on
// Vercel, even some Chromes) ship without kk locale data, and Intl then falls
// back to "2026 M07 13"-style output — ugly AND different between server and
// client, which breaks hydration. Numeric parts are safe everywhere; names
// come from these tables.
const KZ_MONTHS_SHORT = [
  "қаң",
  "ақп",
  "нау",
  "сәу",
  "мам",
  "мау",
  "шіл",
  "там",
  "қыр",
  "қаз",
  "қар",
  "жел",
];
const KZ_WEEKDAYS = [
  "жексенбі",
  "дүйсенбі",
  "сейсенбі",
  "сәрсенбі",
  "бейсенбі",
  "жұма",
  "сенбі",
];

// The instant's calendar parts in the app time zone, via locale-independent
// numeric formatting (supported by every ICU build).
function almatyParts(date: Date): {
  year: number;
  month: number; // 1-12
  day: number;
  hour: string;
  minute: string;
  weekday: number; // 0 = Sunday, matches Date#getDay
} {
  const get = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIME_ZONE,
      ...options,
    }).format(date);
  const [month, day, year] = get({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).split("/");
  const [hour, minute] = get({
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).split(":");
  const weekday =
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get({ weekday: "short" }),
    ) % 7;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour,
    minute,
    weekday: Math.max(0, weekday),
  };
}

export function formatDateTime(iso: string, lang: Lang): string {
  try {
    if (lang === "ru") {
      return new Intl.DateTimeFormat("ru-RU", {
        timeZone: APP_TIME_ZONE,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    }
    const p = almatyParts(new Date(iso));
    return `${p.day} ${KZ_MONTHS_SHORT[p.month - 1]}, ${p.hour}:${p.minute}`;
  } catch {
    return new Date(iso).toISOString();
  }
}

// Date only ("11 июл 2027 г." / "11 шіл 2027"), for access periods where
// the time of day is noise.
export function formatDate(iso: string, lang: Lang): string {
  try {
    if (lang === "ru") {
      return new Intl.DateTimeFormat("ru-RU", {
        timeZone: APP_TIME_ZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(iso));
    }
    const p = almatyParts(new Date(iso));
    return `${p.day} ${KZ_MONTHS_SHORT[p.month - 1]} ${p.year}`;
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
    if (lang === "ru") {
      return new Intl.DateTimeFormat("ru-RU", {
        timeZone: APP_TIME_ZONE,
        day: "numeric",
        month: "short",
        weekday: "long",
      }).format(date);
    }
    const p = almatyParts(date);
    return `${p.day} ${KZ_MONTHS_SHORT[p.month - 1]}, ${KZ_WEEKDAYS[p.weekday]}`;
  } catch {
    return dayKey;
  }
}

// "11 шіл" / "11 июл" — compact axis tick.
export function formatDayShort(dayKey: string, lang: Lang): string {
  try {
    const date = new Date(`${dayKey}T12:00:00Z`);
    if (lang === "ru") {
      return new Intl.DateTimeFormat("ru-RU", {
        timeZone: APP_TIME_ZONE,
        day: "numeric",
        month: "short",
      }).format(date);
    }
    const p = almatyParts(date);
    return `${p.day} ${KZ_MONTHS_SHORT[p.month - 1]}`;
  } catch {
    return dayKey.slice(5);
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
