import type { useT } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/strings";

// Presentation helpers for the analytics UI. Pure functions that take the
// translate fn + lang so they stay locale-aware without a hook.
type Translate = ReturnType<typeof useT>["t"];

// A teacher whose account has logged in from this many distinct devices is
// flagged as possible account-sharing.
export const SHARING_DEVICE_THRESHOLD = 3;

export function formatDateTime(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "kk-KZ", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
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
