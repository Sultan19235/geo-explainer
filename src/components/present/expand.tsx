"use client";

// Expanded-form widget: a number falls apart into разрядтық қосылғыштар.
// Step 0 shows the color-coded number, step 1 reveals the sum form
// (35 749 = 30 000 + 5 000 + 700 + 40 + 9), step 2 the product form
// (= 3 · 10 000 + 5 · 1000 + …). The player's → key drives the steps, so the
// teacher narrates each reveal.

import type { Lang } from "@/lib/i18n/strings";
import type { PresentSlide } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import {
  digitsOf,
  groupDigits,
  placeUnit,
  placeValueOf,
} from "@/lib/present/places";
import { SlideHeading } from "./slide-view";
import { placeColor } from "./place-value";

type Term = { digit: string; place: number };

export function ExpandSlide({
  slide,
  step,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "expand" }>;
  step: number;
  lang: Lang;
}) {
  const digits = digitsOf(slide.number) ?? "0";
  const terms: Term[] = [...digits]
    .map((digit, i) => ({ digit, place: digits.length - 1 - i }))
    .filter((t) => t.digit !== "0");
  const grouped = groupDigits(digits);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1150px] flex-col px-[4vw] py-[3vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />

      <div className="flex flex-1 flex-col items-center justify-center gap-[4.5vh]">
        {/* The number itself, digits colored by place. */}
        <p className="text-[clamp(56px,8vw,120px)] font-bold tracking-wide">
          {(() => {
            let digitIndex = 0;
            return [...grouped].map((ch, j) => {
              if (ch === " ") return <span key={j}> </span>;
              const place = digits.length - 1 - digitIndex;
              digitIndex++;
              return (
                <span
                  key={j}
                  style={{
                    color: ch === "0" ? "#9ca3af" : placeColor(place),
                  }}
                >
                  {ch}
                </span>
              );
            });
          })()}
        </p>

        {step >= 1 && (
          <ExpandLine
            terms={terms}
            render={(t) => placeValueOf(Number(t.digit), t.place)}
          />
        )}

        {step >= 2 && (
          <ExpandLine
            terms={terms}
            render={(t) =>
              t.place === 0 ? t.digit : `${t.digit} · ${placeUnit(t.place)}`
            }
          />
        )}

        {step >= 1 && (
          <p className="text-[clamp(16px,1.5vw,24px)] italic text-[#6b7280]">
            {lang === "ru" ? "разрядные слагаемые" : "разрядтық қосылғыштар"}
          </p>
        )}
      </div>

      {step < 2 && (
        <p className="text-center text-[clamp(14px,1.2vw,20px)] text-[#9ca3af]">
          {lang === "ru" ? "→ дальше" : "→ әрі қарай"}
        </p>
      )}
    </div>
  );
}

function ExpandLine({
  terms,
  render,
}: {
  terms: Term[];
  render: (t: Term) => string;
}) {
  return (
    <p className="flex flex-wrap items-baseline justify-center gap-x-[0.45em] gap-y-2 text-[clamp(30px,3.6vw,56px)] font-bold animate-in fade-in slide-in-from-bottom-3 duration-300">
      <span className="text-[#374151]">=</span>
      {terms.map((t, i) => (
        <span key={i} className="flex items-baseline gap-x-[0.45em]">
          {i > 0 && <span className="text-[#9ca3af]">+</span>}
          <span style={{ color: placeColor(t.place) }}>{render(t)}</span>
        </span>
      ))}
    </p>
  );
}
