"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";

const GRADES = [7, 8, 9, 10, 11] as const;

export function GradesClient({
  counts,
  errorMessage,
}: {
  counts: Record<number, number>;
  errorMessage: string | null;
}) {
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("grades_title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("grades_subtitle")}</p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("grades_load_error")}: {errorMessage}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {GRADES.map((grade) => {
            const count = counts[grade] ?? 0;
            return (
              <Link
                key={grade}
                href={`/grades/${grade}`}
                className="group block focus:outline-none"
              >
                <Card className="h-full border-border/80 bg-background transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-blue-500 group-hover:shadow-lg group-hover:shadow-blue-500/10 group-focus-visible:border-blue-500">
                  <CardContent className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <span className="text-5xl font-bold tracking-tight text-blue-600">
                      {grade}
                    </span>
                    <span className="text-base font-semibold">
                      {t("grade_badge")(grade)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {count > 0
                        ? t("grade_topics_count")(count)
                        : t("grade_topics_zero")}
                    </span>
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
