"use client";

// Renders lesson pack content blocks. Text supports $...$ / $$...$$ math
// (via MathText), **bold**, and {{param}} substitution from pack params.

import { Fragment } from "react";
import { MathText } from "@/components/quiz/math-text";
import type { Lang } from "@/lib/i18n/strings";
import {
  pickText,
  substParams,
  type Block,
  type Localized,
  type Params,
} from "@/lib/lesson/types";

const LABELS = {
  find: { kz: "Табу керек:", ru: "Найти:" },
  answer: { kz: "Жауабы:", ru: "Ответ:" },
  callout: { kz: "МОДЕЛЬМЕН ЖҰМЫС", ru: "РАБОТА С МОДЕЛЬЮ" },
} as const;

function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="font-bold">
            <MathText text={part} />
          </strong>
        ) : (
          <Fragment key={index}>
            <MathText text={part} />
          </Fragment>
        ),
      )}
    </>
  );
}

function resolve(text: Localized, lang: Lang, params?: Params): string {
  return substParams(pickText(text, lang), params);
}

export function LessonBlocks({
  blocks,
  lang,
  params,
}: {
  blocks: Block[];
  lang: Lang;
  params?: Params;
}) {
  return (
    // Sizes below are in em so the whole lesson scales from one CSS variable
    // (--lesson-scale, set by the font-size control in the page header).
    <div className="flex flex-col gap-3.5 text-[length:calc(15px*var(--lesson-scale,1))]">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "p":
            return (
              <p
                key={index}
                className="text-[0.97em] leading-[1.75] text-[#1a1a2e]"
              >
                <RichText text={resolve(block.text, lang, params)} />
              </p>
            );
          case "given":
            return (
              <div
                key={index}
                className="rounded-lg border-[1.5px] border-[#bfdbfe] bg-[#eff6ff] px-5 py-4 text-center"
              >
                <MathText
                  text={`$$${substParams(block.latex, params)}$$`}
                  className="text-[1em] text-[#1a1a2e]"
                />
              </div>
            );
          case "find":
            return (
              <p
                key={index}
                className="text-[0.97em] leading-[1.75] text-[#1a1a2e]"
              >
                <strong className="font-bold">
                  {LABELS.find[lang] ?? LABELS.find.kz}
                </strong>{" "}
                <RichText text={resolve(block.text, lang, params)} />
              </p>
            );
          case "formula":
            return (
              <div
                key={index}
                className="rounded-lg border-[1.5px] border-[#d8dde5] bg-[#f8f9fb] px-4 py-3"
              >
                {block.label && (
                  <div className="mb-1 text-[0.73em] font-bold uppercase tracking-[0.05em] text-[#6b7280]">
                    {pickText(block.label, lang)}
                  </div>
                )}
                <div className="text-center">
                  <MathText
                    text={`$$${substParams(block.latex, params)}$$`}
                    className="text-[1em] text-[#1a1a2e]"
                  />
                </div>
              </div>
            );
          case "callout":
            return (
              <div
                key={index}
                className="rounded-r-lg border-l-[3px] border-[#f59e0b] bg-[#fffbeb] px-4 py-3"
              >
                <div className="mb-1 text-[0.73em] font-bold uppercase tracking-[0.05em] text-[#b45309]">
                  {block.title
                    ? pickText(block.title, lang)
                    : (LABELS.callout[lang] ?? LABELS.callout.kz)}
                </div>
                <p className="text-[0.9em] leading-[1.7] text-[#78350f]">
                  <RichText text={resolve(block.text, lang, params)} />
                </p>
              </div>
            );
          case "answer":
            return (
              <div
                key={index}
                className="rounded-lg border-[1.5px] border-[#bbf7d0] bg-[#f0fdf4] px-5 py-3.5"
              >
                <span className="mr-2 font-bold text-[#15803d]">
                  {LABELS.answer[lang] ?? LABELS.answer.kz}
                </span>
                <RichText text={resolve(block.text, lang, params)} />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
