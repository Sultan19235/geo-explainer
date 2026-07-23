"use client";

import Link from "next/link";
import {
  BookOpenIcon,
  ChevronRightIcon,
  ClipboardListIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/strings";
import { LessonHeader } from "./lesson-header";

type Topic = {
  gradeId: number;
  slug: string;
  name_kz: string;
  name_ru: string | null;
  description_kz: string | null;
  description_ru: string | null;
};

function topicName(topic: Topic, lang: Lang) {
  return lang === "ru" ? topic.name_ru ?? topic.name_kz : topic.name_kz;
}

function topicDescription(topic: Topic, lang: Lang) {
  return lang === "ru"
    ? topic.description_ru ?? topic.description_kz
    : topic.description_kz;
}

export function LessonHubClient({
  topic,
  problemCount,
  quizCount,
}: {
  topic: Topic;
  problemCount: number;
  quizCount: number;
}) {
  const { t, lang } = useT();
  const localizedName = topicName(topic, lang);
  const description = topicDescription(topic, lang);
  const base = `/grades/${topic.gradeId}/${topic.slug}`;

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-[#1a1a2e]">
      <LessonHeader
        gradeId={topic.gradeId}
        localizedName={localizedName}
        backHref={`/grades/${topic.gradeId}`}
        backLabel={t("hub_back_to_lessons")}
      />

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {description && (
          <p className="mb-6 text-sm leading-relaxed text-[#6b7280]">
            {description}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <HubCard
            href={`${base}/learn`}
            badgeClass="bg-[#ecfdf5] text-[#16a34a]"
            icon={<BookOpenIcon className="size-6" />}
            title={t("hub_learn_title")}
            subtitle={t("hub_learn_subtitle")}
            meta={t("hub_problems_count")(problemCount)}
          />
          <HubCard
            href={`${base}/quizzes`}
            badgeClass="bg-[#eff6ff] text-[#2563eb]"
            icon={<ClipboardListIcon className="size-6" />}
            title={t("hub_quizzes_title")}
            subtitle={t("hub_quizzes_subtitle")}
            meta={
              quizCount > 0
                ? t("hub_quizzes_count")(quizCount)
                : t("hub_quizzes_empty")
            }
          />
        </div>
      </main>
    </div>
  );
}

function HubCard({
  href,
  badgeClass,
  icon,
  title,
  subtitle,
  meta,
}: {
  href: string;
  badgeClass: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_8px_22px_rgba(37,99,235,0.12)]"
    >
      <div className="flex items-start justify-between">
        <span
          className={`grid size-12 place-items-center rounded-xl ${badgeClass}`}
        >
          {icon}
        </span>
        <ChevronRightIcon className="size-5 text-[#9ca3af] transition-transform group-hover:translate-x-0.5 group-hover:text-[#2563eb]" />
      </div>
      <div>
        <h2 className="text-base font-bold text-[#1a1a2e]">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">
          {subtitle}
        </p>
      </div>
      <span className="mt-auto inline-flex w-fit items-center rounded-full bg-[#f1f3f7] px-2.5 py-1 text-xs font-semibold text-[#6b7280]">
        {meta}
      </span>
    </Link>
  );
}
