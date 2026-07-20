"use client";

// Slide dispatcher + the simple slide types (title, stepped text). Interactive
// widgets live in their own files; every widget receives { slide, lang } and
// step-driven slides also receive the revealed step index.

import type { Lang } from "@/lib/i18n/strings";
import type { PresentSlide, PresentTextStep } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import { MathText } from "@/components/quiz/math-text";
import { cn } from "@/lib/utils";
import { FlashcardsSlide } from "./flashcards";
import { PlaceValueSlide, DigitMeaningSlide } from "./place-value";
import { ExpandSlide } from "./expand";
import { ClassTableSlide } from "./class-table";
import { OralSlide } from "./oral";
import { CoordRaySlide } from "./coord-ray";
import { WordProblemSlide } from "./word-problem";

export function SlideView({
  slide,
  step,
  lang,
}: {
  slide: PresentSlide;
  step: number;
  lang: Lang;
}) {
  switch (slide.type) {
    case "title":
      return <TitleSlide slide={slide} lang={lang} />;
    case "text":
      return <TextSlide slide={slide} step={step} lang={lang} />;
    case "flashcards":
      return <FlashcardsSlide slide={slide} lang={lang} />;
    case "place-value":
      return <PlaceValueSlide slide={slide} lang={lang} />;
    case "expand":
      return <ExpandSlide slide={slide} step={step} lang={lang} />;
    case "digit-meaning":
      return <DigitMeaningSlide slide={slide} lang={lang} />;
    case "class-table":
      return <ClassTableSlide slide={slide} lang={lang} />;
    case "oral":
      return <OralSlide slide={slide} lang={lang} />;
    case "coord-ray":
      return <CoordRaySlide slide={slide} step={step} lang={lang} />;
    case "word-problem":
      return <WordProblemSlide slide={slide} lang={lang} />;
  }
}

/** Small blue eyebrow heading shared by content slides. */
export function SlideHeading({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;
  return (
    <p
      className={cn(
        "mb-[0.9em] text-[clamp(18px,1.6vw,26px)] font-bold uppercase tracking-wide text-[#2245c3]",
        className,
      )}
    >
      {text}
    </p>
  );
}

function TitleSlide({
  slide,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "title" }>;
  lang: Lang;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-[6vw] text-center">
      {slide.subtitle && (
        <p className="mb-[1.2em] text-[clamp(18px,2vw,30px)] font-semibold uppercase tracking-wider text-[#2245c3]">
          {pickPresentText(slide.subtitle, lang)}
        </p>
      )}
      <h1 className="max-w-[16em] text-[clamp(40px,5.4vw,84px)] font-bold leading-[1.15] text-[#1a1a2e]">
        <MathText text={pickPresentText(slide.title, lang)} />
      </h1>
      <div className="mt-[1.6em] h-1.5 w-[clamp(80px,10vw,160px)] rounded-full bg-[#2563eb]" />
    </div>
  );
}

function TextSlide({
  slide,
  step,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "text" }>;
  step: number;
  lang: Lang;
}) {
  const visible = slide.steps.slice(0, step + 1);
  return (
    <div className="mx-auto flex h-full w-full max-w-[1150px] flex-col justify-center px-[4vw] py-[3vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />
      <div className="space-y-[0.9em] text-[clamp(22px,2.3vw,36px)] leading-[1.45] text-[#1a1a2e]">
        {visible.map((textStep, i) => (
          <TextStepView key={i} step={textStep} lang={lang} />
        ))}
      </div>
      {step + 1 < slide.steps.length && (
        <p className="mt-[1.4em] text-[clamp(14px,1.2vw,20px)] text-[#9ca3af]">
          {lang === "ru" ? "→ дальше" : "→ әрі қарай"}
        </p>
      )}
    </div>
  );
}

function TextStepView({
  step,
  lang,
}: {
  step: PresentTextStep;
  lang: Lang;
}) {
  const text = pickPresentText(step.text, lang);
  const variant = step.variant ?? "normal";
  if (variant === "rule") {
    return (
      <div className="rounded-r-xl border-l-[6px] border-[#2563eb] bg-[#eaf2fe] px-[1em] py-[0.7em] font-semibold text-[#1e3a8a] animate-in fade-in slide-in-from-bottom-2 duration-300">
        <MathText text={text} />
      </div>
    );
  }
  if (variant === "fact") {
    return (
      <div className="rounded-xl border-2 border-[#7dd3fc] bg-[#f0f9ff] px-[1em] py-[0.7em] text-[0.82em] text-[#0c4a6e] animate-in fade-in slide-in-from-bottom-2 duration-300">
        <span aria-hidden>💡 </span>
        <MathText text={text} />
      </div>
    );
  }
  if (variant === "example") {
    return (
      <div className="rounded-xl bg-[#f8f9fb] px-[1em] py-[0.7em] text-[0.92em] animate-in fade-in slide-in-from-bottom-2 duration-300">
        <MathText text={text} />
      </div>
    );
  }
  return (
    <p className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <MathText text={text} />
    </p>
  );
}
