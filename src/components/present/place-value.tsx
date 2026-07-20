"use client";

// Place-value widgets.
//
// PlaceValueSlide — one big number; the teacher clicks a digit and the widget
// names its place (разряд) and shows its value: 7 → жүздік, 7 · 100 = 700.
//
// DigitMeaningSlide — the same digit sitting in several numbers; clicking a
// number reveals what the digit means there. The punchline (a positional
// system) appears as a rule box once every number has been revealed.

import { useState } from "react";
import type { Lang } from "@/lib/i18n/strings";
import type { PresentSlide } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import {
  digitsOf,
  groupDigits,
  placeName,
  placeUnit,
  placeValueOf,
} from "@/lib/present/places";
import { MathText } from "@/components/quiz/math-text";
import { cn } from "@/lib/utils";
import { SlideHeading } from "./slide-view";

/** Per-place accent colors, shared with the expand widget (place 0 first). */
export const PLACE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
];

export function placeColor(place: number): string {
  return PLACE_COLORS[place % PLACE_COLORS.length];
}

export function PlaceValueSlide({
  slide,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "place-value" }>;
  lang: Lang;
}) {
  const digits = digitsOf(slide.number) ?? "0";
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1150px] flex-col px-[4vw] py-[3vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />

      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="mb-[2.5vh] text-[clamp(18px,1.7vw,26px)] text-[#6b7280]">
          {lang === "ru" ? "Нажми на цифру" : "Цифрды бас"}
        </p>

        <div className="flex items-center">
          {[...digits].map((digit, i) => {
            const place = digits.length - 1 - i;
            const groupGap = place % 3 === 2 && i !== 0;
            const active = selected === place;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(active ? null : place)}
                className={cn(
                  "grid h-[clamp(80px,12vw,150px)] w-[clamp(58px,8.5vw,110px)] place-items-center rounded-2xl border-[3px] bg-white text-[clamp(48px,7vw,96px)] font-bold transition-all",
                  groupGap ? "ml-[clamp(14px,1.6vw,28px)]" : "ml-[clamp(4px,0.5vw,8px)]",
                  active
                    ? "-translate-y-2 shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
                    : "border-[#d8dde5] text-[#1a1a2e] hover:border-[#9ca3af]",
                )}
                style={
                  active
                    ? { borderColor: placeColor(place), color: placeColor(place) }
                    : undefined
                }
              >
                {digit}
              </button>
            );
          })}
        </div>

        <div className="mt-[4vh] min-h-[clamp(90px,14vh,140px)] text-center">
          {selected !== null && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
              <p
                className="text-[clamp(30px,3.4vw,52px)] font-bold"
                style={{ color: placeColor(selected) }}
              >
                {digits[digits.length - 1 - selected]} —{" "}
                {placeName(selected, lang)}
              </p>
              {selected > 0 && (
                <p className="mt-2 text-[clamp(24px,2.6vw,40px)] text-[#374151]">
                  {digits[digits.length - 1 - selected]} · {placeUnit(selected)}{" "}
                  ={" "}
                  <span className="font-bold">
                    {placeValueOf(
                      Number(digits[digits.length - 1 - selected]),
                      selected,
                    )}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {slide.note && (
        <p className="text-center text-[clamp(16px,1.5vw,24px)] text-[#6b7280]">
          <MathText text={pickPresentText(slide.note, lang)} />
        </p>
      )}
    </div>
  );
}

export function DigitMeaningSlide({
  slide,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "digit-meaning" }>;
  lang: Lang;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const numbers = slide.numbers
    .map((n) => digitsOf(n))
    .filter((n): n is string => n !== null);
  const allRevealed = revealed.size === numbers.length;

  const reveal = (i: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1150px] flex-col px-[4vw] py-[3vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[2.2vh] overflow-y-auto">
        {numbers.map((digits, i) => {
          const isRevealed = revealed.has(i);
          const targetIndex = digits.indexOf(String(slide.digit));
          const place = digits.length - 1 - targetIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => reveal(i)}
              className={cn(
                "flex shrink-0 flex-wrap items-baseline justify-center gap-x-[1.2em] gap-y-1 rounded-2xl border-[2.5px] bg-white px-[1.2em] py-[0.5em] text-[clamp(32px,4.2vw,60px)] font-bold transition-colors",
                isRevealed
                  ? "cursor-default"
                  : "border-[#d8dde5] hover:border-[#9ca3af]",
              )}
              style={isRevealed ? { borderColor: placeColor(place) } : undefined}
            >
              <span className="tracking-wide text-[#1a1a2e]">
                {[...groupDigits(digits)].map((ch, j) => (
                  <span
                    key={j}
                    style={
                      isRevealed &&
                      ch === String(slide.digit) &&
                      groupDigits(digits).indexOf(String(slide.digit)) === j
                        ? { color: placeColor(place) }
                        : undefined
                    }
                  >
                    {ch}
                  </span>
                ))}
              </span>
              {isRevealed && (
                <span
                  className="text-[0.55em] font-bold animate-in fade-in slide-in-from-left-2 duration-200"
                  style={{ color: placeColor(place) }}
                >
                  {slide.digit} — {placeName(place, lang)}
                  {place > 0 && (
                    <span className="text-[#6b7280]">
                      {" "}
                      (= {placeValueOf(slide.digit, place)})
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}

        {slide.note && allRevealed && (
          <div className="mt-[1vh] max-w-[26em] shrink-0 rounded-r-xl border-l-[6px] border-[#2563eb] bg-[#eaf2fe] px-[1em] py-[0.7em] text-[clamp(18px,1.9vw,28px)] font-semibold text-[#1e3a8a] animate-in fade-in slide-in-from-bottom-2 duration-300">
            <MathText text={pickPresentText(slide.note, lang)} />
          </div>
        )}
      </div>
    </div>
  );
}
