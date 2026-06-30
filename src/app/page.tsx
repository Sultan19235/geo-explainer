"use client";

import Link from "next/link";
import { BookOpenIcon, CheckSquareIcon, PresentationIcon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth/context";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";

const GRADES = [7, 8, 9, 10, 11] as const;

export default function HomePage() {
  const { t } = useT();
  const { user } = useAuth();

  const steps = [
    {
      icon: BookOpenIcon,
      title: t("how_step_1_title"),
      text: t("how_step_1_text"),
    },
    {
      icon: CheckSquareIcon,
      title: t("how_step_2_title"),
      text: t("how_step_2_text"),
    },
    {
      icon: PresentationIcon,
      title: t("how_step_3_title"),
      text: t("how_step_3_text"),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader showLoginButton />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/60">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-16 text-center sm:py-24">
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {t("hero_title")}
            </h1>
            <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg sm:leading-8">
              {t("hero_subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/grades"
                className={buttonVariants({ size: "lg" })}
              >
                {t("hero_cta_primary")}
              </Link>
              <Link
                href={user ? "/dashboard" : "/signup"}
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                {user ? t("nav_profile") : t("hero_cta_secondary")}
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-border/60 bg-muted/30">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("how_it_works_title")}
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Card key={step.title} className="h-full">
                    <CardHeader>
                      <div className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Icon className="size-5" />
                      </div>
                      <div className="text-xs font-semibold tracking-wide text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <CardTitle className="text-lg">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-6 text-muted-foreground">
                      {step.text}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Available grades */}
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("grades_section_title")}
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {GRADES.map((grade) => (
                <Link
                  key={grade}
                  href={`/grades/${grade}`}
                  className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:border-blue-500 hover:bg-blue-50/60 hover:text-blue-700"
                >
                  {t("grade_badge")(grade)}
                </Link>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Link href="/grades">
                <Button size="lg">{t("hero_cta_primary")}</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>{t("footer_copyright")}</span>
          <span>{t("footer_contact")}</span>
        </div>
      </footer>
    </div>
  );
}
