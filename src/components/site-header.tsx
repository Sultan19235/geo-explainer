"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { LanguageToggle } from "./language-toggle";
import { TeacherAvatar } from "./teacher-avatar";
import { buttonVariants } from "./ui/button";

type SiteHeaderProps = {
  showLoginButton?: boolean;
  rightSlot?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function SiteHeader({
  showLoginButton = false,
  rightSlot,
  backHref,
  backLabel,
}: SiteHeaderProps) {
  const { t } = useT();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="text-sm text-muted-foreground hover:underline"
            >
              {backLabel ?? "←"}
            </Link>
          ) : null}
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap font-heading text-base font-bold tracking-tight"
          >
            {t("brand")}
          </Link>
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t("nav_home")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          {rightSlot}
          {!rightSlot &&
            (user ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:border-primary/60 hover:text-primary"
                title={t("nav_profile")}
              >
                <TeacherAvatar gender={user.gender} className="size-7" />
                <span className="hidden sm:inline">{t("nav_profile")}</span>
              </Link>
            ) : (
              showLoginButton && (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      // On the narrowest screens signup wins the slot; login
                      // stays reachable via the signup page's login link.
                      className: "hidden sm:inline-flex",
                    })}
                  >
                    {t("login_button")}
                  </Link>
                  <Link
                    href="/signup"
                    className={buttonVariants({ size: "sm" })}
                  >
                    {t("signup_button")}
                  </Link>
                </div>
              )
            ))}
        </div>
      </div>
    </header>
  );
}
