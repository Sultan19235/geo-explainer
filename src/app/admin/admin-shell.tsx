"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/topics", key: "admin_nav_topics" as const },
  { href: "/admin/problems", key: "admin_nav_problems" as const },
  { href: "/admin/teachers", key: "admin_nav_teachers" as const },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin_section")}
          </div>
          <LanguageToggle />
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded px-2 py-1.5 transition-colors hover:bg-muted",
                  active && "bg-muted font-semibold text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 border-t pt-4 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:underline"
          >
            {t("admin_back_home")}
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
