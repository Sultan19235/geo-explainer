"use client";

// Разрядтар және кластар кестесі. The teacher picks a number chip (or types
// their own) and its digits drop into the class/place table right-aligned;
// below, the number is read out grouped by classes (8 млрд 617 млн 324).

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Lang } from "@/lib/i18n/strings";
import type { PresentSlide } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import {
  className,
  CLASS_COLUMN_SHORT,
  digitsOf,
  groupDigits,
  MAX_DIGITS,
} from "@/lib/present/places";
import { cn } from "@/lib/utils";
import { SlideHeading } from "./slide-view";

const CLASS_WORDS: { kz: string; ru: string }[] = [
  { kz: "", ru: "" },
  { kz: "мың", ru: "тыс." },
  { kz: "миллион", ru: "млн" },
  { kz: "миллиард", ru: "млрд" },
  { kz: "триллион", ru: "трлн" },
];

export function ClassTableSlide({
  slide,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "class-table" }>;
  lang: Lang;
}) {
  const presetNumbers = useMemo(
    () =>
      slide.numbers
        .map((n) => digitsOf(n))
        .filter((n): n is string => n !== null),
    [slide.numbers],
  );
  const [customNumbers, setCustomNumbers] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState("");

  const numbers = [...presetNumbers, ...customNumbers];
  const activeDigits = numbers[active] ?? "";
  const columnCount = Math.max(
    6,
    Math.ceil(Math.max(...numbers.map((n) => n.length), 1) / 3) * 3,
  );
  const classCount = columnCount / 3;

  const addCustom = () => {
    const digits = digitsOf(draft);
    if (digits === null) return;
    setCustomNumbers((prev) => [...prev, digits]);
    setActive(numbers.length);
    setDraft("");
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1250px] flex-col px-[3vw] py-[3vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />

      <div className="mb-[2.5vh] flex flex-wrap items-center gap-2">
        {numbers.map((digits, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "rounded-xl border-[2px] px-[0.8em] py-[0.35em] text-[clamp(17px,1.6vw,26px)] font-bold transition-colors",
              active === i
                ? "border-[#2563eb] bg-[#2563eb] text-white"
                : "border-[#d8dde5] bg-white text-[#1a1a2e] hover:border-[#9ca3af]",
            )}
          >
            {groupDigits(digits)}
          </button>
        ))}
        <span className="ml-1 inline-flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9 ]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCustom();
              e.stopPropagation();
            }}
            maxLength={MAX_DIGITS + 5}
            placeholder={lang === "ru" ? "своё число…" : "өз саның…"}
            className="w-[9em] rounded-xl border-[2px] border-dashed border-[#c5cad3] bg-white px-[0.7em] py-[0.35em] text-[clamp(16px,1.4vw,23px)] font-semibold outline-none focus:border-[#2563eb]"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={digitsOf(draft) === null}
            aria-label="+"
            className="grid size-[clamp(36px,3vw,48px)] place-items-center rounded-xl border-[2px] border-[#d8dde5] bg-white text-[#2245c3] transition-colors hover:border-[#2563eb] disabled:opacity-40"
          >
            <Plus className="size-[60%]" aria-hidden />
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {Array.from({ length: classCount }, (_, i) => {
                const cls = classCount - 1 - i;
                return (
                  <th
                    key={cls}
                    colSpan={3}
                    className={cn(
                      "border-[2px] border-[#c5cad3] px-2 py-[0.5em] text-[clamp(15px,1.5vw,24px)] font-bold",
                      cls % 2 === 0
                        ? "bg-[#eaf2fe] text-[#1e3a8a]"
                        : "bg-[#fef3c7] text-[#92400e]",
                    )}
                  >
                    {className(cls, lang)}
                  </th>
                );
              })}
            </tr>
            <tr>
              {Array.from({ length: columnCount }, (_, i) => {
                const cls = classCount - 1 - Math.floor(i / 3);
                const short = CLASS_COLUMN_SHORT[i % 3];
                return (
                  <th
                    key={i}
                    className={cn(
                      "border-[2px] border-[#c5cad3] px-1 py-[0.3em] text-[clamp(11px,1vw,16px)] font-semibold text-[#6b7280]",
                      cls % 2 === 0 ? "bg-[#f4f8fe]" : "bg-[#fefaf0]",
                    )}
                  >
                    {lang === "ru" ? short.ru : short.kz}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Array.from({ length: columnCount }, (_, i) => {
                const place = columnCount - 1 - i;
                const digit =
                  place < activeDigits.length
                    ? activeDigits[activeDigits.length - 1 - place]
                    : "";
                return (
                  <td
                    key={i}
                    className="h-[clamp(56px,9vh,96px)] border-[2px] border-[#c5cad3] bg-white text-center text-[clamp(28px,3.2vw,52px)] font-bold text-[#1a1a2e]"
                  >
                    {digit && (
                      <span
                        key={`${active}-${place}`}
                        className="inline-block animate-in fade-in slide-in-from-top-2 duration-300"
                      >
                        {digit}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-[3vh] text-center text-[clamp(22px,2.4vw,38px)] font-semibold text-[#1a1a2e]">
        {readByClasses(activeDigits, lang)}
      </p>
      </div>
    </div>
  );
}

/** "8617000324" → "8 миллиард 617 миллион 324" (zero classes skipped). */
function readByClasses(digits: string, lang: Lang): string {
  if (!digits) return "";
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  const parts: string[] = [];
  groups.forEach((group, i) => {
    const cls = groups.length - 1 - i;
    const value = Number(group);
    if (value === 0 && groups.length > 1) return;
    const word = CLASS_WORDS[cls]?.[lang === "ru" ? "ru" : "kz"] ?? "";
    parts.push(word ? `${value} ${word}` : String(value));
  });
  return parts.join(" ");
}
