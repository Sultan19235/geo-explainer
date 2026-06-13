"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";

export function QuizBackLink() {
  const { t } = useT();
  return (
    <Link
      href="/admin/quizzes"
      className="text-sm text-muted-foreground hover:underline"
    >
      {t("back_to_quizzes")}
    </Link>
  );
}

export function NewQuizHeading() {
  const { t } = useT();
  return <h1 className="mb-6 text-2xl font-semibold">{t("new_quiz_title")}</h1>;
}

export function EditQuizHeading() {
  const { t } = useT();
  return <h1 className="text-2xl font-semibold">{t("edit_quiz_title")}</h1>;
}
