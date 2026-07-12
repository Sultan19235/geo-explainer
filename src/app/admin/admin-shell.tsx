"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpenIcon,
  ClipboardListIcon,
  HomeIcon,
  LayersIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SquareFunctionIcon,
  UsersIcon,
} from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/topics", key: "admin_nav_topics" as const, Icon: LayersIcon },
  {
    href: "/admin/problems",
    key: "admin_nav_problems" as const,
    Icon: SquareFunctionIcon,
  },
  {
    href: "/admin/quizzes",
    key: "admin_nav_quizzes" as const,
    Icon: ClipboardListIcon,
  },
  {
    href: "/admin/lessons",
    key: "admin_nav_lessons" as const,
    Icon: BookOpenIcon,
  },
  {
    href: "/admin/teachers",
    key: "admin_nav_teachers" as const,
    Icon: UsersIcon,
  },
];

// Persisted across visits; read after mount so SSR and hydration agree on the
// expanded default.
const COLLAPSE_KEY = "admin_sidebar_collapsed";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // storage unavailable — stay expanded
    }
  }, []);

  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r bg-muted/30 transition-[width] duration-200",
          collapsed ? "w-14 items-center p-2" : "w-56 p-4",
        )}
      >
        <div
          className={cn(
            "mb-4 flex items-center gap-2",
            collapsed ? "flex-col" : "justify-between",
          )}
        >
          {!collapsed && (
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("admin_section")}
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={
              collapsed ? t("admin_nav_expand") : t("admin_nav_collapse")
            }
            title={collapsed ? t("admin_nav_expand") : t("admin_nav_collapse")}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpenIcon className="h-4 w-4" />
            ) : (
              <PanelLeftCloseIcon className="h-4 w-4" />
            )}
          </button>
          {!collapsed && <LanguageToggle />}
        </div>
        <nav
          className={cn(
            "flex flex-col gap-1 text-sm",
            collapsed && "items-center",
          )}
        >
          {NAV_ITEMS.map(({ href, key, Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? t(key) : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-muted",
                  active && "bg-muted font-semibold text-foreground",
                  collapsed && "justify-center px-1.5",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    !active && "text-muted-foreground",
                  )}
                />
                {!collapsed && t(key)}
              </Link>
            );
          })}
        </nav>
        <div
          className={cn(
            "mt-6 border-t pt-4 text-sm",
            collapsed && "flex w-full justify-center",
          )}
        >
          <Link
            href="/dashboard"
            title={collapsed ? t("admin_back_home") : undefined}
            className={cn(
              "text-muted-foreground hover:underline",
              collapsed && "rounded p-1.5 hover:bg-muted",
            )}
          >
            {collapsed ? <HomeIcon className="h-4 w-4" /> : t("admin_back_home")}
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
