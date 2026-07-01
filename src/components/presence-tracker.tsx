"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/context";

// Mounted once in the root layout. While a user is signed in and the tab is
// visible, it pings the heartbeat endpoint so the server can track "last seen"
// (our proxy for session end) and, on the first ping, a lightweight device
// fingerprint used to flag likely account-sharing.
const HEARTBEAT_MS = 45_000;

export function PresenceTracker() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let stopped = false;
    // Sent only on the first successful heartbeat, then cleared — the
    // fingerprint is stable, no need to recompute or resend it every tick.
    let pendingFingerprint: string | null = null;

    const send = () => {
      if (stopped) return;
      const body = pendingFingerprint
        ? JSON.stringify({ fingerprint: pendingFingerprint })
        : "{}";
      fetch("/api/track/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      })
        .then(() => {
          pendingFingerprint = null;
        })
        .catch(() => {
          // network blip — the next tick retries
        });
    };

    computeFingerprint()
      .then((fp) => {
        pendingFingerprint = fp;
        send();
      })
      .catch(() => send());

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") send();
    }, HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);

  return null;
}

// Lightweight, dependency-free device hash. Combines stable browser/hardware
// signals + a canvas draw, SHA-256'd to 32 hex chars. Not anti-fraud grade —
// just stable enough to notice one account logging in from many distinct
// devices. Requires a secure context (https / localhost) for crypto.subtle.
async function computeFingerprint(): Promise<string> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    platform?: string;
  };
  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages || []).join(","),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    nav.platform ?? "",
    String(nav.hardwareConcurrency ?? ""),
    String(nav.deviceMemory ?? ""),
    canvasHash(),
  ];

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(parts.join("|")),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function canvasHash(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("geo-explainer-fp-\u{1F30D}", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("geo-explainer-fp-\u{1F30D}", 4, 17);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}
