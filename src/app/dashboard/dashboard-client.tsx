"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Copy, Pencil, Shuffle, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { TeacherAvatar } from "@/components/teacher-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Gender } from "@/lib/auth/gender";
import { useT } from "@/lib/i18n/context";
import { createClient } from "@/lib/supabase/client";
import type { SavedQuizSummary } from "@/lib/quiz/saved-quiz";
import {
  deleteSavedQuizAction,
  duplicateSavedQuizAction,
  renameSavedQuizAction,
} from "@/lib/quiz/saved-quiz-actions";
import { SAVED_QUIZ_NAME_MAX } from "@/lib/quiz/saved-quiz";
import type { QuizResultSummary } from "@/lib/quiz/quiz-result";
import { QuizResultsSection } from "./quiz-results-section";

export type PurchasedGrade = {
  gradeId: number;
  topicCount: number;
  // Per-grade period — every grade now carries its own expiry (enrollments).
  active: boolean;
  // Active: null = unlimited. Inactive: when the access ended.
  expiresAt: string | null;
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

export function DashboardClient({
  email,
  gender,
  fullName,
  phone,
  createdAt,
  isAdmin,
  purchasedGrades,
  savedQuizzes,
  quizResults,
  accessActive,
  logoutAction,
}: {
  email: string;
  gender: Gender | null;
  fullName: string | null;
  phone: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  purchasedGrades: PurchasedGrade[];
  savedQuizzes: SavedQuizSummary[];
  quizResults: QuizResultSummary[];
  accessActive: boolean;
  logoutAction: () => Promise<void>;
}) {
  const { t, lang } = useT();

  // Gender is edited right here (chips below), so the avatar tracks local
  // state; the header avatar follows via onAuthStateChange after updateUser.
  const [genderValue, setGenderValue] = useState<Gender | null>(gender);
  const [savingGender, setSavingGender] = useState(false);

  const pickGender = async (next: Gender) => {
    if (savingGender || genderValue === next) return;
    setSavingGender(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { gender: next },
    });
    setSavingGender(false);
    if (error) {
      window.alert(t("my_quizzes_error"));
      return;
    }
    setGenderValue(next);
  };

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

  // Each grade shows its own period on its card; the header badge only says
  // whether anything is active right now.
  const accessLineFor = ({ active, expiresAt }: PurchasedGrade) => {
    if (!active) {
      // No known end moment (degenerate data) → plain "expired", not
      // "expired: <not set>".
      return expiresAt
        ? t("profile_access_expired")(formatDate(expiresAt))
        : t("profile_status_expired");
    }
    if (!expiresAt) return t("profile_access_unlimited");
    return t("profile_access_until")(formatDate(expiresAt));
  };

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
          <TeacherAvatar gender={genderValue} className="size-20" />
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
                <div className="px-4 py-3">
                  <dt className="text-xs text-muted-foreground">
                    {t("profile_gender")}
                  </dt>
                  <dd className="mt-1.5 flex gap-2">
                    {(["male", "female"] as const).map((option) => {
                      const active = genderValue === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={savingGender}
                          onClick={() => pickGender(option)}
                          className={
                            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 " +
                            (active
                              ? "border-primary bg-accent text-accent-foreground"
                              : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground")
                          }
                        >
                          {t(option === "male" ? "gender_male" : "gender_female")}
                        </button>
                      );
                    })}
                  </dd>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Purchased grades */}
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("profile_purchased_grades")}
              </h2>
              {hasGrades && (
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

            {hasGrades ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {purchasedGrades.map((grade) => (
                  <Link
                    key={grade.gradeId}
                    href={`/grades/${grade.gradeId}`}
                    className="group block focus:outline-none"
                  >
                    <Card
                      className={
                        "h-full transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-primary/10 group-hover:ring-primary/40 group-focus-visible:ring-primary" +
                        (grade.active ? "" : " opacity-70")
                      }
                    >
                      <CardContent className="flex items-center gap-4">
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent text-2xl font-bold text-primary">
                          {grade.gradeId}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold">
                            {t("grade_badge")(grade.gradeId)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {grade.topicCount > 0
                              ? t("grade_topics_count")(grade.topicCount)
                              : t("grade_topics_zero")}
                          </p>
                          <p
                            className={
                              "mt-0.5 text-xs " +
                              (grade.active
                                ? "text-muted-foreground"
                                : "font-medium text-destructive")
                            }
                          >
                            {accessLineFor(grade)}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
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

        {/* Saved quizzes */}
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("profile_my_quizzes")}
          </h2>
          {savedQuizzes.length === 0 ? (
            <Card className="border-dashed border-border">
              <CardContent className="px-6 py-8 text-center">
                <p className="font-medium">{t("my_quizzes_empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("my_quizzes_empty_hint")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/80">
              <CardContent className="divide-y divide-border/70 p-0">
                {savedQuizzes.map((quiz) => (
                  <SavedQuizRow
                    key={quiz.id}
                    quiz={quiz}
                    dateLabel={formatDate(quiz.updatedAt)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Quiz results history */}
        <QuizResultsSection results={quizResults} />
      </main>
    </div>
  );
}

function SavedQuizRow({
  quiz,
  dateLabel,
}: {
  quiz: SavedQuizSummary;
  dateLabel: string;
}) {
  const { t, lang } = useT();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(quiz.name);
  // Escape must beat the input's blur handler, which otherwise submits the
  // rename the user just cancelled.
  const cancelRenameRef = useRef(false);

  const quizTitle =
    lang === "ru" ? quiz.quizTitleRu ?? quiz.quizTitleKz : quiz.quizTitleKz;

  // revalidatePath("/dashboard") inside each action refreshes the list, so
  // rows never track local copies of server state beyond the rename input.
  const run = (fn: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) window.alert(t("my_quizzes_error"));
    });

  const submitRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === quiz.name) {
      setName(quiz.name);
      setRenaming(false);
      return;
    }
    setRenaming(false);
    run(() => renameSavedQuizAction({ id: quiz.id, name: trimmed }));
  };

  const duplicate = () =>
    run(() =>
      duplicateSavedQuizAction({
        id: quiz.id,
        name: `${quiz.name} — ${t("my_quizzes_copy_suffix")}`.slice(
          0,
          SAVED_QUIZ_NAME_MAX,
        ),
      }),
    );

  const remove = () => {
    if (!window.confirm(t("my_quizzes_delete_confirm")(quiz.name))) return;
    run(() => deleteSavedQuizAction({ id: quiz.id }));
  };

  return (
    <div
      className={
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5" +
        (pending ? " opacity-50" : "")
      }
    >
      <div className="min-w-0 flex-1 basis-56">
        {renaming ? (
          <Input
            autoFocus
            value={name}
            maxLength={SAVED_QUIZ_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                cancelRenameRef.current = true;
                e.currentTarget.blur();
              }
            }}
            onBlur={() => {
              if (cancelRenameRef.current) {
                cancelRenameRef.current = false;
                setName(quiz.name);
                setRenaming(false);
                return;
              }
              submitRename();
            }}
            className="h-8 max-w-sm text-sm font-semibold"
          />
        ) : (
          <p className="truncate text-sm font-semibold">{quiz.name}</p>
        )}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{quizTitle}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">
            {t("my_quizzes_questions")(quiz.questionCount)}
          </span>
          {quiz.orderMode === "shuffle" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-1.5 py-px text-[10px] font-semibold">
              <Shuffle className="size-2.5" aria-hidden />
              {t("my_quizzes_shuffle_badge")}
            </span>
          )}
          <span aria-hidden>·</span>
          <span className="shrink-0">{dateLabel}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/play/${quiz.quizId}/host?saved=${quiz.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("my_quizzes_open")}
        </Link>
        <RowIconButton
          label={t("my_quizzes_rename")}
          disabled={pending}
          onClick={() => setRenaming(true)}
        >
          <Pencil className="size-3.5" aria-hidden />
        </RowIconButton>
        <RowIconButton
          label={t("my_quizzes_duplicate")}
          disabled={pending}
          onClick={duplicate}
        >
          <Copy className="size-3.5" aria-hidden />
        </RowIconButton>
        <RowIconButton
          label={t("my_quizzes_delete")}
          disabled={pending}
          destructive
          onClick={remove}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </RowIconButton>
      </div>
    </div>
  );
}

function RowIconButton({
  label,
  disabled,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "grid size-8 place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background disabled:opacity-40 " +
        (destructive ? "hover:text-destructive" : "hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}
