import { headers } from "next/headers";

// Server-side request metadata for a login session: the client IP and a coarse
// device profile parsed from the User-Agent. This is the "device info for
// everyone" half of tracking; the finer device hash is computed client-side
// (see PresenceTracker) because it needs canvas/screen APIs.

export type DeviceInfo = {
  browser: string | null;
  os: string | null;
  deviceType: "mobile" | "tablet" | "desktop" | null;
};

export type RequestInfo = DeviceInfo & {
  ip: string | null;
  userAgent: string | null;
};

export async function getRequestInfo(): Promise<RequestInfo> {
  const h = await headers();
  const userAgent = h.get("user-agent");
  return {
    ip: clientIp(h.get("x-forwarded-for"), h.get("x-real-ip")),
    userAgent,
    ...parseUserAgent(userAgent),
  };
}

// The real client is the FIRST entry in x-forwarded-for (proxies append their
// own IPs after it). Reliable on Vercel; needs a trusted proxy chain if
// self-hosted behind nginx. Falls back to x-real-ip.
function clientIp(
  forwardedFor: string | null,
  realIp: string | null,
): string | null {
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return realIp?.trim() || null;
}

// Minimal hand-rolled UA parsing — no dependency. Good enough to read
// "logged in from iPhone Safari" at a glance; not meant to be exhaustive.
// Order matters: Edge/Opera/Samsung spoof Chrome, so test them first.
export function parseUserAgent(ua: string | null): DeviceInfo {
  if (!ua) return { browser: null, os: null, deviceType: null };

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;

  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /(iPhone|iPad|iPod)/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;

  const deviceType = /iPad|Tablet/.test(ua)
    ? "tablet"
    : /Mobi|Android|iPhone|iPod/.test(ua)
      ? "mobile"
      : "desktop";

  return { browser, os, deviceType };
}
