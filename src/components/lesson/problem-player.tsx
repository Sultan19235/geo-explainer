"use client";

// Native step-by-step problem player: GeoGebra model on the left, the
// solution walkthrough on the right. Steps accumulate like a blackboard;
// each step can move the model to a new scene state. Renders both native
// pack problems (blocks) and uploaded lesson files (bilingual HTML) via the
// normalized PlayerProblem shape.
//
// Three teaching modes (header tabs, teacher's choice): "full" — the
// complete written walkthrough; "compact" — the same steps with prose
// hidden, only titles/given/formulas/answers remain and the teacher
// narrates; "board" — the walkthrough pane becomes a drawable whiteboard
// and the model is stepped by mini arrows on the model pane itself. One
// step index drives all modes, so switching mid-problem keeps the place.

import { useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import { pickText } from "@/lib/lesson/types";
import type { PlayerProblem } from "@/lib/lesson/player-adapter";
import { BoardCanvas } from "./board-canvas";
import { GgbView } from "./ggb-view";
import { LessonBlocks } from "./blocks";
import { LessonHtml } from "./lesson-html";
import type { SolveMode } from "./solve-mode";
import { SplitRow } from "./split-row";

const WORDS = {
  step: { kz: "қадам", ru: "шаг" },
  prev: { kz: "Алдыңғы", ru: "Назад" },
  next: { kz: "Келесі", ru: "Далее" },
} as const;

// Compact mode keeps only the math-bearing content; prose is the teacher's
// job. Native blocks are filtered by type; uploaded HTML hides top-level
// prose via CSS (lesson-html.module.css), and this regex just detects steps
// that would end up title-only so their empty body collapses.
const COMPACT_BLOCK_TYPES = new Set(["given", "find", "formula", "answer"]);
const COMPACT_HTML_RE = /lf-(formula|given|answer)/;

export function ProblemPlayer({
  problem,
  lang,
  mode = "full",
  hotkeys = false,
  className,
}: {
  problem: PlayerProblem;
  lang: Lang;
  mode?: SolveMode;
  hotkeys?: boolean;
  className?: string;
}) {
  const [state, setState] = useState({ index: 0, animate: false });
  const [statementOpen, setStatementOpen] = useState(true);
  const stepsRef = useRef<HTMLDivElement>(null);
  const total = problem.steps.length;
  const { index } = state;
  const isBoard = mode === "board";
  // Figure-less problems drop the model pane entirely: statement and
  // walkthrough go full-width with larger classroom type.
  const textFirst = !problem.ggb;
  const bodyText = textFirst
    ? "text-[length:calc(17px*var(--lesson-scale,1))]"
    : "text-[length:calc(15px*var(--lesson-scale,1))]";

  // The statement matters most on the first step; once the student moves
  // on, collapse it to a peek so the walkthrough gets the vertical space.
  // In board mode stepping only moves the model — leave the statement be.
  useEffect(() => {
    if (isBoard) return;
    setStatementOpen(index === 0);
  }, [index, isBoard]);

  // Entering board mode: solving starts from the statement, keep it visible.
  useEffect(() => {
    if (isBoard) setStatementOpen(true);
  }, [isBoard]);

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
  }, [index, mode]);

  const sceneStep = problem.steps[index]?.sceneStep ?? 0;
  const hasStatement =
    (problem.statementBlocks?.length ?? 0) > 0 || problem.statementHtml;

  // Board mode steps the model from the model pane itself — no text steps.
  const stepper =
    isBoard && total > 1 ? (
      <div className="flex items-center gap-0.5 rounded-md border-[1.5px] border-[#d8dde5] bg-white/95 p-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <button
          type="button"
          onClick={goPrev}
          disabled={index <= 0}
          aria-label={WORDS.prev[lang] ?? WORDS.prev.kz}
          className="grid size-7 place-items-center rounded text-[#6b7280] transition-colors enabled:hover:bg-[#eef1f5] enabled:hover:text-[#1a1a2e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="min-w-[42px] text-center text-[11.5px] font-semibold text-[#6b7280]">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={index >= total - 1}
          aria-label={WORDS.next[lang] ?? WORDS.next.kz}
          className="grid size-7 place-items-center rounded text-[#2563eb] transition-colors enabled:hover:bg-[#eff6ff] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    ) : undefined;

  const statementNode = hasStatement ? (
    <div
      className={cn(
        "relative shrink-0 border-b-[1.5px] border-[#d8dde5] bg-[#fbfcfe] px-5 py-2.5 md:px-7",
        statementOpen
          ? "max-h-[45%] overflow-y-auto"
          : "cursor-pointer overflow-hidden",
      )}
      style={
        statementOpen
          ? undefined
          : { maxHeight: "calc(20px + 52px * var(--lesson-scale, 1))" }
      }
      onClick={statementOpen ? undefined : () => setStatementOpen(true)}
    >
      <div className={cn(textFirst && "mx-auto w-full max-w-4xl")}>
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
            className={bodyText}
          />
        ) : null}
      </div>
      {statementOpen && (index > 0 || isBoard) && (
        <button
          type="button"
          onClick={() => setStatementOpen(false)}
          className="absolute right-2 top-2 grid size-6 place-items-center rounded-md bg-[#eef1f5]/90 text-[#6b7280] transition-colors hover:bg-[#e2e6ec] hover:text-[#1a1a2e]"
        >
          <ChevronUpIcon className="size-4" />
        </button>
      )}
      {!statementOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-6 items-end justify-center bg-gradient-to-t from-[#fbfcfe] to-transparent">
          <ChevronDownIcon className="size-4 text-[#9aa3af]" />
        </div>
      )}
    </div>
  ) : null;

  const walkthroughPane = isBoard ? (
          <div className="flex min-h-0 flex-col">
            {statementNode}
            <BoardCanvas storeKey={problem.key} lang={lang} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-col">
            {statementNode}

            <div
              ref={stepsRef}
              className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-3.5 md:px-7"
            >
              {problem.steps.slice(0, index + 1).map((step, stepIndex) => {
                const compact = mode === "compact";
                const blocks =
                  step.blocks && compact
                    ? step.blocks.filter((block) =>
                        COMPACT_BLOCK_TYPES.has(block.type),
                      )
                    : step.blocks;
                // A prose-only step keeps just its title in compact mode —
                // the model and the teacher carry it.
                const bodyEmpty =
                  compact &&
                  (step.blocks
                    ? (blocks?.length ?? 0) === 0
                    : !COMPACT_HTML_RE.test(
                        (step.html?.kz ?? "") + (step.html?.ru ?? ""),
                      ));
                return (
                  <div
                    key={stepIndex}
                    className={cn(
                      stepIndex < index && "opacity-70",
                      textFirst && "mx-auto w-full max-w-4xl",
                    )}
                  >
                    <div className="flex items-center gap-2.5 border-b-2 border-[#2563eb] pb-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#2563eb] text-[12px] font-bold text-white">
                        {stepIndex + 1}
                      </span>
                      <h3 className={cn(bodyText, "font-bold text-[#2563eb]")}>
                        {pickText(step.name, lang)}
                      </h3>
                    </div>
                    {!bodyEmpty && (
                      <div className="mt-3.5">
                        {blocks ? (
                          <LessonBlocks
                            blocks={blocks}
                            lang={lang}
                            params={problem.params}
                          />
                        ) : step.html ? (
                          <LessonHtml
                            html={step.html}
                            lang={lang}
                            compact={compact}
                            className={bodyText}
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 border-t-[1.5px] border-[#d8dde5] px-4 py-1.5">
              <button
                type="button"
                onClick={goPrev}
                disabled={index <= 0}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#eef1f5] px-3.5 text-[12.5px] font-semibold text-[#6b7280] transition-colors enabled:hover:bg-[#e2e6ec] enabled:hover:text-[#1a1a2e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeftIcon className="size-4" />
                {WORDS.prev[lang] ?? WORDS.prev.kz}
              </button>
              <span className="text-[12.5px] font-semibold text-[#6b7280]">
                {index + 1} / {total} {WORDS.step[lang] ?? WORDS.step.kz}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={index >= total - 1}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563eb] px-3.5 text-[12.5px] font-semibold text-white transition-colors enabled:hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {WORDS.next[lang] ?? WORDS.next.kz}
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>
        );

  // No figure: the walkthrough IS the player, full-width.
  if (!problem.ggb) {
    return (
      <div className={cn("flex min-h-0 flex-col", className)}>
        {walkthroughPane}
      </div>
    );
  }

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
            stepperSlot={stepper}
            className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
          />
        ) : (
          <GgbView
            program={problem.ggb.program}
            programKey={problem.ggb.programKey}
            step={sceneStep}
            animate={state.animate}
            lang={lang}
            stepperSlot={stepper}
            className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
          />
        )
      }
      right={walkthroughPane}
    />
  );
}
