"use client";

// On-screen keypad for drill answers. Digits and backspace are always
// present; the topic's answer spec enables the extras (comma, minus, π, /) —
// a π key appearing quietly tells the student the expected answer form.
// Unused extra slots render as blanks so the layout never shifts between
// topics. The big bottom-right key is Check while answering and Next during
// feedback, so the thumb never moves on mobile.
//
// Light guards keep input well-formed while typing (one comma, one π, minus
// only at the start); parseExact at submit remains the real gatekeeper.

import { useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DrillKey } from "@/lib/drill/types";

const MAX_LENGTH = 12;

export function canAppend(value: string, glyph: string): boolean {
  if (value.length >= MAX_LENGTH) return false;
  switch (glyph) {
    case ",":
      return (
        /\d$/.test(value) &&
        !value.includes(",") &&
        !value.includes("/") &&
        !value.includes("√")
      );
    case "−":
      return value === "";
    case "π":
      return (
        !value.includes("π") &&
        !value.includes("√") &&
        !value.includes(",") &&
        !value.includes("/")
      );
    case "√":
      // √ starts a radical: at the start, after the sign, or after a whole
      // coefficient (2√3) — never in a denominator, never with a comma.
      return (
        !value.includes("√") &&
        !value.includes("π") &&
        !value.includes(",") &&
        !value.includes("/") &&
        (value === "" || /[−\d]$/.test(value))
      );
    case "/":
      // Needs a digit or π before it — "√3/…" ends with a digit, a bare "√"
      // doesn't, so radicals are complete before the bar.
      return /[\dπ]$/.test(value) && !value.includes("/") && !value.includes(",");
    default: // digit
      return !value.endsWith("π");
  }
}

type PadKey =
  | { glyph: string; need?: DrillKey; kind: "digit" | "extra" }
  | { kind: "backspace" }
  | { kind: "submit" };

const LAYOUT: PadKey[] = [
  { glyph: "7", kind: "digit" },
  { glyph: "8", kind: "digit" },
  { glyph: "9", kind: "digit" },
  { kind: "backspace" },
  { glyph: "4", kind: "digit" },
  { glyph: "5", kind: "digit" },
  { glyph: "6", kind: "digit" },
  { glyph: "π", need: "pi", kind: "extra" },
  { glyph: "1", kind: "digit" },
  { glyph: "2", kind: "digit" },
  { glyph: "3", kind: "digit" },
  { glyph: "/", need: "frac", kind: "extra" },
  { glyph: "−", need: "minus", kind: "extra" },
  { glyph: "0", kind: "digit" },
  { glyph: ",", need: "comma", kind: "extra" },
  { kind: "submit" },
];

export function DrillKeypad({
  keys,
  value,
  onChange,
  onSubmit,
  submitLabel,
  submitMode,
}: {
  keys: DrillKey[];
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  /** "check" while answering, "next" during feedback (keypad glyphs disabled). */
  submitMode: "check" | "next";
}) {
  const answering = submitMode === "check";

  // π and √ share one slot — a topic never needs both in one answer, and a
  // stable 4×4 grid beats a five-column special case.
  const layout: PadKey[] = LAYOUT.map((key) =>
    "need" in key && key.need === "pi" && !keys.includes("pi") && keys.includes("sqrt")
      ? { glyph: "√", need: "sqrt", kind: "extra" }
      : key,
  );

  const press = (glyph: string) => {
    if (!answering || !canAppend(value, glyph)) return;
    onChange(value + glyph);
  };
  const backspace = () => {
    if (answering) onChange(value.slice(0, -1));
  };

  // Physical keyboard for desktop preview/testing; the keypad stays the
  // primary input on phones.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit();
        return;
      }
      if (!answering) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      const glyph =
        /^[0-9]$/.test(e.key) ? e.key
        : e.key === "," || e.key === "." ? ","
        : e.key === "-" ? "−"
        : e.key === "/" ? "/"
        : e.key === "p" || e.key === "π" ? "π"
        : e.key === "s" || e.key === "√" ? "√"
        : null;
      if (!glyph) return;
      const enabled =
        glyph === "," ? keys.includes("comma")
        : glyph === "−" ? keys.includes("minus")
        : glyph === "π" ? keys.includes("pi")
        : glyph === "√" ? keys.includes("sqrt")
        : glyph === "/" ? keys.includes("frac")
        : true;
      if (enabled) {
        e.preventDefault();
        press(glyph);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {layout.map((key, i) => {
        if (key.kind === "backspace") {
          return (
            <button
              key={i}
              type="button"
              onClick={backspace}
              disabled={!answering}
              aria-label="⌫"
              className="grid h-12 place-items-center rounded-xl border-[1.5px] border-border bg-background text-red-600 transition-colors active:bg-accent disabled:opacity-40"
            >
              <Delete className="size-5" aria-hidden />
            </button>
          );
        }
        if (key.kind === "submit") {
          return (
            <button
              key={i}
              type="button"
              onClick={onSubmit}
              className={cn(
                "h-12 rounded-xl text-base font-bold text-white transition-colors",
                submitMode === "check"
                  ? "bg-primary active:bg-primary/85"
                  : "bg-emerald-600 active:bg-emerald-700",
              )}
            >
              {submitLabel}
            </button>
          );
        }
        const enabled = key.kind === "digit" || keys.includes(key.need!);
        if (!enabled) {
          return <div key={i} aria-hidden className="h-12 rounded-xl bg-transparent" />;
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => press(key.glyph)}
            disabled={!answering}
            className={cn(
              "h-12 rounded-xl border-[1.5px] border-border text-lg font-semibold transition-colors active:bg-accent disabled:opacity-40",
              key.kind === "digit"
                ? "bg-card text-foreground"
                : "bg-background text-primary",
            )}
          >
            {key.glyph}
          </button>
        );
      })}
    </div>
  );
}
