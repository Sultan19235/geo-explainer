"use client";

// Compact one-row problem navigator (~52px): prev/next, numbered problem
// pills (click to jump, drag to reorder), counter. Replaces the old 102px
// card strip — screen space matters on classroom projectors. Fullscreen and
// A−/A+ live in the section header now, not here.

import { useRef } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import { pickText } from "@/lib/lesson/types";
import type { BankProblem } from "@/lib/lesson/player-adapter";

function SortablePill({
  problem,
  isActive,
  onClick,
  lang,
}: {
  problem: BankProblem;
  isActive: boolean;
  onClick: () => void;
  lang: Lang;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: problem.id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onClick}
      aria-pressed={isActive}
      title={pickText(problem.title, lang)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex h-9 shrink-0 touch-manipulation select-none items-center gap-1.5 rounded-md border-[1.5px] border-[#d8dde5] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a2e] transition-colors hover:border-[#2563eb]",
        isActive && "border-[#2563eb] bg-[#2563eb] text-white",
        isDragging &&
          "relative z-10 cursor-grabbing opacity-90 shadow-[0_4px_12px_rgba(15,23,42,0.18)]",
      )}
    >
      <span
        className={cn(
          "font-bold",
          isActive ? "text-white/85" : "text-[#6b7280]",
        )}
      >
        №{problem.number}
      </span>
      <span className="hidden max-w-[150px] truncate lg:inline">
        {pickText(problem.title, lang)}
      </span>
    </button>
  );
}

export function LessonNavigator({
  problems,
  activeIndex,
  onJump,
  onReorder,
  lang,
}: {
  problems: BankProblem[];
  activeIndex: number;
  onJump: (index: number) => void;
  // Commits a drag-reorder: the full problem id list in its new order.
  onReorder: (ids: string[]) => void;
  lang: Lang;
}) {
  // A completed drag still dispatches a click on the dragged pill — swallow
  // it so reordering doesn't also jump to that problem.
  const suppressClickRef = useRef(false);
  const sensors = useSensors(
    // Distance/delay activation keeps plain clicks (mouse) and scroll swipes
    // (touch boards) working; only a deliberate drag picks a pill up.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 150);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = problems.map((problem) => problem.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

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

      <DndContext
        // Stable id: dnd-kit otherwise generates one per render pass and the
        // server/client aria-describedby ids mismatch (hydration warning).
        id="lesson-navigator-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={problems.map((problem) => problem.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-0.5 py-1">
            {problems.map((problem, index) => (
              <SortablePill
                key={problem.id}
                problem={problem}
                isActive={index === activeIndex}
                lang={lang}
                onClick={() => {
                  if (!suppressClickRef.current) onJump(index);
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
    </div>
  );
}
