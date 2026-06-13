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

export type AdminQuizRow = {
  id: string;
  title_kz: string;
  title_ru: string | null;
  teacher_html_path: string | null;
  student_html_path: string | null;
  topic_name_kz: string | null;
  topic_name_ru: string | null;
};

export function QuizzesListClient({
  quizzes,
  errorMessage,
}: {
  quizzes: AdminQuizRow[];
  errorMessage: string | null;
}) {
  const { t, lang } = useT();

  if (errorMessage) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">{t("quizzes_title")}</h1>
        <p className="text-sm text-red-600">
          {t("error_prefix")}: {errorMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("quizzes_title")}</h1>
        <Link href="/admin/quizzes/new" className={buttonVariants()}>
          {t("quizzes_new")}
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <p className="text-muted-foreground">{t("quizzes_none")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("problems_table_topic")}</TableHead>
              <TableHead>{t("quizzes_table_title")}</TableHead>
              <TableHead>{t("quizzes_table_teacher_file")}</TableHead>
              <TableHead>{t("quizzes_table_student_file")}</TableHead>
              <TableHead className="w-32">{t("topics_table_action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quizzes.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {lang === "ru"
                    ? row.topic_name_ru ?? row.topic_name_kz ?? "—"
                    : row.topic_name_kz ?? "—"}
                </TableCell>
                <TableCell>
                  {lang === "ru" ? row.title_ru ?? row.title_kz : row.title_kz}
                </TableCell>
                <TableCell>
                  {row.teacher_html_path ? "✓" : t("in_preparation")}
                </TableCell>
                <TableCell>
                  {row.student_html_path ? "✓" : "—"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/quizzes/${row.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {t("edit_action")}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
