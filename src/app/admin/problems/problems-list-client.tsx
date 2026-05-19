"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/context";

export type AdminProblemRow = {
  id: string;
  number: string;
  title_kz: string;
  title_ru: string | null;
  difficulty: "easy" | "med" | "hard";
  problem_html_path: string | null;
  topic_name_kz: string | null;
  topic_name_ru: string | null;
};

export type TopicFilterOption = {
  id: string;
  name_kz: string;
  name_ru: string | null;
};

export function ProblemsListClient({
  problems,
  topics,
  topicFilter,
  errorMessage,
}: {
  problems: AdminProblemRow[];
  topics: TopicFilterOption[];
  topicFilter: string | null;
  errorMessage: string | null;
}) {
  const { t, lang } = useT();

  if (errorMessage) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">{t("problems_title")}</h1>
        <p className="text-sm text-red-600">
          {t("error_prefix")}: {errorMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("problems_title")}</h1>
        <Link href="/admin/problems/new" className={buttonVariants()}>
          {t("problems_new")}
        </Link>
      </div>

      <form className="mb-6 flex items-center gap-2">
        <label
          htmlFor="topic-filter"
          className="text-sm text-muted-foreground"
        >
          {t("problems_filter_label")}
        </label>
        <select
          id="topic-filter"
          name="topic"
          defaultValue={topicFilter ?? ""}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">{t("problems_filter_all")}</option>
          {topics.map((topicOption) => (
            <option key={topicOption.id} value={topicOption.id}>
              {lang === "ru"
                ? topicOption.name_ru ?? topicOption.name_kz
                : topicOption.name_kz}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          {t("problems_filter_apply")}
        </Button>
      </form>

      {problems.length === 0 ? (
        <p className="text-muted-foreground">{t("problems_none")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("problems_table_topic")}</TableHead>
              <TableHead>{t("problems_table_number")}</TableHead>
              <TableHead>{t("problems_table_title")}</TableHead>
              <TableHead>{t("problems_table_difficulty")}</TableHead>
              <TableHead>{t("problems_table_file")}</TableHead>
              <TableHead className="w-32">{t("topics_table_action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {problems.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {lang === "ru"
                    ? row.topic_name_ru ?? row.topic_name_kz ?? "—"
                    : row.topic_name_kz ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  №{row.number}
                </TableCell>
                <TableCell>
                  {lang === "ru"
                    ? row.title_ru ?? row.title_kz
                    : row.title_kz}
                </TableCell>
                <TableCell>
                  {row.difficulty === "easy"
                    ? t("difficulty_easy")
                    : row.difficulty === "med"
                      ? t("difficulty_med")
                      : t("difficulty_hard")}
                </TableCell>
                <TableCell>
                  {row.problem_html_path ? "✓" : t("in_preparation")}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/problems/${row.id}`}
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
