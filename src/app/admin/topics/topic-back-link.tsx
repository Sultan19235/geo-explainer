"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";

export function TopicBackLink() {
  const { t } = useT();
  return (
    <Link
      href="/admin/topics"
      className="text-sm text-muted-foreground hover:underline"
    >
      {t("back_to_topics")}
    </Link>
  );
}

export function NewTopicHeading() {
  const { t } = useT();
  return <h1 className="mb-6 text-2xl font-semibold">{t("new_topic_title")}</h1>;
}

export function EditTopicHeading() {
  const { t } = useT();
  return <h1 className="text-2xl font-semibold">{t("edit_topic_title")}</h1>;
}
