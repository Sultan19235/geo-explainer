"use client";

// Oral-arithmetic warm-up grid ("Ауызша есептеңдер"). Cards show expressions;
// the class answers out loud, the teacher clicks to reveal (click again to
// hide). A reset button covers everything back up for a second run.

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Lang } from "@/lib/i18n/strings";
import type { PresentSlide } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import { MathText } from "@/components/quiz/math-text";
import { cn } from "@/lib/utils";
import { SlideHeading } from "./slide-view";

export function OralSlide({
  slide,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "oral" }>;
  lang: Lang;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const columns = slide.items.length <= 8 ? 2 : slide.items.length <= 12 ? 3 : 4;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1250px] flex-col px-[3vw] py-[3vh]">
      <div className="flex items-start justify-between gap-4">
        <SlideHeading text={pickPresentText(slide.heading, lang)} />
        {revealed.size > 0 && (
          <button
            type="button"
            onClick={() => setRevealed(new Set())}
            className="flex items-center gap-2 rounded-lg border-[1.5px] border-[#d8dde5] bg-white px-3 py-1.5 text-[clamp(13px,1.1vw,17px)] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
          >
            <RotateCcw className="size-[1em]" aria-hidden />
            {lang === "ru" ? "Скрыть все" : "Барлығын жабу"}
          </button>
        )}
      </div>

      <div
        className="grid flex-1 content-center gap-[1.2vw]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {slide.items.map((item, i) => {
          const isRevealed = revealed.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className={cn(
                "flex min-h-[clamp(72px,11vh,120px)] items-center justify-center gap-[0.4em] rounded-2xl border-[2.5px] bg-white px-4 py-3 text-[clamp(24px,2.6vw,42px)] font-bold transition-colors",
                isRevealed
                  ? "border-[#059669]"
                  : "border-[#d8dde5] hover:border-[#9ca3af]",
              )}
            >
              <span className="text-[#1a1a2e]">
                <MathText text={item.q} />
              </span>
              <span
                className={cn(
                  "text-[#059669]",
                  isRevealed
                    ? "animate-in fade-in zoom-in-95 duration-200"
                    : "hidden",
                )}
              >
                = <MathText text={item.a} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
