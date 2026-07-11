"use client";

import Link from "next/link";
import { ArrowRightIcon, LockIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export type GradeTopicListItem = {
  id: string;
  gradeId: number;
  slug: string;
  name_kz: string;
  name_ru: string | null;
  description_kz: string | null;
  description_ru: string | null;
  is_free_sample: boolean;
  isAccessible: boolean;
};

type Props = {
  topics: GradeTopicListItem[];
};

export function TopicListClient({ topics }: Props) {
  const { t, lang } = useT();

  if (topics.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border bg-muted/30 px-4 py-12 text-center">
        <p className="text-muted-foreground">{t("no_topics_in_grade")}</p>
        <Link
          href="/grades"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("back_to_grades")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {topics.map((topic) => {
        const name = lang === "ru" ? topic.name_ru ?? topic.name_kz : topic.name_kz;
        const rawDescription =
          lang === "ru"
            ? topic.description_ru ?? topic.description_kz
            : topic.description_kz;
        const description = formatDescription(rawDescription, t("no_description"));

        const card = (
          <Card
            className={cn(
              "h-full border-border/80 bg-background transition-all duration-150",
              topic.isAccessible
                ? "group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:shadow-primary/5 group-hover:ring-primary/40"
                : "opacity-80",
            )}
          >
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-xl">{name}</CardTitle>
                <div className="flex shrink-0 items-center gap-2">
                  {topic.is_free_sample && (
                    <span className="rounded-full bg-sun-soft px-2.5 py-1 text-xs font-medium text-sun ring-1 ring-sun-bright/40">
                      {t("free_sample_badge")}
                    </span>
                  )}
                  {!topic.isAccessible && (
                    <LockIcon className="size-4 text-muted-foreground" />
                  )}
                  {topic.isAccessible && (
                    <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {description}
            </CardContent>
          </Card>
        );

        if (topic.isAccessible) {
          return (
            <Link
              key={topic.id}
              href={`/grades/${topic.gradeId}/${topic.slug}`}
              className="group block focus:outline-none"
            >
              {card}
            </Link>
          );
        }

        return (
          <button
            key={topic.id}
            type="button"
            className="group block w-full text-left focus:outline-none"
            onClick={() => alert(t("access_required_alert"))}
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}

function formatDescription(description: string | null, fallback: string) {
  if (!description) return fallback;
  if (description.length <= 120) return description;
  return `${description.slice(0, 117).trim()}...`;
}
