"use client";

// Native step-by-step problem player: GeoGebra model on the left, the
// solution walkthrough on the right. Steps accumulate like a blackboard;
// each step can move the model to a new scene state. Renders both native
// pack problems (blocks) and uploaded lesson files (bilingual HTML) via the
// normalized PlayerProblem shape.

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import { pickText } from "@/lib/lesson/types";
import type { PlayerProblem } from "@/lib/lesson/player-adapter";
import { GgbView } from "./ggb-view";
import { LessonBlocks } from "./blocks";
import { LessonHtml } from "./lesson-html";
import { SplitRow } from "./split-row";

const WORDS = {
  step: { kz: "қадам", ru: "шаг" },
  prev: { kz: "Алдыңғы", ru: "Назад" },
  next: { kz: "Келесі", ru: "Далее" },
  problem: { kz: "Есеп", ru: "Задача" },
} as const;

export function ProblemPlayer({
  problem,
  lang,
  hotkeys = false,
  className,
}: {
  problem: PlayerProblem;
  lang: Lang;
  hotkeys?: boolean;
  className?: string;
}) {
  const [state, setState] = useState({ index: 0, animate: false });
  const stepsRef = useRef<HTMLDivElement>(null);
  const total = problem.steps.length;
  const { index } = state;

  const goPrev = () =>
    setState((s) => (s.index > 0 ? { index: s.index - 1, animate: false } : s));
  const goNext = () =>
    setState((s) =>
      s.index < total - 1 ? { index: s.index + 1, animate: true } : s,
    );

  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkeys, total]);

  // Keep the newest step in view as the walkthrough grows.
  useEffect(() => {
    const node = stepsRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [index]);

  const sceneStep = problem.steps[index]?.sceneStep ?? 0;
  const hasStatement =
    (problem.statementBlocks?.length ?? 0) > 0 || problem.statementHtml;

  return (
    <SplitRow
      className={className}
      left={
        problem.ggb.kind === "scene" ? (
          <GgbView
            sceneId={problem.ggb.sceneId}
            params={problem.ggb.params}
            step={sceneStep}
            animate={state.animate}
            lang={lang}
            className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
          />
        ) : (
          <GgbView
            program={problem.ggb.program}
            programKey={problem.ggb.programKey}
            step={sceneStep}
            animate={state.animate}
            lang={lang}
            className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
          />
        )
      }
      right={
        <div className="flex min-h-0 flex-col">
          {hasStatement && (
            <div className="max-h-[45%] shrink-0 overflow-y-auto border-b-[1.5px] border-[#d8dde5] bg-[#fbfcfe] px-5 py-4 md:px-7">
              <span className="mb-2.5 inline-flex items-center rounded bg-[#eff6ff] px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#2563eb]">
                {WORDS.problem[lang] ?? WORDS.problem.kz} №{problem.number}
              </span>
              {problem.statementBlocks ? (
                <LessonBlocks
                  blocks={problem.statementBlocks}
                  lang={lang}
                  params={problem.params}
                />
              ) : problem.statementHtml ? (
                <LessonHtml
                  html={problem.statementHtml}
                  lang={lang}
                  className="text-[length:calc(15px*var(--lesson-scale,1))]"
                />
              ) : null}
            </div>
          )}

          <div
            ref={stepsRef}
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5 md:px-7"
          >
            {problem.steps.slice(0, index + 1).map((step, stepIndex) => (
              <div
                key={stepIndex}
                className={cn(stepIndex < index && "opacity-70")}
              >
                <div className="flex items-center gap-2.5 border-b-2 border-[#2563eb] pb-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#2563eb] text-[12px] font-bold text-white">
                    {stepIndex + 1}
                  </span>
                  <h3 className="text-[length:calc(15px*var(--lesson-scale,1))] font-bold text-[#2563eb]">
                    {pickText(step.name, lang)}
                  </h3>
                </div>
                <div className="mt-3.5">
                  {step.blocks ? (
                    <LessonBlocks
                      blocks={step.blocks}
                      lang={lang}
                      params={problem.params}
                    />
                  ) : step.html ? (
                    <LessonHtml
                      html={step.html}
                      lang={lang}
                      className="text-[length:calc(15px*var(--lesson-scale,1))]"
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-4 border-t-[1.5px] border-[#d8dde5] px-5 py-2.5">
            <button
              type="button"
              onClick={goPrev}
              disabled={index <= 0}
              className="flex h-9 items-center gap-1.5 rounded-md bg-[#eef1f5] px-4 text-[13px] font-semibold text-[#6b7280] transition-colors enabled:hover:bg-[#e2e6ec] enabled:hover:text-[#1a1a2e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeftIcon className="size-4" />
              {WORDS.prev[lang] ?? WORDS.prev.kz}
            </button>
            <span className="text-[13px] font-semibold text-[#6b7280]">
              {index + 1} / {total} {WORDS.step[lang] ?? WORDS.step.kz}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={index >= total - 1}
              className="flex h-9 items-center gap-1.5 rounded-md bg-[#2563eb] px-4 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {WORDS.next[lang] ?? WORDS.next.kz}
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      }
    />
  );
}
