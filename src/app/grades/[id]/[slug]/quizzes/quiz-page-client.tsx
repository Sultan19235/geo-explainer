"use client";

import { useState } from "react";
import { ClipboardListIcon } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/strings";
import { IframeWithLoader } from "@/components/iframe-with-loader";
import { PackConsoleClient } from "@/app/play/[quizId]/host/pack-console-client";
import type {
  Localized,
  PackGenerator,
  PackQuestion,
  PackTagGroup,
} from "@/lib/quiz/pack";
import { cn } from "@/lib/utils";
import { LessonHeader } from "../lesson-header";

export type Quiz = {
  id: string;
  title_kz: string;
  title_ru: string | null;
  // Same-origin proxy URL for the teacher console, or null if no file / not ready.
  signed_url: string | null;
  // Engine quiz (pack) — rendered as a native console instead of an iframe.
  pack: {
    title: Localized;
    questions: PackQuestion[];
    tagGroups?: PackTagGroup[];
    generator?: PackGenerator;
    // Uploaded drill-generator source — the tournament console builds its
    // answer keys from it (null for registry topics and fixed packs).
    generatorCode: string | null;
  } | null;
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
  const usable = quizzes.filter((quiz) =>
    Boolean(quiz.signed_url || quiz.pack),
  );

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
          <>
            {usable.length > 1 && (
              <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                {usable.map((quiz, index) => (
                  <button
                    key={quiz.id}
                    type="button"
                    onClick={() => openTab(index)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                      index === activeIndex
                        ? "bg-[#eff6ff] text-[#1d4ed8]"
                        : "text-[#6b7280] hover:bg-[#f1f3f7] hover:text-[#1a1a2e]",
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

            {usable.map((quiz, index) => {
              if (!mounted.has(index)) return null;
              if (quiz.pack) {
                // Native engine console — rendered bare so its setup phase
                // reads as part of the lesson page (it frames itself once a
                // room opens). Kept mounted across tab switches (like the
                // iframes) so a running session survives.
                return (
                  <div
                    key={`quiz:${quiz.id}`}
                    className={cn(index !== activeIndex && "hidden")}
                  >
                    <PackConsoleClient
                      quizId={quiz.id}
                      title={quiz.pack.title}
                      questions={quiz.pack.questions}
                      tagGroups={quiz.pack.tagGroups}
                      embedded
                      generator={quiz.pack.generator ?? null}
                      generatorCode={quiz.pack.generatorCode}
                    />
                  </div>
                );
              }
              // Legacy HTML quiz — keeps the framed card the iframe needs.
              return (
                <section
                  key={`quiz:${quiz.id}`}
                  className={cn(
                    "overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                    index !== activeIndex && "hidden",
                  )}
                >
                  {usable.length === 1 && (
                    <div className="flex min-h-12 items-center gap-3 border-b-[1.5px] border-[#d8dde5] px-[18px] py-[11px]">
                      <span className="inline-flex items-center rounded bg-[#eff6ff] px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#2563eb]">
                        {t("quiz_badge")}
                      </span>
                      <h2 className="truncate text-sm font-semibold text-[#1a1a2e]">
                        {quizTitle(quiz, lang)}
                      </h2>
                    </div>
                  )}
                  <IframeWithLoader
                    key={`iframe:${lang}`}
                    src={appendLang(quiz.signed_url, lang) ?? undefined}
                    title={quizTitle(quiz, lang)}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals"
                    className="block h-[640px] w-full border-0 bg-white md:h-[760px]"
                  />
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
