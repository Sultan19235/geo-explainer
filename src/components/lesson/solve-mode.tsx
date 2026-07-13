"use client";

// Teaching-style modes for the problem player — how much of the written
// solution shows next to the model. "full" is today's complete walkthrough;
// "compact" keeps only titles, given/find boxes, formulas and answers (the
// teacher narrates the prose); "board" replaces the walkthrough with a
// drawable whiteboard (the teacher writes the solution themselves). The
// choice is a per-device preference shared by every lesson.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import { pickText, type Localized } from "@/lib/lesson/types";

export type SolveMode = "full" | "compact" | "board";

const MODES: { id: SolveMode; label: Localized }[] = [
  { id: "full", label: { kz: "Толық", ru: "Подробно" } },
  { id: "compact", label: { kz: "Қысқаша", ru: "Кратко" } },
  { id: "board", label: { kz: "Тақта", ru: "Доска" } },
];

const STORAGE_KEY = "lesson-solve-mode";

function isSolveMode(value: string | null): value is SolveMode {
  return value === "full" || value === "compact" || value === "board";
}

export function useSolveMode(): [SolveMode, (mode: SolveMode) => void] {
  const [mode, setMode] = useState<SolveMode>("full");

  // Stored preference is applied after mount so SSR and the first client
  // render agree.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSolveMode(stored)) setMode(stored);
  }, []);

  const change = (next: SolveMode) => {
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return [mode, change];
}

export function SolveModeTabs({
  mode,
  onChange,
  lang,
}: {
  mode: SolveMode;
  onChange: (mode: SolveMode) => void;
  lang: Lang;
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-[#d8dde5] bg-[#f8f9fb] p-0.5">
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={mode === id}
          className={cn(
            "rounded-[5px] px-3 py-1 text-xs font-semibold transition-colors",
            mode === id
              ? "bg-[#2563eb] text-white shadow-sm"
              : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {pickText(label, lang)}
        </button>
      ))}
    </div>
  );
}
