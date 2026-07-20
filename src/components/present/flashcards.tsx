"use client";

// Hands-up flashcards: a big card the whole class can read from the back row.
// The class votes (hands up), the teacher clicks the card to reveal the
// verdict (ИӘ/ЖОҚ) and an optional explanation, then steps to the next card
// with the on-screen arrows. Navigation between cards is internal — the
// player's arrow keys move whole slides.

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Lang } from "@/lib/i18n/strings";
import type { PresentSlide } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import { MathText } from "@/components/quiz/math-text";
import { cn } from "@/lib/utils";
import { SlideHeading } from "./slide-view";

export function FlashcardsSlide({
  slide,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "flashcards" }>;
  lang: Lang;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const card = slide.cards[index];

  const go = (next: number) => {
    if (next < 0 || next >= slide.cards.length) return;
    setIndex(next);
    setRevealed(false);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1150px] flex-col px-[4vw] py-[3vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />
      {slide.prompt && (
        <p className="text-center text-[clamp(24px,2.6vw,40px)] font-semibold text-[#1a1a2e]">
          <MathText text={pickPresentText(slide.prompt, lang)} />
        </p>
      )}

      <div className="flex flex-1 items-center justify-center gap-[2vw]">
        <NavButton
          dir="prev"
          disabled={index === 0}
          onClick={() => go(index - 1)}
          lang={lang}
        />

        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className={cn(
            "flex min-h-[46vh] w-[min(58vw,700px)] flex-col items-center justify-center rounded-3xl border-[3px] bg-white px-8 py-10 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-colors",
            revealed && card.verdict === "yes" && "border-[#059669]",
            revealed && card.verdict === "no" && "border-[#dc2626]",
            (!revealed || card.verdict === undefined) && "border-[#d8dde5]",
          )}
        >
          <span className="text-[clamp(56px,8vw,128px)] font-bold leading-tight text-[#1a1a2e]">
            <MathText text={pickPresentText(card.front, lang)} />
          </span>

          {revealed ? (
            <span className="mt-[0.5em] flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
              {card.verdict !== undefined && (
                <span
                  className={cn(
                    "text-[clamp(32px,4vw,56px)] font-bold",
                    card.verdict === "yes" ? "text-[#059669]" : "text-[#dc2626]",
                  )}
                >
                  {card.verdict === "yes"
                    ? lang === "ru"
                      ? "ДА"
                      : "ИӘ"
                    : lang === "ru"
                      ? "НЕТ"
                      : "ЖОҚ"}
                </span>
              )}
              {card.answer && (
                <span className="max-w-[18em] text-[clamp(18px,1.8vw,28px)] text-[#374151]">
                  <MathText text={pickPresentText(card.answer, lang)} />
                </span>
              )}
            </span>
          ) : (
            <span className="mt-[1em] text-[clamp(15px,1.3vw,22px)] text-[#9ca3af]">
              {lang === "ru" ? "Нажми, чтобы открыть ответ" : "Жауапты ашу үшін бас"}
            </span>
          )}
        </button>

        <NavButton
          dir="next"
          disabled={index === slide.cards.length - 1}
          onClick={() => go(index + 1)}
          lang={lang}
        />
      </div>

      <p className="text-center text-[clamp(16px,1.4vw,22px)] font-semibold text-[#6b7280]">
        {index + 1} / {slide.cards.length}
      </p>
    </div>
  );
}

function NavButton({
  dir,
  disabled,
  onClick,
  lang,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  lang: Lang;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={
        dir === "prev"
          ? lang === "ru"
            ? "Предыдущая карточка"
            : "Алдыңғы карточка"
          : lang === "ru"
            ? "Следующая карточка"
            : "Келесі карточка"
      }
      className="grid size-[clamp(48px,4.5vw,72px)] place-items-center rounded-full border-[1.5px] border-[#d8dde5] bg-white text-[#374151] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#2563eb] hover:text-[#2563eb] disabled:opacity-30 disabled:hover:border-[#d8dde5] disabled:hover:text-[#374151]"
    >
      {dir === "prev" ? (
        <ChevronLeft className="size-[55%]" aria-hidden />
      ) : (
        <ChevronRight className="size-[55%]" aria-hidden />
      )}
    </button>
  );
}
