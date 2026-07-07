"use client";

// Pilot of the native lesson player: Цилиндр theory pack + problem packs
// rendered without iframes. One GeoGebra engine load, instant KZ/RU switch,
// compact navigation. /labs/lesson

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { ArrowLeftIcon, ListChecksIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { LanguageToggle } from "@/components/language-toggle";
import { TheoryPlayer } from "@/components/lesson/theory-player";
import { ProblemPlayer } from "@/components/lesson/problem-player";
import { LessonNavigator } from "@/components/lesson/lesson-navigator";
import { ProblemPicker } from "@/components/lesson/problem-picker";
import {
  FontSizeControl,
  useLessonFontScale,
} from "@/components/lesson/font-size-control";
import { pickText, type ProblemPack } from "@/lib/lesson/types";
import {
  cylinderProblems,
  cylinderTheory,
} from "@/lib/lesson/packs/cylinder";

const TOPIC_ID = "cylinder";
const TOPIC_TITLE = "Цилиндр";

const WORDS = {
  theory: { kz: "Теория", ru: "Теория" },
  problems: { kz: "Есептер", ru: "Задачи" },
} as const;

type SectionId = "theory" | "problems";

function readSelectionFromUrl(): string[] | null {
  const raw = new URLSearchParams(window.location.search).get("q");
  if (!raw) return null;
  const known = new Set(cylinderProblems.map((problem) => problem.id));
  const ids: string[] = [];
  for (const id of raw.split(",")) {
    if (known.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

export function LessonLabClient() {
  const { t, lang } = useT();
  const font = useLessonFontScale();
  // null = default: the whole bank in pack order. A non-null array is the
  // teacher's explicit pick (its order = lesson order).
  const [appliedIds, setAppliedIds] = useState<string[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("theory");
  const theoryRef = useRef<HTMLElement>(null);
  const problemsRef = useRef<HTMLElement>(null);

  const problems = useMemo(() => {
    if (appliedIds === null) return cylinderProblems;
    const byId = new Map(cylinderProblems.map((problem) => [problem.id, problem]));
    return appliedIds
      .map((id) => byId.get(id))
      .filter((problem): problem is ProblemPack => problem !== undefined);
  }, [appliedIds]);

  const problem = problems[activeIndex];

  // A reload must land on the theory top — not wherever the browser saved
  // the scroll position last time.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
    const urlSelection = readSelectionFromUrl();
    if (urlSelection) setAppliedIds(urlSelection);
  }, []);

  // Scrollspy for the Теория | Есептер tabs: problems is "active" once its
  // section top crosses into the upper half of the viewport.
  useEffect(() => {
    const onScroll = () => {
      const node = problemsRef.current;
      if (!node) return;
      setActiveSection(
        node.getBoundingClientRect().top < window.innerHeight * 0.45
          ? "problems"
          : "theory",
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isFullscreen]);

  const jump = (index: number) => {
    if (index >= 0 && index < problems.length) setActiveIndex(index);
  };

  const applySelection = (ids: string[]) => {
    const currentId = problem?.id;
    setAppliedIds(ids);
    const nextIndex = currentId ? ids.indexOf(currentId) : -1;
    setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
    // Keep the selection shareable/bookmarkable; picking exactly the whole
    // bank in pack order is the default, so it keeps a clean URL.
    const url = new URL(window.location.href);
    const isDefault =
      ids.length === cylinderProblems.length &&
      ids.every((id, index) => cylinderProblems[index].id === id);
    if (isDefault) url.searchParams.delete("q");
    else url.searchParams.set("q", ids.join(","));
    window.history.replaceState(null, "", url);
  };

  const jumpToSection = (section: SectionId) => {
    const node = section === "theory" ? theoryRef.current : problemsRef.current;
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      // overflow-anchor off: lazy applets/KaTeX resize content while loading
      // and Chrome's scroll anchoring would yank the page around (the old
      // "jumps to the last slide" bug).
      className="min-h-screen bg-[#f8f9fb] text-[#1a1a2e] [overflow-anchor:none]"
      style={{ "--lesson-scale": font.scale } as CSSProperties}
    >
      <header className="sticky top-0 z-30 border-b-[1.5px] border-[#d8dde5] bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md border-[1.5px] border-[#d8dde5] px-3 py-1.5 text-[13px] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
            >
              <ArrowLeftIcon className="size-4" />
            </Link>
            <div className="hidden min-w-0 md:block">
              <div className="truncate text-[15px] font-bold leading-tight">
                Цилиндр
              </div>
              <div className="truncate text-xs text-[#6b7280]">
                {pickText(cylinderTheory.subtitle, lang)}
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-0.5 rounded-md border border-[#d8dde5] bg-[#f8f9fb] p-0.5">
            {(["theory", "problems"] as const).map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => jumpToSection(section)}
                aria-pressed={activeSection === section}
                className={cn(
                  "rounded-[5px] px-3 py-1 text-xs font-semibold transition-colors",
                  activeSection === section
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "text-[#6b7280] hover:text-[#1a1a2e]",
                )}
              >
                {WORDS[section][lang] ?? WORDS[section].kz}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <FontSizeControl
              index={font.index}
              onChange={font.change}
              lang={lang}
            />
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-3">
        <section
          ref={theoryRef}
          className="scroll-mt-[72px] overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
          <TheoryPlayer pack={cylinderTheory} lang={lang} />
        </section>

        <section
          ref={problemsRef}
          className={cn(
            "mt-4 scroll-mt-[72px] overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
            isFullscreen &&
              "fixed inset-0 z-[100] mt-0 flex flex-col rounded-none border-0",
          )}
        >
          <div className="flex min-h-12 flex-wrap items-center gap-3 border-b-[1.5px] border-[#d8dde5] px-[18px] py-[10px]">
            <span className="inline-flex items-center rounded bg-[#eff6ff] px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#2563eb]">
              {WORDS.problems[lang] ?? WORDS.problems.kz}
            </span>
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1a1a2e]">
              {problem
                ? `№${problem.number} — ${pickText(problem.title, lang)}`
                : ""}
            </h2>
            <span className="text-xs font-semibold text-[#6b7280]">
              {problems.length} / {cylinderProblems.length}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-md border-[1.5px] border-[#d8dde5] bg-white px-2.5 py-1 text-xs font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
            >
              <ListChecksIcon className="size-4" />
              {t("bank_button")}
            </button>
          </div>

          {problem && (
            <ProblemPlayer
              key={problem.id}
              problem={problem}
              lang={lang}
              hotkeys={isFullscreen}
              className={isFullscreen ? "min-h-0 flex-1" : "h-[620px]"}
            />
          )}

          <LessonNavigator
            problems={problems}
            activeIndex={activeIndex}
            onJump={jump}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((value) => !value)}
            lang={lang}
            extraControls={
              isFullscreen ? (
                <FontSizeControl
                  index={font.index}
                  onChange={font.change}
                  lang={lang}
                />
              ) : undefined
            }
          />
        </section>
      </main>

      <ProblemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        problems={cylinderProblems}
        appliedIds={appliedIds}
        onApply={applySelection}
        topicId={TOPIC_ID}
        topicTitle={TOPIC_TITLE}
        lang={lang}
      />
    </div>
  );
}
