"use client";

// Theory player with two views over the same content: present mode (one
// section at a time next to the model — for the projector) and scroll mode
// (all sections stacked as full-height slides). Renders both native packs
// (blocks) and uploaded lesson files (bilingual HTML) via PlayerTheory.

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import { pickText } from "@/lib/lesson/types";
import type {
  LessonVisualFn,
  LessonVisualHandle,
  PlayerGgbSource,
  PlayerTheory,
  PlayerTheorySection,
} from "@/lib/lesson/player-adapter";
import { ExplainReveal } from "./explain-reveal";
import { GgbView } from "./ggb-view";
import { LessonBlocks } from "./blocks";
import { LessonHtml } from "./lesson-html";
import { SplitRow } from "./split-row";
import { VisualHost } from "./visual-host";

const WORDS = {
  badge: { kz: "Теория", ru: "Теория" },
  present: { kz: "Слайд", ru: "Слайды" },
  scroll: { kz: "Мәтін", ru: "Текст" },
  prev: { kz: "Алдыңғы", ru: "Назад" },
  next: { kz: "Келесі", ru: "Далее" },
} as const;

type Mode = "present" | "scroll";

function TheoryGgb({
  ggb,
  sceneStep,
  animate,
  lang,
  className,
}: {
  ggb: PlayerGgbSource;
  sceneStep: number;
  animate: boolean;
  lang: Lang;
  className?: string;
}) {
  return ggb.kind === "scene" ? (
    <GgbView
      sceneId={ggb.sceneId}
      params={ggb.params}
      step={sceneStep}
      animate={animate}
      lang={lang}
      className={className}
    />
  ) : (
    <GgbView
      program={ggb.program}
      programKey={ggb.programKey}
      step={sceneStep}
      animate={animate}
      lang={lang}
      className={className}
    />
  );
}

// Plain-JS section visual in the model pane (word-problem topics) — same
// slide layout as a GGB section, no GeoGebra involved.
function TheoryVisual({
  visual,
  lang,
  className,
}: {
  visual: LessonVisualFn;
  lang: Lang;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col justify-center overflow-auto bg-white p-4 md:p-5",
        className,
      )}
    >
      <VisualHost visual={visual} lang={lang} className="w-full" />
    </div>
  );
}

function SectionText({
  section,
  index,
  lang,
  params,
}: {
  section: PlayerTheorySection;
  index: number;
  lang: Lang;
  params?: PlayerTheory["params"];
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
        <div className="flex items-center gap-2.5 border-b-2 border-[#16a34a] pb-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#16a34a] text-[12px] font-bold text-white">
            {index + 1}
          </span>
          <h3 className="text-[length:calc(15px*var(--lesson-scale,1))] font-bold text-[#15803d]">
            {pickText(section.title, lang)}
          </h3>
        </div>
        <div className="mt-3.5">
          {section.blocks ? (
            <LessonBlocks blocks={section.blocks} lang={lang} params={params} />
          ) : section.html ? (
            <LessonHtml
              html={section.html}
              lang={lang}
              className="text-[length:calc(15px*var(--lesson-scale,1))]"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Document layout: sections stacked as one vertical page ─────────────────
// Word-problem theories (no GeoGebra anywhere): each section = title + text
// full-width, plain-JS visual below, optional hidden part (answers/solution)
// behind a teacher-revealed button — the same feel as document-mode problems.

function TheoryDocSection({
  section,
  index,
  lang,
}: {
  section: PlayerTheorySection;
  index: number;
  lang: Lang;
}) {
  const handleRef = useRef<LessonVisualHandle | undefined>(undefined);
  const bodyText = "text-[length:calc(17px*var(--lesson-scale,1))]";

  return (
    <section className="border-b-[1.5px] border-[#d8dde5] px-5 py-6 last:border-b-0 md:px-7">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-center gap-2.5 border-b-2 border-[#16a34a] pb-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#16a34a] text-[12px] font-bold text-white">
            {index + 1}
          </span>
          <h3 className={cn(bodyText, "font-bold text-[#15803d]")}>
            {pickText(section.title, lang)}
          </h3>
        </div>
        {section.html && (
          <div className="mt-3.5">
            <LessonHtml html={section.html} lang={lang} className={bodyText} />
          </div>
        )}
        {section.visual && (
          <VisualHost
            visual={section.visual}
            lang={lang}
            onHandle={(handle) => {
              handleRef.current = handle;
            }}
            className="mt-4"
          />
        )}
        {section.doc && (
          <div className="mt-4">
            <ExplainReveal
              doc={section.doc}
              lang={lang}
              handleRef={handleRef}
              bodyText={bodyText}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function TheoryDocPlayer({
  theory,
  lang,
}: {
  theory: PlayerTheory;
  lang: Lang;
}) {
  return (
    <div>
      <div className="flex min-h-12 flex-wrap items-center gap-3 border-b-[1.5px] border-[#d8dde5] px-[18px] py-[10px]">
        <span className="inline-flex items-center rounded bg-[#ecfdf5] px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#16a34a]">
          {WORDS.badge[lang] ?? WORDS.badge.kz}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1a1a2e]">
          {pickText(theory.title, lang)}
        </h2>
      </div>
      {theory.sections.map((section, index) => (
        <TheoryDocSection
          key={section.id}
          section={section}
          index={index}
          lang={lang}
        />
      ))}
    </div>
  );
}

// ─── Slide layout: split present/scroll player (GeoGebra topics, packs) ─────

export function TheoryPlayer({
  theory,
  lang,
}: {
  theory: PlayerTheory;
  lang: Lang;
}) {
  if (theory.layout === "doc") {
    return <TheoryDocPlayer theory={theory} lang={lang} />;
  }
  return <TheorySlidesPlayer theory={theory} lang={lang} />;
}

function TheorySlidesPlayer({
  theory,
  lang,
}: {
  theory: PlayerTheory;
  lang: Lang;
}) {
  const [mode, setMode] = useState<Mode>("present");
  const [state, setState] = useState({ index: 0, animate: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const modeMountedRef = useRef(false);
  const total = theory.sections.length;
  const section = theory.sections[state.index];

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
          {pickText(theory.title, lang)}
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
            section?.visual ? (
              <TheoryVisual
                visual={section.visual}
                lang={lang}
                className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
              />
            ) : section?.ggb ? (
              <TheoryGgb
                ggb={section.ggb}
                sceneStep={section.sceneStep}
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
              {section && (
                <SectionText
                  section={section}
                  index={state.index}
                  lang={lang}
                  params={theory.params}
                />
              )}
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
          {theory.sections.map((item, itemIndex) =>
            item.ggb || item.visual ? (
              <SplitRow
                key={item.id}
                className="h-[520px] md:h-[560px]"
                left={
                  item.visual ? (
                    <TheoryVisual
                      visual={item.visual}
                      lang={lang}
                      className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
                    />
                  ) : item.ggb ? (
                    <TheoryGgb
                      ggb={item.ggb}
                      sceneStep={item.sceneStep}
                      animate={false}
                      lang={lang}
                      className="border-b-[1.5px] border-[#d8dde5] md:border-b-0"
                    />
                  ) : null
                }
                right={
                  <SectionText
                    section={item}
                    index={itemIndex}
                    lang={lang}
                    params={theory.params}
                  />
                }
              />
            ) : (
              <div key={item.id} className="py-2">
                <SectionText
                  section={item}
                  index={itemIndex}
                  lang={lang}
                  params={theory.params}
                />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
