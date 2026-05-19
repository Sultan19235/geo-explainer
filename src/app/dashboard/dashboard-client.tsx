"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

function LogoutButton() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? t("loading") : t("logout_button")}
    </Button>
  );
}

export function DashboardClient({
  email,
  isAdmin,
  logoutAction,
}: {
  email: string;
  isAdmin: boolean;
  logoutAction: () => Promise<void>;
}) {
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard_greeting")}, {email}
        </h1>
        <div className="flex flex-col items-stretch gap-3 sm:w-72">
          <Link
            href="/grades"
            className={buttonVariants({ variant: "outline" })}
          >
            {t("dashboard_my_lessons")}
          </Link>
          {isAdmin && (
            <Link href="/admin/topics" className={buttonVariants()}>
              {t("dashboard_admin_panel")}
            </Link>
          )}
          <form action={logoutAction}>
            <LogoutButton />
          </form>
        </div>
      </main>
    </div>
  );
}
