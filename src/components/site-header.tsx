"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { LanguageToggle } from "./language-toggle";
import { buttonVariants } from "./ui/button";

function profileInitials(name: string | null, email: string | null) {
  const source = name?.trim() || email || "";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

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
            className="truncate text-base font-bold tracking-tight"
          >
            {t("brand")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          {rightSlot}
          {!rightSlot &&
            (user ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:border-blue-500 hover:text-blue-700"
                title={t("nav_profile")}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {profileInitials(user.fullName, user.email)}
                </span>
                <span className="hidden sm:inline">{t("nav_profile")}</span>
              </Link>
            ) : (
              showLoginButton && (
                <Link
                  href="/login"
                  className={buttonVariants({ size: "sm" })}
                >
                  {t("login_button")}
                </Link>
              )
            ))}
        </div>
      </div>
    </header>
  );
}
