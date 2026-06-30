"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signup } from "./actions";
import { GoogleButton } from "@/app/auth/google-button";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/context";
import {
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  passwordScore,
} from "@/lib/auth/password-strength";

const METER_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-emerald-500",
] as const;

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  const { t } = useT();

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const emailError =
    emailTouched && email.length > 0 && !isValidEmail(email)
      ? t("email_invalid")
      : null;

  const score = passwordScore(password);
  const showStrength = password.length > 0;
  const confirmError =
    confirm.length > 0 && confirm !== password ? t("password_mismatch") : null;

  const canSubmit =
    isValidEmail(email) &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("signup_title")}</CardTitle>
            <CardDescription>{t("signup_description")}</CardDescription>
          </CardHeader>
          <form action={formAction}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("email_label")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  aria-invalid={emailError ? true : undefined}
                />
                {emailError ? (
                  <p className="text-sm text-destructive">{emailError}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{t("password_label")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {showStrength ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1" aria-hidden>
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < score ? METER_COLORS[score] : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("password_strength_label")}:{" "}
                      <span className="font-medium text-foreground">
                        {t(`password_strength_${score}`)}
                      </span>
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">{t("password_confirm_label")}</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={confirmError ? true : undefined}
                />
                {confirmError ? (
                  <p className="text-sm text-destructive">{confirmError}</p>
                ) : null}
              </div>
              {state?.error ? (
                <p className="text-sm text-destructive">{state.error}</p>
              ) : null}
              <Button
                type="submit"
                className="mt-2 w-full"
                disabled={pending || !canSubmit}
              >
                {pending ? t("signup_pending") : t("signup_button")}
              </Button>
            </CardContent>
          </form>
          <CardFooter className="mt-4 flex flex-col gap-4">
            <div className="flex w-full items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground uppercase">
                {t("or_divider")}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <GoogleButton />
            <p className="text-sm text-muted-foreground">
              {t("have_account")}{" "}
              <Link href="/login" className="underline">
                {t("login_button")}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
