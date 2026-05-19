"use client";

import { useT } from "@/lib/i18n/context";

export function TeachersStub() {
  const { t } = useT();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">{t("admin_nav_teachers")}</h1>
      <p className="text-muted-foreground">{t("teachers_stub")}</p>
    </div>
  );
}
