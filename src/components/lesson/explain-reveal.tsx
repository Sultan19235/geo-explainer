"use client";

// The hidden-until-revealed explanation block shared by document-mode
// problems and document-layout theory sections: starts closed on every
// mount, opens on the teacher's click, and (re)wires the file's
// wireExplanation hook whenever the HTML re-renders (open, language switch).

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import type { Lang } from "@/lib/i18n/strings";
import type { LessonVisualHandle, PlayerDoc } from "@/lib/lesson/player-adapter";
import { LessonHtml } from "./lesson-html";

const WORDS = {
  show: { kz: "Түсіндіруді көрсету", ru: "Показать объяснение" },
  hide: { kz: "Жасыру", ru: "Скрыть" },
} as const;

export function ExplainReveal({
  doc,
  lang,
  handleRef,
  bodyText,
}: {
  doc: PlayerDoc;
  lang: Lang;
  // The visual's live handle (owned by the surrounding player) — passed to
  // wireExplanation so explanation buttons can drive the figure.
  handleRef?: MutableRefObject<LessonVisualHandle | undefined>;
  bodyText: string;
}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !doc.wire) return;
    const root = contentRef.current;
    if (!root) return;
    try {
      doc.wire(root, { lang, visual: handleRef?.current });
    } catch (error) {
      console.error("lesson explanation wiring failed", error);
    }
    // handleRef is a ref read — identity is stable by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lang, doc]);

  const showLabel =
    (lang === "ru" ? doc.label?.ru : undefined) ??
    doc.label?.kz ??
    (WORDS.show[lang] ?? WORDS.show.kz);

  if (!open) {
    return (
      <div className="flex justify-center py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 items-center gap-2 rounded-lg bg-[#2563eb] px-6 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
        >
          <EyeIcon className="size-4" />
          {showLabel}
        </button>
      </div>
    );
  }

  return (
    <>
      <div ref={contentRef}>
        <LessonHtml html={doc.explanation} lang={lang} className={bodyText} />
      </div>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 items-center gap-1.5 rounded-md bg-[#eef1f5] px-3.5 text-[12.5px] font-semibold text-[#6b7280] transition-colors hover:bg-[#e2e6ec] hover:text-[#1a1a2e]"
        >
          <EyeOffIcon className="size-4" />
          {WORDS.hide[lang] ?? WORDS.hide.kz}
        </button>
      </div>
    </>
  );
}
