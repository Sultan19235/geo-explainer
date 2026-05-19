"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/context";

export type AdminTopicRow = {
  id: string;
  slug: string;
  name_kz: string;
  name_ru: string | null;
  is_published: boolean;
  is_free_sample: boolean;
  display_order: number;
  theory_html_path: string | null;
  grade_id: number;
};

export function TopicsListClient({
  groups,
  errorMessage,
}: {
  groups: Array<{ grade: number; rows: AdminTopicRow[] }>;
  errorMessage: string | null;
}) {
  const { t, lang } = useT();

  if (errorMessage) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">{t("topics_title")}</h1>
        <p className="text-sm text-red-600">
          {t("error_prefix")}: {errorMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("topics_title")}</h1>
        <Link href="/admin/topics/new" className={buttonVariants()}>
          {t("topics_new")}
        </Link>
      </div>

      {groups.length === 0 && (
        <p className="text-muted-foreground">{t("topics_none")}</p>
      )}

      {groups.map((group) => (
        <div key={group.grade} className="mb-8">
          <h2 className="mb-2 text-lg font-medium">
            {t("grade_label")(group.grade)}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("topics_table_slug")}</TableHead>
                <TableHead>{t("topics_table_name")}</TableHead>
                <TableHead>{t("topics_table_published")}</TableHead>
                <TableHead>{t("topics_table_free")}</TableHead>
                <TableHead>{t("topics_table_theory")}</TableHead>
                <TableHead className="w-32">{t("topics_table_action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    {row.slug}
                  </TableCell>
                  <TableCell>
                    {lang === "ru"
                      ? row.name_ru ?? row.name_kz
                      : row.name_kz}
                  </TableCell>
                  <TableCell>{row.is_published ? "✓" : "—"}</TableCell>
                  <TableCell>{row.is_free_sample ? "✓" : "—"}</TableCell>
                  <TableCell>{row.theory_html_path ? "✓" : "—"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/topics/${row.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {t("edit_action")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
