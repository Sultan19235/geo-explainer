"use client";

import { useState } from "react";
import { ClipboardListIcon } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/strings";
import { IframeWithLoader } from "@/components/iframe-with-loader";
import { cn } from "@/lib/utils";
import { LessonHeader } from "../lesson-header";

export type Quiz = {
  id: string;
  title_kz: string;
  title_ru: string | null;
  // Same-origin proxy URL for the teacher console, or null if no file / not ready.
  signed_url: string | null;
};

type Topic = {
  gradeId: number;
  slug: string;
  name_kz: string;
  name_ru: string | null;
};

function topicName(topic: Topic, lang: Lang) {
  return lang === "ru" ? topic.name_ru ?? topic.name_kz : topic.name_kz;
}

function quizTitle(quiz: Quiz, lang: Lang) {
  return lang === "ru" ? quiz.title_ru ?? quiz.title_kz : quiz.title_kz;
}

function appendLang(url: string | null, lang: Lang) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}lang=${lang}`;
}

export function QuizPageClient({
  topic,
  quizzes,
}: {
  topic: Topic;
  quizzes: Quiz[];
}) {
  const { t, lang } = useT();
  const localizedName = topicName(topic, lang);
  const usable = quizzes.filter((quiz) => Boolean(quiz.signed_url));

  const [active, setActive] = useState(0);
  // Quiz consoles are mounted lazily on first visit and kept alive afterwards
  // (hidden via CSS), so switching tabs never reloads a quiz already running.
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]));

  const openTab = (index: number) => {
    setActive(index);
    setMounted((current) =>
      current.has(index) ? current : new Set(current).add(index),
    );
  };

  const activeIndex = active < usable.length ? active : 0;

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-[#1a1a2e]">
      <LessonHeader
        gradeId={topic.gradeId}
        localizedName={localizedName}
        backHref={`/grades/${topic.gradeId}/${topic.slug}`}
        backLabel={t("hub_back_to_lesson")}
        subtitle={t("quizzes_subtitle")}
      />

      <main className="w-full px-4 py-3">
        {usable.length === 0 ? (
          <div className="flex h-[300px] flex-col items-center justify-center rounded-xl border-[1.5px] border-[#d8dde5] bg-white px-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="mb-3.5 grid size-14 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]">
              <ClipboardListIcon className="size-7" />
            </div>
            <p className="max-w-md text-[13px] leading-[1.6] text-[#6b7280]">
              {t("quizzes_none")}
            </p>
          </div>
        ) : (
          <section className="overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {usable.length > 1 && (
              <div className="flex gap-1 overflow-x-auto border-b-[1.5px] border-[#d8dde5] bg-[#f8f9fb] px-2 py-2">
                {usable.map((quiz, index) => (
                  <button
                    key={quiz.id}
                    type="button"
                    onClick={() => openTab(index)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md border-[1.5px] border-transparent px-3.5 py-1.5 text-[13px] font-semibold text-[#6b7280] transition-colors hover:text-[#1a1a2e]",
                      index === activeIndex
                        ? "border-[#d8dde5] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                        : "hover:bg-white/60",
                    )}
                    aria-pressed={index === activeIndex}
                  >
                    <ClipboardListIcon className="size-3.5 text-[#2563eb]" />
                    <span className="max-w-[180px] truncate">
                      {quizTitle(quiz, lang)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {usable.length === 1 && (
              <div className="flex min-h-12 items-center gap-3 border-b-[1.5px] border-[#d8dde5] px-[18px] py-[11px]">
                <span className="inline-flex items-center rounded bg-[#eff6ff] px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#2563eb]">
                  {t("quiz_badge")}
                </span>
                <h2 className="truncate text-sm font-semibold text-[#1a1a2e]">
                  {quizTitle(usable[0], lang)}
                </h2>
              </div>
            )}

            <div className="relative">
              {usable.map((quiz, index) =>
                mounted.has(index) ? (
                  <IframeWithLoader
                    key={`quiz:${quiz.id}:${lang}`}
                    src={appendLang(quiz.signed_url, lang) ?? undefined}
                    title={quizTitle(quiz, lang)}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals"
                    className={cn(
                      "block h-[640px] w-full border-0 bg-white md:h-[760px]",
                      index !== activeIndex && "hidden",
                    )}
                  />
                ) : null,
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
