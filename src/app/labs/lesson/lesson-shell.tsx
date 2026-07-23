"use client";

// The lesson page shell shared by every topic: sticky header (back, title,
// Теория|Есептер scrollspy tabs, A−/A+, KZ/RU), theory section, problems
// section with bank drawer + navigator + fullscreen. Content plugs in via
// theorySlot / renderProblem, so native packs and uploaded lesson files get
// the identical classroom experience.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { LanguageToggle } from "@/components/language-toggle";
import { LessonNavigator } from "@/components/lesson/lesson-navigator";
import { ProblemPicker } from "@/components/lesson/problem-picker";
import { TheoryChromeProvider } from "@/components/lesson/theory-chrome";
import {
  SolveModeTabs,
  useSolveMode,
  type SolveMode,
} from "@/components/lesson/solve-mode";
import {
  FontSizeControl,
  useLessonFontScale,
} from "@/components/lesson/font-size-control";
import { pickText, type Localized } from "@/lib/lesson/types";
import type { BankProblem } from "@/lib/lesson/player-adapter";
import type { Lang } from "@/lib/i18n/strings";

const WORDS = {
  theory: { kz: "Теория", ru: "Теория" },
  problems: { kz: "Есептер", ru: "Задачи" },
} as const;

type SectionId = "theory" | "problems";

