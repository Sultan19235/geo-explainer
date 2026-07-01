"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";

export type PurchasedGrade = {
  gradeId: number;
  topicCount: number;
};

function LogoutButton() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? t("loading") : t("logout_button")}
    </Button>
  );
}

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function DashboardClient({
  email,
  fullName,
  phone,
  createdAt,
  isAdmin,
  purchasedGrades,
  accessExpiresAt,
  accessActive,
  logoutAction,
}: {
  email: string;
  fullName: string | null;
  phone: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  purchasedGrades: PurchasedGrade[];
  accessExpiresAt: string | null;
  accessActive: boolean;
  logoutAction: () => Promise<void>;
}) {
  const { t, lang } = useT();

  const locale = lang === "ru" ? "ru-RU" : "kk-KZ";
  const formatDate = (value: string | null) => {
    if (!value) return t("profile_not_set");
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return t("profile_not_set");
    // Pin to Kazakhstan time so this server-rendered client component formats
    // the same date on the server (UTC) and the browser — otherwise a date near
    // midnight UTC hydrates to a different day and React flags a mismatch.
    return new Date(ts).toLocaleDateString(locale, {
      timeZone: "Asia/Almaty",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const hasGrades = purchasedGrades.length > 0;

  let accessLine: string | null = null;
  if (hasGrades) {
    if (!accessExpiresAt) {
      accessLine = t("profile_access_unlimited");
    } else if (accessActive) {
      accessLine = t("profile_access_until")(formatDate(accessExpiresAt));
    } else {
      accessLine = t("profile_access_expired")(formatDate(accessExpiresAt));
    }
  }

  const rows: { label: string; value: string }[] = [
    { label: t("profile_name"), value: fullName?.trim() || t("profile_not_set") },
    { label: t("profile_email"), value: email || t("profile_not_set") },
    { label: t("profile_phone"), value: phone?.trim() || t("profile_not_set") },
    { label: t("profile_member_since"), value: formatDate(createdAt) },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader
        rightSlot={
          <form action={logoutAction}>
            <LogoutButton />
          </form>
        }
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {/* Profile header */}
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
            {initials(fullName, email)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {fullName?.trim() || email}
            </h1>
            <p className="mt-1 truncate text-muted-foreground">{email}</p>
            {isAdmin && (
              <Link
                href="/admin/topics"
                className={buttonVariants({ variant: "outline", size: "sm" })
                  + " mt-3 inline-flex"}
              >
                {t("dashboard_admin_panel")}
              </Link>
            )}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Account details */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("profile_account")}
            </h2>
            <Card className="border-border/80">
              <CardContent className="divide-y divide-border/70 p-0">
                {rows.map((row) => (
                  <div key={row.label} className="px-4 py-3">
                    <dt className="text-xs text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm font-medium">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* Purchased grades */}
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("profile_purchased_grades")}
              </h2>
              {accessLine && (
                <span
                  className={
                    "rounded-full px-2.5 py-0.5 text-xs font-medium " +
                    (accessActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-destructive/10 text-destructive")
                  }
                >
                  {accessActive
                    ? t("profile_status_active")
                    : t("profile_status_expired")}
                </span>
              )}
            </div>

            {accessLine && (
              <p className="mb-4 text-sm text-muted-foreground">{accessLine}</p>
            )}

            {hasGrades ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {purchasedGrades.map(({ gradeId, topicCount }) => (
                  <Link
                    key={gradeId}
                    href={`/grades/${gradeId}`}
                    className="group block focus:outline-none"
                  >
                    <Card className="h-full border-border/80 bg-background transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-blue-500 group-hover:shadow-lg group-hover:shadow-blue-500/10 group-focus-visible:border-blue-500">
                      <CardContent className="flex items-center gap-4 px-4 py-5">
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl font-bold text-blue-600">
                          {gradeId}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold">
                            {t("grade_badge")(gradeId)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {topicCount > 0
                              ? t("grade_topics_count")(topicCount)
                              : t("grade_topics_zero")}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                          {t("profile_open_grade")} →
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="border-dashed border-border">
                <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <p className="font-medium">{t("profile_no_grades")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("profile_no_grades_hint")}
                  </p>
                  <Link
                    href="/grades"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    {t("profile_browse_catalog")}
                  </Link>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
