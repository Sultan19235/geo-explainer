"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { resendResetCode, resetPassword } from "./actions";
import { Button } from "@/components/ui/button";
import {
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
  MIN_PASSWORD_LENGTH,
  passwordChecks,
  passwordScore,
  type PasswordRule,
} from "@/lib/auth/password-strength";

const RESEND_COOLDOWN = 30;

const METER_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-emerald-500",
] as const;

const RULES: { key: PasswordRule; label: PasswordRuleKey }[] = [
  { key: "length", label: "password_rule_length" },
  { key: "case", label: "password_rule_case" },
  { key: "number", label: "password_rule_number" },
  { key: "symbol", label: "password_rule_symbol" },
];

type PasswordRuleKey =
  | "password_rule_length"
  | "password_rule_case"
  | "password_rule_number"
  | "password_rule_symbol";

export function ResetStep({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState(resetPassword, undefined);
  const [resendState, resendAction, resending] = useActionState(
    resendResetCode,
    undefined,
  );
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const resendRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (resendState?.sent) setCooldown(RESEND_COOLDOWN);
  }, [resendState?.sent]);

  const score = passwordScore(password);
  const checks = passwordChecks(password);
  const showStrength = password.length > 0;
  const confirmError =
    confirm.length > 0 && confirm !== password ? t("password_mismatch") : null;

  const canSubmit =
    code.length === 6 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm;

  return (
    <>
      <CardHeader>
        <CardTitle>{t("reset_title")}</CardTitle>
        <CardDescription>
          {t("reset_description").replace("{email}", email)}
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <input type="hidden" name="email" value={email} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="token">{t("verify_code_label")}</Label>
            <Input
              id="token"
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("reset_new_password_label")}</Label>
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
          {resendState?.sent ? (
            <p className="text-sm text-emerald-600">{t("verify_resent")}</p>
          ) : null}
          <Button
            type="submit"
            className="mt-2 w-full"
            disabled={pending || !canSubmit}
          >
            {pending ? t("reset_pending") : t("reset_button")}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="mt-4 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t("verify_resend_prompt")}{" "}
          <form ref={resendRef} action={resendAction} className="inline">
            <input type="hidden" name="email" value={email} />
            {cooldown > 0 ? (
              <span className="text-muted-foreground">
                {t("verify_resend_cooldown").replace(
                  "{seconds}",
                  String(cooldown),
                )}
              </span>
            ) : (
              <button
                type="submit"
                disabled={resending}
                className="underline disabled:opacity-50"
              >
                {t("verify_resend")}
              </button>
            )}
          </form>
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground underline"
        >
          {t("verify_back")}
        </button>
      </CardFooter>
    </>
  );
}
