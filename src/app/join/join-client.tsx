"use client";

// Universal room entrance: type the 6-character code from the board →
// GET /resolve on the live server → jump into that room's student page with
// the code pre-filled. Deep links (/join?code=ABC123, e.g. from a QR)
// auto-submit once so scanning is zero-tap.
//
// This is the students' door — mostly kids on phones — so it's deliberately
// playful: a math-doodle playground behind a big friendly card with a
// Kahoot-style segmented code input. The resolve/submit flow and its
// same-origin /play guard are unchanged from the plain version.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ROOM_CODE_LENGTH, normalizeRoomCode } from "@/components/quiz/join-code-form";
import { resolveCode } from "@/lib/quiz/live-client";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

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

  const [code, setCode] = useState(urlCode);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<JoinError | null>(null);
  const [tooShort, setTooShort] = useState(false);

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

  const handleSubmit = () => {
    if (checking || code.length === 0) return;
    if (code.length < ROOM_CODE_LENGTH) {
      setTooShort(true);
      return;
    }
    void submit(code);
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <PlaygroundBackdrop />

      {/* Deliberately NOT the site header: this is the students' door,
          kahoot-style. Brand as plain text (no link leading away), language
          switch, nothing else — no profile even for signed-in teachers. */}
      <header className="relative z-10">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="font-heading text-base font-bold tracking-tight text-primary">
            {t("brand")}
          </span>
          <LanguageToggle />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-10">
        <div className="join-rise w-full max-w-md">
          <div className="relative rounded-[2rem] border border-white/70 bg-card/85 p-7 text-center shadow-[0_24px_70px_-24px_rgba(34,69,195,0.45)] backdrop-blur-xl sm:p-9">
            {/* Friendly greeter badge floating over the card's top edge. */}
            <div className="mx-auto -mt-16 mb-5 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-pen-blue text-4xl shadow-lg shadow-primary/30 ring-4 ring-card">
              <span className="join-doodle" style={{ ["--join-dur" as string]: "4s" }}>
                🚀
              </span>
            </div>

            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              {t("join_page_title")}
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground sm:text-base">
              {t("join_page_subtitle")}
            </p>

            <form
              className="mt-7"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <CodeSlots
                value={code}
                busy={checking}
                autoFocus
                onChange={(next) => {
                  setCode(next);
                  setTooShort(false);
                  setError(null);
                }}
              />

              <button
                type="submit"
                disabled={checking || code.length === 0}
                className={cn(
                  "group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-pen-blue px-6 py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30 transition",
                  "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 active:translate-y-0",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0",
                )}
              >
                {checking ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <>
                    {t("join_button")}
                    <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
                  </>
                )}
              </button>
            </form>

            <div aria-live="polite" className="min-h-6">
              {checking ? (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("join_checking")}
                </p>
              ) : tooShort ? (
                <p className="mt-4 text-sm font-semibold text-destructive" role="alert">
                  {t("join_error_short")}
                </p>
              ) : error ? (
                <p className="mt-4 text-sm font-semibold text-destructive" role="alert">
                  {t(error)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Kahoot-style PIN: one transparent input drives six big character slots.
// Filling the sixth slot doesn't auto-submit (kids often fix a typo on the
// last digit) — they still tap the button, which is the affirmative action.
function CodeSlots({
  value,
  busy,
  autoFocus,
  onChange,
}: {
  value: string;
  busy: boolean;
  autoFocus?: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const slots = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => value[i] ?? "");
  const caret = focused && value.length < ROOM_CODE_LENGTH ? value.length : -1;

  return (
    <div
      className="relative"
      onClick={() => inputRef.current?.focus()}
      role="presentation"
    >
      <input
        ref={inputRef}
        value={value}
        inputMode="text"
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-label={t("join_code_label")}
        disabled={busy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(normalizeRoomCode(e.target.value))}
        // The real input sits invisible on top of the slots so taps focus it
        // and the OS keyboard appears; the slots below are the visible UI.
        className="absolute inset-0 z-10 h-full w-full cursor-pointer text-transparent caret-transparent opacity-0 outline-none"
      />
      <div className="flex justify-center gap-1.5 sm:gap-2.5">
        {slots.map((ch, i) => {
          const isActive = i === caret;
          return (
            <div
              key={i}
              className={cn(
                "flex h-14 w-11 items-center justify-center rounded-xl border-2 font-mono text-2xl font-bold uppercase transition-colors sm:h-16 sm:w-12 sm:text-3xl",
                ch
                  ? "border-primary bg-accent text-primary"
                  : "border-input bg-secondary/60 text-muted-foreground",
                isActive && "join-slot-active border-primary bg-card",
              )}
            >
              {ch || (isActive ? <span className="text-primary/40">|</span> : "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A soft playground of drifting math doodles behind the card. Purely
// decorative (aria-hidden) and quiet under prefers-reduced-motion.
function PlaygroundBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Soft brand-tinted wash. */}
      <div className="absolute inset-0 bg-gradient-to-b from-accent/70 via-background to-pen-green-soft/50" />
      <div className="absolute -left-24 -top-24 size-80 rounded-full bg-pen-blue/10 blur-3xl" />
      <div className="absolute -right-24 top-1/3 size-80 rounded-full bg-pen-green/10 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 size-72 rounded-full bg-sun-bright/10 blur-3xl" />

      {DOODLES.map((d, i) => (
        <span
          key={i}
          className="join-doodle absolute select-none font-heading font-bold"
          style={{
            left: d.left,
            top: d.top,
            fontSize: d.size,
            color: d.color,
            opacity: d.opacity,
            ["--join-dur" as string]: d.dur,
            ["--join-delay" as string]: d.delay,
            ["--join-rot" as string]: d.rot,
          }}
        >
          {d.glyph}
        </span>
      ))}
    </div>
  );
}

const DOODLES = [
  { glyph: "π", left: "8%", top: "18%", size: "3.5rem", color: "var(--pen-blue)", opacity: 0.16, dur: "10s", delay: "0s", rot: "-8deg" },
  { glyph: "√", left: "84%", top: "14%", size: "4rem", color: "var(--pen-green)", opacity: 0.16, dur: "12s", delay: "0.6s", rot: "10deg" },
  { glyph: "x²", left: "16%", top: "70%", size: "3rem", color: "var(--pen-red)", opacity: 0.14, dur: "11s", delay: "1.2s", rot: "6deg" },
  { glyph: "∑", left: "78%", top: "72%", size: "3.5rem", color: "var(--primary)", opacity: 0.14, dur: "9s", delay: "0.3s", rot: "-6deg" },
  { glyph: "+", left: "46%", top: "10%", size: "2.5rem", color: "var(--pen-green)", opacity: 0.16, dur: "8s", delay: "0.9s", rot: "0deg" },
  { glyph: "△", left: "6%", top: "46%", size: "2.75rem", color: "var(--sun-bright)", opacity: 0.22, dur: "13s", delay: "0.2s", rot: "4deg" },
  { glyph: "∞", left: "90%", top: "48%", size: "3rem", color: "var(--pen-blue)", opacity: 0.14, dur: "10.5s", delay: "1.5s", rot: "-4deg" },
  { glyph: "÷", left: "34%", top: "84%", size: "2.5rem", color: "var(--pen-red)", opacity: 0.14, dur: "9.5s", delay: "0.5s", rot: "8deg" },
  { glyph: "○", left: "62%", top: "88%", size: "2.75rem", color: "var(--pen-green)", opacity: 0.16, dur: "11.5s", delay: "1s", rot: "0deg" },
];
