"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";
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

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("login_title")}</CardTitle>
            <CardDescription>{t("login_description")}</CardDescription>
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
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("password_label")}</Label>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-muted-foreground underline"
                  >
                    {t("forgot_link")}
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {state?.error ? (
                <p className="text-sm text-destructive">{state.error}</p>
              ) : null}
              <Button type="submit" className="mt-2 w-full" disabled={pending}>
                {pending ? t("login_pending") : t("login_button")}
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
              {t("no_account")}{" "}
              <Link href="/signup" className="underline">
                {t("signup_button")}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
