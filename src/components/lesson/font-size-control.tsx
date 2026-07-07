"use client";

// A− / A+ control for the lesson text size. Drives the --lesson-scale CSS
// variable (all lesson text is em-based on top of it), so theory sections,
// problem statements and walkthrough steps scale together — for pupils in
// the back rows. The chosen level persists per device.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";

export const FONT_SCALES = [0.9, 1, 1.15, 1.3, 1.5] as const;
export const FONT_SCALE_DEFAULT_INDEX = 1;
const STORAGE_KEY = "lesson-font-scale";

export function useLessonFontScale() {
  const [index, setIndex] = useState(FONT_SCALE_DEFAULT_INDEX);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return;
    const stored = Number(raw);
    if (Number.isInteger(stored) && stored >= 0 && stored < FONT_SCALES.length) {
      setIndex(stored);
    }
  }, []);

  const change = (next: number) => {
    const clamped = Math.min(FONT_SCALES.length - 1, Math.max(0, next));
    setIndex(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
  };

  return { index, scale: FONT_SCALES[index], change };
}

export function FontSizeControl({
  index,
  onChange,
  lang,
  className,
}: {
  index: number;
  onChange: (index: number) => void;
  lang: Lang;
  className?: string;
}) {
  const button =
    "grid h-8 w-9 place-items-center font-bold text-[#6b7280] transition-colors enabled:hover:bg-[#eef1f5] enabled:hover:text-[#1a1a2e] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center overflow-hidden rounded-md border-[1.5px] border-[#d8dde5] bg-white",
        className,
      )}
      role="group"
      aria-label={lang === "ru" ? "Размер текста" : "Мәтін өлшемі"}
    >
      <button
        type="button"
        onClick={() => onChange(index - 1)}
        disabled={index <= 0}
        className={cn(button, "text-[12px]")}
        aria-label={lang === "ru" ? "Мельче" : "Кішірейту"}
      >
        A−
      </button>
      <div className="h-5 w-px bg-[#d8dde5]" />
      <button
        type="button"
        onClick={() => onChange(index + 1)}
        disabled={index >= FONT_SCALES.length - 1}
        className={cn(button, "text-[15px]")}
        aria-label={lang === "ru" ? "Крупнее" : "Үлкейту"}
      >
        A+
      </button>
    </div>
  );
}
