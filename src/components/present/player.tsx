"use client";

// Fullscreen presentation player — the classroom board surface. Keyboard
// (→ ← Space PgUp/PgDn) or the on-screen arrows advance; stepped slides
// (text, expand) reveal internally before moving on. The lesson PenOverlay is
// mounted over every slide (remounted per slide → clean canvas each time) so
// the teacher can annotate anywhere. Escape exits back to the caller.

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import type { Presentation } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import { maxSlideStep } from "@/lib/present/schema";
import { PenOverlay } from "@/components/lesson/pen-overlay";
import { LanguageToggle } from "@/components/language-toggle";
import { SlideView } from "./slide-view";

export function PresentationPlayer({
  presentation,
  onExit,
}: {
  presentation: Presentation;
  onExit: () => void;
}) {
  const { lang } = useT();
  const [pos, setPos] = useState({ index: 0, step: 0 });
  const slides = presentation.slides;
  const slide = slides[pos.index];

  const next = useCallback(() => {
    setPos((p) => {
      const current = slides[p.index];
      if (p.step < maxSlideStep(current)) return { ...p, step: p.step + 1 };
      if (p.index < slides.length - 1) return { index: p.index + 1, step: 0 };
      return p;
    });
  }, [slides]);

  const prev = useCallback(() => {
    setPos((p) => {
      if (p.step > 0) return { ...p, step: p.step - 1 };
      if (p.index > 0) {
        return { index: p.index - 1, step: maxSlideStep(slides[p.index - 1]) };
      }
      return p;
    });
  }, [slides]);

  // Keyboard navigation; ignore keys typed into widget inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onExit]);

  // Lock page scroll while presenting (same trick as the lesson shell).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, []);

  const atStart = pos.index === 0 && pos.step === 0;
  const atEnd =
    pos.index === slides.length - 1 && pos.step >= maxSlideStep(slide);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white text-[#1a1a2e]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[#e5e8ee] bg-[#f8f9fb] px-3">
        <button
          type="button"
          onClick={onExit}
          aria-label={lang === "ru" ? "Выход" : "Шығу"}
          className="grid size-8 place-items-center rounded-lg border border-[#d8dde5] bg-white text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
        >
          <X className="size-4" aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-bold">
          {pickPresentText(presentation.title, lang)}
          {presentation.subtitle && (
            <span className="ml-2 font-normal text-[#6b7280]">
              {pickPresentText(presentation.subtitle, lang)}
            </span>
          )}
        </p>
        <p className="text-sm font-semibold tabular-nums text-[#6b7280]">
          {pos.index + 1} / {slides.length}
        </p>
        <LanguageToggle />
      </div>

      {/* Slide area + pen overlay (fresh canvas per slide). */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <SlideView slide={slide} step={pos.step} lang={lang} />
        <PenOverlay
          key={pos.index}
          lang={lang}
          controlsClassName="right-3 top-3"
        />

        {/* Navigation arrows (above the pen canvas). */}
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-[5] flex items-center justify-between px-4">
          <button
            type="button"
            onClick={prev}
            disabled={atStart}
            aria-label="←"
            className="pointer-events-auto grid size-12 place-items-center rounded-full border-[1.5px] border-[#d8dde5] bg-white/95 text-[#374151] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#2563eb] hover:text-[#2563eb] disabled:opacity-25 disabled:hover:border-[#d8dde5] disabled:hover:text-[#374151]"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={atEnd}
            aria-label="→"
            className="pointer-events-auto grid size-12 place-items-center rounded-full border-[1.5px] border-[#2563eb] bg-[#2563eb] text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)] transition-colors hover:bg-[#1d4ed8] disabled:opacity-25"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 shrink-0 bg-[#e5e8ee]">
        <div
          className="h-full bg-[#2563eb] transition-all duration-300"
          style={{ width: `${((pos.index + 1) / slides.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
