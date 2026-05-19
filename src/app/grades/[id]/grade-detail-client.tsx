"use client";

import { SiteHeader } from "@/components/site-header";
import { useT } from "@/lib/i18n/context";
import { TopicListClient, type GradeTopicListItem } from "./topic-list-client";

export function GradeDetailClient({
  gradeId,
  topics,
  errorMessage,
  accessRequired,
}: {
  gradeId: number;
  topics: GradeTopicListItem[];
  errorMessage: string | null;
  accessRequired: boolean;
}) {
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader backHref="/grades" backLabel={t("back_to_grades")} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("grade_label")(gradeId)}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("grade_topics_subtitle")}
          </p>
        </div>

        {accessRequired && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("access_required_banner")}
          </div>
        )}

        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("grades_load_error")}: {errorMessage}
          </div>
        ) : (
          <TopicListClient topics={topics} />
        )}
      </main>
    </div>
  );
}
