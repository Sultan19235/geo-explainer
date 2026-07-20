"use client";

// Word problem worked out with the class. The story sits on top, the ray
// picture of it in the middle (same drawing surface as the coord-ray slide),
// then the question. The class votes on an option — a click marks it green or
// red — and only then does the teacher walk the solution out, one line per
// click, ending on the answer. Nothing auto-reveals: the thinking happens
// before the arithmetic appears.

import { useState } from "react";
import { Check, ChevronRight, RotateCcw, X } from "lucide-react";
import type { Lang } from "@/lib/i18n/strings";
import type { PresentSlide } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import { MathText } from "@/components/quiz/math-text";
import { cn } from "@/lib/utils";
import { RayScene } from "./coord-ray";
import { SlideHeading } from "./slide-view";

export function WordProblemSlide({
  slide,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "word-problem" }>;
  lang: Lang;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState(0);
  const steps = slide.steps ?? [];
  const total = steps.length + 1; // + the answer line
  const done = shown >= total;
  const solved = slide.choices?.some(
    (choice, i) => choice.correct && picked.has(i),
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1250px] flex-col px-[3vw] py-[2.5vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />

      <p className="text-[clamp(17px,1.8vw,28px)] leading-[1.35] text-[#1a1a2e]">
        <MathText text={pickPresentText(slide.statement, lang)} />
      </p>

      {/* The picture gives up height to the solution as it unfolds. */}
      {slide.ray && (
        <div className="my-[1vh] min-h-0 shrink">
          <RayScene
            ray={slide.ray}
            lang={lang}
            maxHeight={shown === 0 ? "27vh" : "19vh"}
          />
        </div>
      )}

      <p className="mt-[0.6vh] text-center text-[clamp(20px,2.1vw,33px)] font-bold text-[#1a1a2e]">
        <MathText text={pickPresentText(slide.question, lang)} />
      </p>

      {slide.choices && (
        <div className="mt-[1.4vh] flex flex-wrap justify-center gap-[1vw]">
          {slide.choices.map((choice, i) => {
            const isPicked = picked.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicked((prev) => new Set(prev).add(i))}
                className={cn(
                  "flex items-center gap-[0.4em] rounded-2xl border-[2.5px] bg-white px-[1em] py-[0.35em] text-[clamp(22px,2.4vw,38px)] font-bold transition-colors",
                  !isPicked && "border-[#d8dde5] text-[#1a1a2e] hover:border-[#2563eb]",
                  isPicked && choice.correct && "border-[#059669] text-[#059669]",
                  isPicked && !choice.correct && "border-[#dc2626] text-[#dc2626] opacity-60",
                )}
              >
                <MathText text={pickPresentText(choice.text, lang)} />
                {isPicked &&
                  (choice.correct ? (
                    <Check className="size-[0.9em]" aria-hidden />
                  ) : (
                    <X className="size-[0.9em]" aria-hidden />
                  ))}
              </button>
            );
          })}
        </div>
      )}

      {/* Solution — one line per click, answer last. */}
      <div className="mt-[1vh] flex min-h-0 flex-1 flex-col items-center justify-start gap-[0.5vh] overflow-y-auto">
        {steps.slice(0, shown).map((step, i) => (
          <p
            key={i}
            className="text-center text-[clamp(16px,1.7vw,27px)] leading-[1.3] text-[#374151] animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <MathText text={pickPresentText(step.text, lang)} />
          </p>
        ))}
        {shown >= total && (
          <div className="mt-[0.4vh] rounded-2xl border-[3px] border-[#059669] bg-[#ecfdf5] px-[0.9em] py-[0.3em] text-[clamp(19px,2.1vw,33px)] font-bold text-[#047857] animate-in fade-in zoom-in-95 duration-300">
            {lang === "ru" ? "Ответ: " : "Жауабы: "}
            <MathText text={pickPresentText(slide.answer, lang)} />
          </div>
        )}
      </div>

      <div className="mt-[0.6vh] flex justify-center gap-2">
        {!done && (
          <button
            type="button"
            onClick={() => setShown((s) => s + 1)}
            className="flex items-center gap-2 rounded-xl border-[2px] border-[#2563eb] bg-[#2563eb] px-4 py-2 text-[clamp(14px,1.3vw,21px)] font-bold text-white transition-colors hover:bg-[#1d4ed8]"
          >
            <ChevronRight className="size-[1em]" aria-hidden />
            {shown === 0
              ? lang === "ru"
                ? "Решение"
                : "Шешуі"
              : shown < steps.length
                ? lang === "ru"
                  ? "Дальше"
                  : "Әрі қарай"
                : lang === "ru"
                  ? "Ответ"
                  : "Жауабы"}
          </button>
        )}
        {(shown > 0 || picked.size > 0) && (
          <button
            type="button"
            onClick={() => {
              setShown(0);
              setPicked(new Set());
            }}
            className="flex items-center gap-2 rounded-xl border-[1.5px] border-[#d8dde5] bg-white px-3 py-2 text-[clamp(13px,1.1vw,18px)] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
          >
            <RotateCcw className="size-[1em]" aria-hidden />
            {lang === "ru" ? "Заново" : "Қайтадан"}
          </button>
        )}
        {solved && shown === 0 && (
          <span className="self-center text-[clamp(14px,1.2vw,20px)] font-semibold text-[#059669]">
            {lang === "ru" ? "Верно! Проверим решение" : "Дұрыс! Шешуін тексерейік"}
          </span>
        )}
      </div>
    </div>
  );
}
