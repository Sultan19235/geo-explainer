"use client";

import Link from "next/link";
import Image from "next/image";
import {
  BookOpenIcon,
  CheckIcon,
  CheckSquareIcon,
  PresentationIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { JoinCodeForm } from "@/components/quiz/join-code-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useT } from "@/lib/i18n/context";

export default function HomePage() {
  const { t } = useT();

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
              <div className="mt-8">
                <Link
                  href="/grades"
                  className={buttonVariants({ size: "lg" })}
                >
                  {t("hero_cta_primary")}
                </Link>
              </div>
              {/* Universal quiz entrance: students land on matem.school and
                  type the room code from the board — so the box sits right
                  under the pitch, first thing on a phone. */}
              <div className="mt-10 w-full max-w-sm rounded-xl border border-border bg-card/85 p-4 shadow-sm backdrop-blur">
                <p className="mb-2.5 text-sm font-medium text-muted-foreground">
                  {t("home_join_hint")}
                </p>
                <JoinCodeForm />
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

        {/* Inside the platform: real screens. The classroom has two sides —
            the teacher's board (blue pen: theory/writing) and the student's
            phone (red pen: tests/checking) — so each row shows one of them. */}
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <h2 className="text-center font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {t("showcase_title")}
            </h2>
            <div
              aria-hidden
              className="mx-auto mt-3 h-[3px] w-10 rounded-full bg-pen-blue"
            />

            {/* Teacher's screen: theory + problems workspace */}
            <div className="mt-14 grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
              <div>
                <h3 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
                  {t("showcase_learn_title")}
                </h3>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {(["showcase_learn_p1", "showcase_learn_p2", "showcase_learn_p3", "showcase_learn_p4"] as const).map(
                    (key) => (
                      <li key={key} className="flex gap-3">
                        <CheckIcon
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-pen-blue"
                        />
                        <span>{t(key)}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
              <div className="relative">
                <span className="absolute -top-3.5 left-5 z-10 inline-block -rotate-1 rounded-md border border-pen-blue/25 bg-pen-blue-soft px-2.5 py-1 text-xs font-semibold text-pen-blue shadow-sm">
                  {t("showcase_learn_tag")}
                </span>
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-primary/5">
                  <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3.5 py-2.5">
                    <span className="size-2.5 rounded-full bg-pen-red/40" />
                    <span className="size-2.5 rounded-full bg-sun-bright/50" />
                    <span className="size-2.5 rounded-full bg-pen-green/40" />
                    <span className="ml-3 truncate rounded-md bg-background px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      matem.school/grades/11/cylinder
                    </span>
                  </div>
                  <Image
                    src="/showcase/workspace.png"
                    alt={t("showcase_learn_title")}
                    width={1280}
                    height={800}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>

            {/* Student's phone: the live quiz */}
            <div className="mt-16 grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
              <div className="grid-paper order-2 rounded-2xl border border-border/60 px-6 py-8 sm:px-10 lg:order-1">
                <div className="relative mx-auto w-[230px] sm:w-[250px]">
                  <span className="absolute -top-3.5 -right-4 z-10 inline-block rotate-1 rounded-md border border-pen-red/25 bg-pen-red-soft px-2.5 py-1 text-xs font-semibold text-pen-red shadow-sm">
                    {t("showcase_quiz_tag")}
                  </span>
                  <div className="overflow-hidden rounded-[2rem] border-[6px] border-foreground/85 bg-foreground/85 shadow-xl">
                    <Image
                      src="/showcase/quiz.png"
                      alt={t("showcase_quiz_title")}
                      width={1170}
                      height={2532}
                      className="h-auto w-full rounded-[1.6rem]"
                    />
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <h3 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
                  {t("showcase_quiz_title")}
                </h3>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {(["showcase_quiz_p1", "showcase_quiz_p2", "showcase_quiz_p3", "showcase_quiz_p4"] as const).map(
                    (key) => (
                      <li key={key} className="flex gap-3">
                        <CheckIcon
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-pen-red"
                        />
                        <span>{t(key)}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>

            <div className="mt-16 flex justify-center">
              <Link href="/grades" className={buttonVariants({ size: "lg" })}>
                {t("hero_cta_primary")}
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
