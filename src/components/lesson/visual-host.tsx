"use client";

// Hosts a lesson file's plain-JS visual: the file draws SVG/HTML/CSS into a
// div this component owns. The visual function re-runs on language switch
// (all visible text comes from ctx.lang); a returned handle with destroy()
// is cleaned up before every re-mount so rAF loops and timers can't leak.

import { useEffect, useRef } from "react";
import type { Lang } from "@/lib/i18n/strings";
import type {
  LessonVisualFn,
  LessonVisualHandle,
} from "@/lib/lesson/player-adapter";

export function VisualHost({
  visual,
  lang,
  onHandle,
  className,
}: {
  visual: LessonVisualFn;
  lang: Lang;
  // Receives the handle the visual returned (undefined after cleanup) — the
  // doc player passes it on to wireExplanation.
  onHandle?: (handle: LessonVisualHandle | undefined) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onHandleRef = useRef(onHandle);
  onHandleRef.current = onHandle;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = "";
    let handle: LessonVisualHandle | undefined;
    try {
      handle = visual(root, { lang }) ?? undefined;
    } catch (error) {
      console.error("lesson visual failed", error);
    }
    onHandleRef.current?.(handle);
    return () => {
      try {
        handle?.destroy?.();
      } catch {
        // cleanup is best-effort
      }
      onHandleRef.current?.(undefined);
      root.innerHTML = "";
    };
  }, [visual, lang]);

  return <div ref={ref} className={className} />;
}
