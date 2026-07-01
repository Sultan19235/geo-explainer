"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/context";
import { formatLastSeen, SHARING_DEVICE_THRESHOLD } from "@/lib/analytics/format";
import type { UserSummaryRow } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

export function UsersListClient({
  rows,
  errorMessage,
}: {
  rows: UserSummaryRow[];
  errorMessage: string | null;
}) {
  const { t, lang } = useT();

  // null until mounted so SSR and first client render agree; then ticks so
  // "last active" relative labels stay fresh.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (errorMessage) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">{t("ua_title")}</h1>
        <p className="text-sm text-red-600">
          {t("error_prefix")}: {errorMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("ua_title")}</h1>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("ua_none")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ua_col_user")}</TableHead>
              <TableHead>{t("ua_col_last_seen")}</TableHead>
              <TableHead className="text-right">{t("ua_col_sessions")}</TableHead>
              <TableHead>{t("ua_col_grades")}</TableHead>
              <TableHead className="text-right">{t("ua_col_lessons")}</TableHead>
              <TableHead className="text-right">{t("ua_col_quizzes")}</TableHead>
              <TableHead className="text-right">{t("ua_col_devices")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const shared = r.device_count >= SHARING_DEVICE_THRESHOLD;
              const grades = (r.grades ?? []).slice().sort((a, b) => a - b);
              return (
                <TableRow key={r.user_id}>
                  <TableCell>
                    <div className="font-medium">
                      {r.full_name || r.email || r.user_id.slice(0, 8)}
                    </div>
                    {r.full_name && r.email && (
                      <div className="text-xs text-muted-foreground">
                        {r.email}
                      </div>
                    )}
                    {r.is_admin && (
                      <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {t("ua_admin_badge")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatLastSeen(r.last_seen_at, t, lang, now)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.session_count}
                  </TableCell>
                  <TableCell className="text-sm">
                    {grades.length ? grades.join(", ") : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.lesson_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.quiz_count}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      shared && "font-semibold text-amber-600",
                    )}
                  >
                    {shared ? `⚠ ${r.device_count}` : r.device_count}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/teachers/${r.user_id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {t("ua_view")}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
