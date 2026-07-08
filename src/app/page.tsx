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
import { GRADES } from "@/lib/grades";

export default function HomePage() {
  const { t } = useT();
  const { user } = useAuth();

  // Each step carries one of the teacher's pens: blue = theory/writing,
  // green = picking problems, red = conducting/checking.
  const steps = [
    {
      icon: BookOpenIcon,
      title: t("how_step_1_title"),
      text: t("how_step_1_text"),
      chip: "bg-pen-blue-soft text-pen-blue",
      num: "text-pen-blue",
    },
    {
      icon: CheckSquareIcon,
      title: t("how_step_2_title"),
      text: t("how_step_2_text"),
      chip: "bg-pen-green-soft text-pen-green",
      num: "text-pen-green",
    },
    {
      icon: PresentationIcon,
      title: t("how_step_3_title"),
      text: t("how_step_3_text"),
      chip: "bg-pen-red-soft text-pen-red",
      num: "text-pen-red",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader showLoginButton />

      <main className="flex-1">
        {/* Hero: an open exercise-book page. Left — the pitch in textbook
            serif; right — three pen strokes plot themselves like a teacher
            sketching at the board. */}
        <section className="grid-paper relative overflow-hidden border-b border-border/60">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            <div className="flex flex-col items-start text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pen-blue">
                {t("hero_eyebrow")}
              </p>
              <h1 className="mt-4 max-w-2xl text-balance font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                {t("hero_title")}
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg sm:leading-8">
                {t("hero_subtitle")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
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
            <div className="relative mx-auto w-full max-w-[520px]">
              <svg
                aria-hidden="true"
                viewBox="0 0 520 430"
                fill="none"
                className="h-auto w-full"
              >
                <path
                  className="hero-stroke"
                  style={{ animationDelay: "0.2s" }}
                  d="M40 40Q260 640 480 40"
                  pathLength={1}
                  stroke="var(--pen-red)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  className="hero-stroke"
                  style={{ animationDelay: "0.7s" }}
                  d="M30 305L490 92"
                  pathLength={1}
                  stroke="var(--pen-blue)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle
                  className="hero-stroke"
                  style={{ animationDelay: "1.15s" }}
                  cx="382"
                  cy="298"
                  r="72"
                  pathLength={1}
                  stroke="var(--pen-green)"
                  strokeWidth="3"
                />
                <circle
                  className="hero-fade"
                  style={{ animationDelay: "1.7s" }}
                  cx="260"
                  cy="340"
                  r="5"
                  fill="var(--sun-bright)"
                />
                <text
                  className="font-math hero-fade"
                  style={{ animationDelay: "1.7s" }}
                  x="206"
                  y="388"
                  fill="var(--pen-red)"
                  fontSize="21"
                >
                  y = x²
                </text>
                <text
                  className="font-math hero-fade"
                  style={{ animationDelay: "1.85s" }}
                  x="336"
                  y="72"
                  fill="var(--pen-blue)"
                  fontSize="21"
                >
                  y = kx + b
                </text>
                <text
                  className="font-math hero-fade"
                  style={{ animationDelay: "2s" }}
                  x="316"
                  y="406"
                  fill="var(--pen-green)"
                  fontSize="21"
                >
                  x² + y² = r²
                </text>
              </svg>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-border/60 bg-muted/30">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <h2 className="text-center font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {t("how_it_works_title")}
            </h2>
            <div
              aria-hidden
              className="mx-auto mt-3 h-[3px] w-10 rounded-full bg-pen-blue"
            />
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Card key={step.title} className="h-full">
                    <CardHeader>
                      <div
                        className={`mb-2 inline-flex size-10 items-center justify-center rounded-lg ${step.chip}`}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div
                        className={`text-xs font-semibold tracking-wide ${step.num}`}
                      >
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
            <h2 className="text-center font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {t("grades_section_title")}
            </h2>
            <div
              aria-hidden
              className="mx-auto mt-3 h-[3px] w-10 rounded-full bg-pen-blue"
            />
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {GRADES.map((grade) => (
                <Link
                  key={grade}
                  href={`/grades/${grade}`}
                  className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:border-primary/60 hover:bg-accent/60 hover:text-accent-foreground"
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
