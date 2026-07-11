"use client";

// Universal room entrance: type the 6-character code from the board →
// GET /resolve on the live server → jump into that room's student page with
// the code pre-filled. Deep links (/join?code=ABC123, e.g. from a QR)
// auto-submit once so scanning is zero-tap.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import {
  JoinCodeForm,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
} from "@/components/quiz/join-code-form";
import { resolveCode } from "@/lib/quiz/live-client";
import { useT } from "@/lib/i18n/context";

type JoinError =
  | "join_error_short"
  | "join_error_not_found"
  | "join_error_ended"
  | "join_error_no_link"
  | "join_error_network";

export function JoinClient() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCode = normalizeRoomCode(searchParams.get("code") ?? "");

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<JoinError | null>(null);

  const submit = useCallback(
    async (code: string) => {
      if (code.length !== ROOM_CODE_LENGTH) {
        setError("join_error_short");
        return;
      }
      setError(null);
      setChecking(true);
      const res = await resolveCode(code);
      // Only failure paths clear `checking`: on success we navigate away and
      // the spinner covers the route change.
      if ("error" in res) {
        setChecking(false);
        setError("join_error_network");
        return;
      }
      if (res.status === "not_found") {
        setChecking(false);
        setError("join_error_not_found");
        return;
      }
      if (res.status === "ended") {
        setChecking(false);
        setError("join_error_ended");
        return;
      }
      const path = res.studentPath;
      // Same-site /play pages only — a confused (or compromised) server must
      // not be able to send students anywhere else. Pre-v5 rooms have no path
      // at all; those students join by the teacher's QR as before. The check
      // runs on the browser-NORMALIZED URL, so "/play/../x" and "%2e%2e"
      // tricks can't slip past a raw prefix test.
      let target: URL | null = null;
      if (path) {
        try {
          target = new URL(
            `${path}${path.includes("?") ? "&" : "?"}code=${encodeURIComponent(code)}`,
            window.location.origin,
          );
        } catch {
          target = null;
        }
      }
      if (
        !target ||
        target.origin !== window.location.origin ||
        !target.pathname.startsWith("/play/")
      ) {
        setChecking(false);
        setError("join_error_no_link");
        return;
      }
      // replace, not push: /join (and especially /join?code=) must not stay
      // in history, or Back from the quiz re-runs the auto-submit and bounces
      // the student straight back into the room — a back-button trap.
      router.replace(target.pathname + target.search);
    },
    [router],
  );

  // A QR deep link lands with ?code= — submit it once without a tap.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (autoSubmitted.current || urlCode.length !== ROOM_CODE_LENGTH) return;
    autoSubmitted.current = true;
    void submit(urlCode);
  }, [urlCode, submit]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Deliberately NOT the site header: this is the students' door,
          kahoot-style. Brand as plain text (no link leading away), language
          switch, nothing else — no profile even for signed-in teachers. */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="font-heading text-base font-bold tracking-tight text-primary">
            {t("brand")}
          </span>
          <LanguageToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("join_page_title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("join_page_subtitle")}
          </p>
          <div className="mt-8">
            <JoinCodeForm
              large
              autoFocus
              initialCode={urlCode}
              busy={checking}
              onSubmit={(code) => void submit(code)}
            />
          </div>
          {checking ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("join_checking")}
            </p>
          ) : error ? (
            <p className="mt-4 text-sm font-medium text-red-600" role="alert">
              {t(error)}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
