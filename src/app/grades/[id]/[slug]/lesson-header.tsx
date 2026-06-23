"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/lib/i18n/context";

export function LessonHeader({
  gradeId,
  localizedName,
  backHref,
  backLabel,
  subtitle,
}: {
  gradeId: number;
  localizedName: string;
  backHref: string;
  backLabel: string;
  subtitle?: string;
}) {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-30 flex min-h-[54px] items-center justify-between gap-3 border-b-[1.5px] border-[#d8dde5] bg-white px-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md border-[1.5px] border-[#d8dde5] bg-transparent px-3 py-1.5 text-[13px] font-medium text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:bg-[#f1f3f7] hover:text-[#1a1a2e]"
        >
          <ArrowLeftIcon className="size-3.5" />
          <span>{backLabel}</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold leading-tight text-[#1a1a2e]">
            {localizedName}
          </h1>
          <p className="mt-0.5 truncate text-xs font-medium text-[#6b7280]">
            {subtitle ?? t("grade_label")(gradeId)}
          </p>
        </div>
      </div>
      <LanguageToggle />
    </header>
  );
}
