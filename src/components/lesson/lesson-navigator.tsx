"use client";

// Compact one-row problem navigator (~52px): prev/next, numbered problem
// pills, counter, fullscreen. Replaces the old 102px card strip — screen
// space matters on classroom projectors.

import type { ReactNode } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import { pickText } from "@/lib/lesson/types";
import type { BankProblem } from "@/lib/lesson/player-adapter";

export function LessonNavigator({
  problems,
  activeIndex,
  onJump,
  isFullscreen,
  onToggleFullscreen,
  lang,
  extraControls,
}: {
  problems: BankProblem[];
  activeIndex: number;
  onJump: (index: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  lang: Lang;
  // Rendered before the fullscreen button — the page header is hidden in
  // fullscreen, so controls like A−/A+ move here.
  extraControls?: ReactNode;
}) {
  const iconButton =
    "grid size-9 shrink-0 place-items-center rounded-md border-[1.5px] border-[#d8dde5] bg-white text-[#6b7280] transition-colors enabled:hover:border-[#2563eb] enabled:hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex h-[52px] items-center gap-1.5 border-t-[1.5px] border-[#d8dde5] bg-white px-1.5">
      <button
        type="button"
        onClick={() => onJump(activeIndex - 1)}
        disabled={activeIndex <= 0}
        className={iconButton}
        aria-label={lang === "ru" ? "Предыдущая задача" : "Алдыңғы есеп"}
      >
        <ChevronLeftIcon className="size-[18px]" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-0.5 py-1">
        {problems.map((problem, index) => (
          <button
            key={problem.id}
            type="button"
            onClick={() => onJump(index)}
            aria-pressed={index === activeIndex}
            title={pickText(problem.title, lang)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-md border-[1.5px] border-[#d8dde5] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a2e] transition-colors hover:border-[#2563eb]",
              index === activeIndex &&
                "border-[#2563eb] bg-[#2563eb] text-white",
            )}
          >
            <span
              className={cn(
                "font-bold",
                index === activeIndex ? "text-white/85" : "text-[#6b7280]",
              )}
            >
              №{problem.number}
            </span>
            <span className="hidden max-w-[150px] truncate lg:inline">
              {pickText(problem.title, lang)}
            </span>
          </button>
        ))}
      </div>

      <span className="hidden shrink-0 px-1 text-xs font-semibold text-[#6b7280] sm:block">
        {activeIndex + 1} / {problems.length}
      </span>

      <button
        type="button"
        onClick={() => onJump(activeIndex + 1)}
        disabled={activeIndex >= problems.length - 1}
        className={iconButton}
        aria-label={lang === "ru" ? "Следующая задача" : "Келесі есеп"}
      >
        <ChevronRightIcon className="size-[18px]" />
      </button>

      <div className="mx-0.5 h-6 w-px shrink-0 bg-[#d8dde5]" />

      {extraControls}

      <button
        type="button"
        onClick={onToggleFullscreen}
        className={cn(
          iconButton,
          isFullscreen &&
            "border-[#2563eb] bg-[#2563eb] text-white enabled:hover:text-white",
        )}
        aria-label={lang === "ru" ? "Полный экран" : "Толық экран"}
      >
        {isFullscreen ? (
          <Minimize2Icon className="size-4" />
        ) : (
          <Maximize2Icon className="size-4" />
        )}
      </button>
    </div>
  );
}
