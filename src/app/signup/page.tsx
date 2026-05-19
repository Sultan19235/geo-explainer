"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "./actions";
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

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  const { t } = useT();

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
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{t("password_label")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">{t("password_confirm_label")}</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              {state?.error ? (
                <p className="text-sm text-destructive">{state.error}</p>
              ) : null}
            </CardContent>
            <CardFooter className="mt-4 flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t("signup_pending") : t("signup_button")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("have_account")}{" "}
                <Link href="/login" className="underline">
                  {t("login_button")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}
