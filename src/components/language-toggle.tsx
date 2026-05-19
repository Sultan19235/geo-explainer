"use client";

import { useLanguage } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/strings";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: "kz", label: "KZ" },
  { value: "ru", label: "RU" },
];

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-[#d8dde5] bg-[#f8f9fb] p-0.5",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = lang === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLang(option.value)}
            aria-pressed={active}
            className={cn(
              "rounded-[5px] px-3.5 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-[#2563eb] text-white shadow-sm"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
