"use client";

// Two-pane row with a draggable divider (desktop only — mobile keeps the
// stacked rows layout). The ratio is shared LIVE across every SplitRow on
// the page through a tiny module store (theory slides, scroll-mode rows and
// the problem player all follow one drag) and persists via localStorage.
// Double-click resets to 50/50.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lesson-split-ratio";
const MIN = 25;
const MAX = 70;

function clamp(value: number): number {
  return Math.min(MAX, Math.max(MIN, value));
}

// Module-level store: one ratio, every mounted SplitRow subscribes.
let sharedRatio = 50;
let storageLoaded = false;
const listeners = new Set<(ratio: number) => void>();

function loadStoredRatio() {
  if (storageLoaded || typeof window === "undefined") return;
  storageLoaded = true;
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(stored) && stored >= MIN && stored <= MAX) {
    sharedRatio = stored;
  }
}

function setSharedRatio(ratio: number) {
  sharedRatio = ratio;
  for (const listener of listeners) listener(ratio);
}

function persistSharedRatio() {
  window.localStorage.setItem(STORAGE_KEY, String(Math.round(sharedRatio)));
}

export function SplitRow({
  left,
  right,
  className,
}: {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(50);
  const [isDesktop, setIsDesktop] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    loadStoredRatio();
    setRatio(sharedRatio);
    const listener = (value: number) => setRatio(value);
    listeners.add(listener);

    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => {
      listeners.delete(listener);
      media.removeEventListener("change", update);
    };
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSharedRatio(clamp(((event.clientX - rect.left) / rect.width) * 100));
  }, [dragging]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    persistSharedRatio();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,4fr)] md:grid-rows-1",
        dragging && "select-none",
        className,
      )}
      style={
        isDesktop
          ? {
              gridTemplateColumns: `minmax(0, ${ratio}fr) auto minmax(0, ${
                100 - ratio
              }fr)`,
            }
          : undefined
      }
    >
      {left}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          setSharedRatio(50);
          persistSharedRatio();
        }}
        className={cn(
          "group relative hidden w-[9px] cursor-col-resize touch-none items-center justify-center bg-[#f1f3f7] transition-colors hover:bg-[#dbe3f0] md:flex",
          dragging && "bg-[#c7d7f5]",
        )}
      >
        <div
          className={cn(
            "h-9 w-[3px] rounded-full bg-[#c5cad3] transition-colors group-hover:bg-[#2563eb]",
            dragging && "bg-[#2563eb]",
          )}
        />
      </div>
      {right}
    </div>
  );
}
