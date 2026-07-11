"use client";

import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { GRADES } from "@/lib/grades";
import { useT } from "@/lib/i18n/context";

export type GradeCounts = {
  topics: number;
  quizzes: number;
};

export function GradesClient({
  counts,
  errorMessage,
}: {
  counts: Record<number, GradeCounts>;
  errorMessage: string | null;
}) {
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("grades_title")}
          </h1>
          <div
            aria-hidden
            className="mt-3 h-[3px] w-10 rounded-full bg-pen-blue"
          />
          <p className="mt-3 text-muted-foreground">{t("grades_subtitle")}</p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("grades_load_error")}: {errorMessage}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {GRADES.map((grade) => {
            const c = counts[grade] ?? { topics: 0, quizzes: 0 };
            return (
              <Link
                key={grade}
                href={`/grades/${grade}`}
                className="group block focus:outline-none"
              >
                <Card className="transition-all duration-150 group-hover:-translate-y-px group-hover:shadow-md group-hover:shadow-primary/5 group-hover:ring-primary/40 group-focus-visible:ring-primary">
                  <CardContent className="flex items-center gap-4 sm:gap-5">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent font-heading text-2xl font-bold text-primary">
                      {grade}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">
                        {t("grade_badge")(grade)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {c.topics > 0 ? (
                          <>
                            <span className="rounded-full bg-pen-blue-soft px-2 py-0.5 text-xs font-semibold text-pen-blue">
                              {t("grade_topics_badge")(c.topics)}
                            </span>
                            {c.quizzes > 0 && (
                              <span className="rounded-full bg-pen-red-soft px-2 py-0.5 text-xs font-semibold text-pen-red">
                                {t("grade_quizzes_badge")(c.quizzes)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {t("grade_topics_zero")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="hidden shrink-0 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:inline">
                      {t("profile_open_grade")}
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="size-5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
                    />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
