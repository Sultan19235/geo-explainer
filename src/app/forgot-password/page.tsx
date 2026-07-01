"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { requestPasswordReset } from "./actions";
import { ResetStep } from "./reset-step";
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
import { isValidEmail } from "@/lib/auth/password-strength";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    undefined,
  );
  const { t } = useT();

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok && state.email) setSentTo(state.email);
  }, [state]);

  const emailError =
    emailTouched && email.length > 0 && !isValidEmail(email)
      ? t("email_invalid")
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <Card className="w-full max-w-sm">
          {sentTo ? (
            <ResetStep email={sentTo} onBack={() => setSentTo(null)} />
          ) : (
            <>
              <CardHeader>
                <CardTitle>{t("forgot_title")}</CardTitle>
                <CardDescription>{t("forgot_description")}</CardDescription>
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
                  {state?.error ? (
                    <p className="text-sm text-destructive">{state.error}</p>
                  ) : null}
                  <Button
                    type="submit"
                    className="mt-2 w-full"
                    disabled={pending || !isValidEmail(email)}
                  >
                    {pending ? t("forgot_pending") : t("forgot_button")}
                  </Button>
                </CardContent>
              </form>
              <CardFooter className="mt-4">
                <p className="text-sm text-muted-foreground">
                  {t("have_account")}{" "}
                  <Link href="/login" className="underline">
                    {t("login_button")}
                  </Link>
                </p>
              </CardFooter>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
