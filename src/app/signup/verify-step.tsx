"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { resendOtp, verifyOtp } from "./actions";
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

const RESEND_COOLDOWN = 30;

export function VerifyStep({
  email,
  fullName,
  onBack,
}: {
  email: string;
  fullName: string;
  onBack: () => void;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState(verifyOtp, undefined);
  const [resendState, resendAction, resending] = useActionState(
    resendOtp,
    undefined,
  );
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const resendRef = useRef<HTMLFormElement>(null);

  // Count down the resend cooldown; restarts whenever a new code is sent.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (resendState?.sent) setCooldown(RESEND_COOLDOWN);
  }, [resendState?.sent]);

  return (
    <>
      <CardHeader>
        <CardTitle>{t("verify_title")}</CardTitle>
        <CardDescription>
          {t("verify_description").replace("{email}", email)}
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="full_name" value={fullName} />
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
          {state?.error ? (
            <p className="text-sm text-destructive">{t("verify_invalid")}</p>
          ) : null}
          {resendState?.sent ? (
            <p className="text-sm text-emerald-600">{t("verify_resent")}</p>
          ) : null}
          <Button
            type="submit"
            className="mt-2 w-full"
            disabled={pending || code.length !== 6}
          >
            {pending ? t("verify_pending") : t("verify_button")}
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