function readSelectionFromUrl(bank: BankProblem[]): string[] | null {
  const raw = new URLSearchParams(window.location.search).get("q");
  if (!raw) return null;
  const known = new Set(bank.map((problem) => problem.id));
  const ids: string[] = [];
  for (const id of raw.split(",")) {
    if (known.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

export function LessonShell({
  topicId,
  title,
  subtitle,
  backHref = "/labs/lesson",
  bank,
  theorySlot,
  renderProblem,
  onActiveProblem,
}: {
  topicId: string;
  title: Localized;
  subtitle?: Localized;
  // Where the header's back arrow leads — /labs/lesson for the pilot list,
  // the topic hub when the lesson is served on the main site.
  backHref?: string;
  bank: BankProblem[];
  theorySlot: ReactNode;
  renderProblem: (
    problem: BankProblem,
    ctx: { isFullscreen: boolean; lang: Lang; solveMode: SolveMode },
  ) => ReactNode;
  // Fires when the active problem changes — used to preload the next one.
  onActiveProblem?: (
    problem: BankProblem,
    nextProblem: BankProblem | null,
  ) => void;
}) {
  const { t, lang } = useT();
  const font = useLessonFontScale();
  const [solveMode, setSolveMode] = useSolveMode();
  // null = default: the whole bank in its order. A non-null array is the
  // teacher's explicit pick (its order = lesson order).
  const [appliedIds, setAppliedIds] = useState<string[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Which section (if any) is blown up to fill the screen. Theory and
  // problems each get their own fullscreen toggle; only one at a time.
  const [fullscreen, setFullscreen] = useState<SectionId | null>(null);
  const isTheoryFull = fullscreen === "theory";
  const isProblemsFull = fullscreen === "problems";
  const [activeSection, setActiveSection] = useState<SectionId>("theory");
  const theoryRef = useRef<HTMLElement>(null);
  const problemsRef = useRef<HTMLElement>(null);

  const problems = useMemo(() => {
    if (appliedIds === null) return bank;
    const byId = new Map(bank.map((problem) => [problem.id, problem]));
    return appliedIds
      .map((id) => byId.get(id))
      .filter((problem): problem is BankProblem => problem !== undefined);
  }, [appliedIds, bank]);

  const problem = problems[activeIndex];

  // A reload must land on the theory top — not wherever the browser saved
  // the scroll position last time.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
    const urlSelection = readSelectionFromUrl(bank);
    if (urlSelection) setAppliedIds(urlSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Fullscreen locks page scroll on <html>, NOT <body>: Base UI's dialog
  // scroll lock bails out when <html> overflow is already hidden, so the two
  // locks can never clobber each other's saved styles (the old body-level
  // lock left the page stuck unscrollable after fullscreen → bank → exit
  // fullscreen → close bank).
  useEffect(() => {
    if (!fullscreen) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen || pickerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, pickerOpen]);

  useEffect(() => {
    if (!problem || !onActiveProblem) return;
    onActiveProblem(problem, problems[activeIndex + 1] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem?.id]);

  const jump = (index: number) => {
    if (index >= 0 && index < problems.length) setActiveIndex(index);
  };

  const applySelection = (ids: string[]) => {
    const currentId = problem?.id;
    setAppliedIds(ids);
    const nextIndex = currentId ? ids.indexOf(currentId) : -1;
    setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
    // Keep the selection shareable/bookmarkable; picking exactly the whole
    // bank in its order is the default, so it keeps a clean URL.
    const url = new URL(window.location.href);
    const isDefault =
      ids.length === bank.length && ids.every((id, index) => bank[index].id === id);
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
              href={backHref}
              className="flex items-center gap-1.5 rounded-md border-[1.5px] border-[#d8dde5] px-3 py-1.5 text-[13px] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
            >
              <ArrowLeftIcon className="size-4" />
            </Link>
            <div className="hidden min-w-0 md:block">
              <div className="truncate text-[15px] font-bold leading-tight">
                {pickText(title, lang)}
              </div>
              {subtitle && (
                <div className="truncate text-xs text-[#6b7280]">
                  {pickText(subtitle, lang)}
                </div>
              )}
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
        <TheoryChromeProvider
          value={{
            isFullscreen: isTheoryFull,
            onToggleFullscreen: () =>
              setFullscreen((s) => (s === "theory" ? null : "theory")),
            fontIndex: font.index,
            onFontChange: font.change,
            lang,
          }}
        >
          <section
            ref={theoryRef}
            className={cn(
              "scroll-mt-[72px] overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
              isTheoryFull &&
                "fixed inset-0 z-[100] flex flex-col rounded-none border-0",
            )}
          >
            {theorySlot}
          </section>
        </TheoryChromeProvider>

        <section
          ref={problemsRef}
          className={cn(
            "mt-4 scroll-mt-[72px] overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
            isProblemsFull &&
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
            <SolveModeTabs mode={solveMode} onChange={setSolveMode} lang={lang} />
            <span className="hidden text-xs font-semibold text-[#6b7280] sm:block">
              {problems.length} / {bank.length}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-md border-[1.5px] border-[#d8dde5] bg-white px-2.5 py-1 text-xs font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
            >
              <ListChecksIcon className="size-4" />
              {t("bank_button")}
            </button>
            {/* A−/A+ only while fullscreen — the global header (hidden then)
                carries it otherwise, so no duplicate control in normal view. */}
            {isProblemsFull && (
              <FontSizeControl
                index={font.index}
                onChange={font.change}
                lang={lang}
              />
            )}
            <button
              type="button"
              onClick={() =>
                setFullscreen((s) => (s === "problems" ? null : "problems"))
              }
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-md border-[1.5px] border-[#d8dde5] bg-white text-[#6b7280] transition-colors hover:border-[#2563eb] hover:text-[#2563eb]",
                isProblemsFull &&
                  "border-[#2563eb] bg-[#2563eb] text-white hover:text-white",
              )}
              aria-label={lang === "ru" ? "Полный экран" : "Толық экран"}
            >
              {isProblemsFull ? (
                <Minimize2Icon className="size-4" />
              ) : (
                <Maximize2Icon className="size-4" />
              )}
            </button>
          </div>

          {problem &&
            renderProblem(problem, {
              isFullscreen: isProblemsFull,
              lang,
              solveMode,
            })}

          <LessonNavigator
            problems={problems}
            activeIndex={activeIndex}
            onJump={jump}
            // Drag-reorder commits through the same path as the bank picker,
            // so the active problem and the ?q= URL stay in sync.
            onReorder={applySelection}
            lang={lang}
          />
        </section>
      </main>

      <ProblemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        problems={bank}
        appliedIds={appliedIds}
        onApply={applySelection}
        topicId={topicId}
        topicTitle={pickText(title, lang)}
        lang={lang}
      />
    </div>
  );
}
