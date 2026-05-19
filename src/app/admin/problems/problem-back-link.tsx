"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";

export function ProblemBackLink() {
  const { t } = useT();
  return (
    <Link
      href="/admin/problems"
      className="text-sm text-muted-foreground hover:underline"
    >
      {t("back_to_problems")}
    </Link>
  );
}

export function NewProblemHeading() {
  const { t } = useT();
  return (
    <h1 className="mb-6 text-2xl font-semibold">{t("new_problem_title")}</h1>
  );
}

export function EditProblemHeading() {
  const { t } = useT();
  return <h1 className="text-2xl font-semibold">{t("edit_problem_title")}</h1>;
}
