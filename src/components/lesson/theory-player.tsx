"use client";

// Theory player with two views over the same pack: present mode (one section
// at a time next to the model — for the projector) and scroll mode (the whole
// topic as a readable document).

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import { pickText, type TheoryPack } from "@/lib/lesson/types";
import { GgbView } from "./ggb-view";
import { LessonBlocks } from "./blocks";
import { SplitRow } from "./split-row";

const WORDS = {
  badge: { kz: "Теория", ru: "Теория" },
  present: { kz: "Слайд", ru: "Слайды" },
  scroll: { kz: "Мәтін", ru: "Текст" },
  prev: { kz: "Алдыңғы", ru: "Назад" },
  next: { kz: "Келесі", ru: "Далее" },
} as const;

type Mode = "present" | "scroll";

export function TheoryPlayer({
  pack,
  lang,
}: {
  pack: TheoryPack;
  lang: Lang;
}) {
  const [mode, setMode] = useState<Mode>("present");
  const [state, setState] = useState({ index: 0, animate: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const modeMountedRef = useRef(false);
  const total = pack.sections.length;
  const section = pack.sections[state.index];

  // Switching present ↔ scroll swaps a short layout for a very tall one and
  // the browser keeps the old scroll offset — snap back to the section top.
  // Applets/KaTeX keep inflating the layout (and can pull the scroll down)
  // for a moment after the switch, so re-snap a couple of times — but stop
  // the instant the teacher scrolls or clicks somewhere themselves.
  useEffect(() => {
    if (!modeMountedRef.current) {
      modeMountedRef.current = true;
      return;
    }
    const snap = () => rootRef.current?.scrollIntoView({ block: "start" });
    snap();
    const timers = [450, 1100].map((ms) => window.setTimeout(snap, ms));
    const cancel = () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
    const options = { passive: true } as const;
    window.addEventListener("wheel", cancel, options);
    window.addEventListener("touchstart", cancel, options);
    window.addEventListener("pointerdown", cancel, options);
    window.addEventListener("keydown", cancel);
    return () => {
      cancel();
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [mode]);

  const goPrev = () =>
    setState((s) => (s.index > 0 ? { index: s.index - 1, animate: false } : s));
  const goNext = () =>
    setState((s) =>
      s.index < total - 1 ? { index: s.index + 1, animate: true } : s,
    );

  return (
    <div ref={rootRef} className="scroll-mt-[72px]">
      <div className="flex min-h-12 flex-wrap items-center gap-3 border-b-[1.5px] border-[#d8dde5] px-[18px] py-[10px]">
        <span className="inline-flex items-center rounded bg-[#ecfdf5] px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#16a34a]">
          {WORDS.badge[lang] ?? WORDS.badge.kz}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1a1a2e]">
          {pickText(pack.title, lang)}
        </h2>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-[#d8dde5] bg-[#f8f9fb] p-0.5">
          {(["present", "scroll"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={cn(
                "rounded-[5px] px-3 py-1 text-xs font-semibold transition-colors",
                mode === value
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "text-[#6b7280] hover:text-[#1a1a2e]",
              )}
            >
              {WORDS[value][lang] ?? WORDS[value].kz}
            </button>
          ))}
        </div>
      </div>

      {mode === "present" ? (
        <SplitRow
          className="h-[520px] md:h-[560px]"
          left={
            section?.scene ? (
              <GgbView
                sceneId={section.scene.id}
                params={{ ...pack.params, ...section.scene.params }}
                step={section.sceneStep ?? 0}
                animate={state.animate}
                lang={lang}
                className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
              />
            ) : (
              <div className="border-b-[1.5px] border-[#d8dde5] bg-[#f8f9fb] md:border-b-0" />
            )
          }
          right={
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
              <div className="flex items-center gap-2.5 border-b-2 border-[#16a34a] pb-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#16a34a] text-[12px] font-bold text-white">
                  {state.index + 1}
                </span>
                <h3 className="text-[length:calc(15px*var(--lesson-scale,1))] font-bold text-[#15803d]">
                  {section ? pickText(section.title, lang) : ""}
                </h3>
              </div>
              <div className="mt-3.5">
                {section && (
                  <LessonBlocks
                    blocks={section.blocks}
                    lang={lang}
                    params={pack.params}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 border-t-[1.5px] border-[#d8dde5] px-5 py-2.5">
              <button
                type="button"
                onClick={goPrev}
                disabled={state.index <= 0}
                className="flex h-9 items-center gap-1.5 rounded-md bg-[#eef1f5] px-4 text-[13px] font-semibold text-[#6b7280] transition-colors enabled:hover:bg-[#e2e6ec] enabled:hover:text-[#1a1a2e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeftIcon className="size-4" />
                {WORDS.prev[lang] ?? WORDS.prev.kz}
              </button>
              <span className="text-[13px] font-semibold text-[#6b7280]">
                {state.index + 1} / {total}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={state.index >= total - 1}
                className="flex h-9 items-center gap-1.5 rounded-md bg-[#2563eb] px-4 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {WORDS.next[lang] ?? WORDS.next.kz}
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>
          }
        />
      ) : (
        // Scroll mode = the same slides stacked: each section keeps the
        // present-mode height and splitter so it reads from the back rows.
        <div className="flex flex-col divide-y-[1.5px] divide-[#d8dde5]">
          {pack.sections.map((item, itemIndex) => {
            const text = (
              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
                  <div className="flex items-center gap-2.5 border-b-2 border-[#16a34a] pb-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#16a34a] text-[12px] font-bold text-white">
                      {itemIndex + 1}
                    </span>
                    <h3 className="text-[length:calc(15px*var(--lesson-scale,1))] font-bold text-[#15803d]">
                      {pickText(item.title, lang)}
                    </h3>
                  </div>
                  <div className="mt-3.5">
                    <LessonBlocks
                      blocks={item.blocks}
                      lang={lang}
                      params={pack.params}
                    />
                  </div>
                </div>
              </div>
            );

            return item.scene ? (
              <SplitRow
                key={item.id}
                className="h-[520px] md:h-[560px]"
                left={
                  <GgbView
                    sceneId={item.scene.id}
                    params={{ ...pack.params, ...item.scene.params }}
                    step={item.sceneStep ?? 0}
                    animate={false}
                    lang={lang}
                    className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
                  />
                }
                right={text}
              />
            ) : (
              <div key={item.id} className="py-2">
                {text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
