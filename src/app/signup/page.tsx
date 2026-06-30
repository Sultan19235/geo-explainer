"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
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
  passwordChecks,
  passwordScore,
  type PasswordRule,
} from "@/lib/auth/password-strength";

const METER_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-emerald-500",
] as const;

const RULES: { key: PasswordRule; label: StringKey }[] = [
  { key: "length", label: "password_rule_length" },
  { key: "case", label: "password_rule_case" },
  { key: "number", label: "password_rule_number" },
  { key: "symbol", label: "password_rule_symbol" },
];

type StringKey =
  | "password_rule_length"
  | "password_rule_case"
  | "password_rule_number"
  | "password_rule_symbol";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  const { t } = useT();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const emailError =
    emailTouched && email.length > 0 && !isValidEmail(email)
      ? t("email_invalid")
      : null;

  const score = passwordScore(password);
  const checks = passwordChecks(password);
  const showStrength = password.length > 0;
  const confirmError =
    confirm.length > 0 && confirm !== password ? t("password_mismatch") : null;

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
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
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="first_name">{t("first_name_label")}</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="last_name">{t("last_name_label")}</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
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
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? t("password_hide") : t("password_show")
                    }
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {showStrength ? (
                  <div className="flex flex-col gap-2">
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
                <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("password_requirements_title")}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {RULES.map(({ key, label }) => {
                      const ok = checks[key];
                      return (
                        <li
                          key={key}
                          className={`flex items-center gap-2 text-xs ${
                            ok ? "text-emerald-600" : "text-muted-foreground"
                          }`}
                        >
                          {ok ? (
                            <Check className="size-3.5 shrink-0" />
                          ) : (
                            <X className="size-3.5 shrink-0 opacity-50" />
                          )}
                          {t(label)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">{t("password_confirm_label")}</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    name="confirm"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={confirmError ? true : undefined}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={
                      showConfirm ? t("password_hide") : t("password_show")
                    }
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
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
