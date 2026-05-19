"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { LanguageToggle } from "./language-toggle";
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
          {showLoginButton && (
            <Link
              href="/login"
              className={buttonVariants({ size: "sm" })}
            >
              {t("login_button")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
