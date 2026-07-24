"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/context";
import { DRILL_TOPICS } from "@/lib/drill/registry";

export type TopicOption = {
  id: string;
  name_kz: string;
  name_ru: string | null;
  grade: number;
};

export type QuizFormValues = {
  topic_id: string;
  title_kz: string;
  title_ru: string;
  display_order: number;
  is_ready: boolean;
  teacher_html_path: string | null;
  student_html_path: string | null;
  pack_path: string | null;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  topics: TopicOption[];
  initial?: QuizFormValues;
  submitLabelKey: "submit_create" | "submit_save";
};

export function QuizForm({ action, topics, initial, submitLabelKey }: Props) {
  const { t, lang } = useT();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        // Uploaded drill-generator .js: run the full validation harness in
        // the sandbox worker BEFORE anything leaves the browser. On success
        // the extracted meta (topic id + option snapshot) rides along for
        // the server to embed in the pack — the server never runs the file.
        const generatorFile = formData.get("generator_file");
        if (generatorFile instanceof File && generatorFile.size > 0) {
          const { UploadedDrillSource } = await import(
            "@/lib/drill/uploaded/source"
          );
          const code = await generatorFile.text();
          const result = await UploadedDrillSource.load(code, { validate: true });
          if (!result.ok) {
            setError(`Generator file:\n${result.errors.join("\n")}`);
            return;
          }
          result.source.dispose();
          formData.set(
            "generator_meta",
            JSON.stringify({
              topic: result.meta.id,
              options: result.meta.options,
              ...(result.meta.levels !== undefined
                ? { levels: result.meta.levels }
                : {}),
            }),
          );
        }
        await action(formData);
      } catch (e) {
        if (e instanceof Error) {
          if (e.message === "NEXT_REDIRECT") throw e;
          setError(e.message);
        } else {
          setError(t("unknown_error"));
        }
      }
    });
  }

  return (
    <form action={handleSubmit} className="max-w-2xl space-y-5">
      <div className="space-y-2">
        <Label htmlFor="topic_id">{t("field_topic")}</Label>
        <select
          id="topic_id"
          name="topic_id"
          defaultValue={initial?.topic_id ?? ""}
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="" disabled>
            {t("field_grade_choose")}
          </option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {t("grade_label")(topic.grade)} —{" "}
              {lang === "ru" ? topic.name_ru ?? topic.name_kz : topic.name_kz}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title_kz">{t("field_title_kz")}</Label>
        <Input
          id="title_kz"
          name="title_kz"
          defaultValue={initial?.title_kz ?? ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="title_ru">{t("field_title_ru")}</Label>
        <Input
          id="title_ru"
          name="title_ru"
          defaultValue={initial?.title_ru ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="display_order">{t("field_display_order")}</Label>
        <Input
          id="display_order"
          name="display_order"
          type="number"
          defaultValue={initial?.display_order ?? 0}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="is_ready"
          name="is_ready"
          defaultChecked={initial?.is_ready ?? false}
        />
        <Label htmlFor="is_ready">{t("field_is_ready")}</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="teacher_file">{t("field_quiz_teacher_file")}</Label>
        <Input
          id="teacher_file"
          name="teacher_file"
          type="file"
          accept=".html,text/html"
        />
        {initial?.teacher_html_path && (
          <p className="text-xs text-muted-foreground">
            {t("current_file")}: {initial.teacher_html_path}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="student_file">{t("field_quiz_student_file")}</Label>
        <Input
          id="student_file"
          name="student_file"
          type="file"
          accept=".html,text/html"
        />
        {initial?.student_html_path && (
          <p className="text-xs text-muted-foreground">
            {t("current_file")}: {initial.student_html_path}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pack_file">{t("field_quiz_pack_file")}</Label>
        <Input
          id="pack_file"
          name="pack_file"
          type="file"
          accept=".json,application/json"
        />
        <p className="text-xs text-muted-foreground">
          {t("field_quiz_pack_hint")}
        </p>
        <p className="text-xs text-muted-foreground">
          <Link
            href="/admin/quizzes/graph-builder"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            График тестін құрастыру →
          </Link>
        </p>
        {initial?.pack_path && (
          <p className="text-xs text-muted-foreground">
            {t("current_file")}: {initial.pack_path}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="generator">
          {lang === "ru" ? "Интерактивный генератор" : "Интерактив генератор"}
        </Label>
        <select
          id="generator"
          name="generator"
          defaultValue=""
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">—</option>
          <option value="graph-quadratic">
            {lang === "ru"
              ? "График квадратичной функции"
              : "Квадраттық функция графигі"}
          </option>
          {DRILL_TOPICS.map((topic) => (
            <option key={topic.id} value={`drill:${topic.id}`}>
              {lang === "ru"
                ? `Тренажёр: ${topic.title.ru}`
                : `Жаттығу: ${topic.title.kz}`}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {lang === "ru"
            ? "Файл не нужен: вопросы создаются автоматически, разделы и типы выбирает учитель при открытии комнаты. Загруженный pack.json имеет приоритет."
            : "Файл қажет емес: сұрақтар автоматты құрылады, бөлімдер мен түрлерді мұғалім бөлме ашқанда таңдайды. Жүктелген pack.json басым."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="generator_file">
          {lang === "ru"
            ? "Свой генератор (.js файл)"
            : "Өз генератор (.js файл)"}
        </Label>
        <Input
          id="generator_file"
          name="generator_file"
          type="file"
          accept=".js,text/javascript"
        />
        <p className="text-xs text-muted-foreground">
          {lang === "ru"
            ? "Загружаемый генератор задач (docs/DRILL_GENERATOR_FORMAT.md). Перед сохранением проверяется автоматически; сначала обкатайте файл на /labs/drill/file. Имеет приоритет над списком выше."
            : "Жүктелетін есеп генераторы (docs/DRILL_GENERATOR_FORMAT.md). Сақтау алдында автоматты тексеріледі; алдымен файлды /labs/drill/file бетінде байқап көріңіз. Жоғарыдағы тізімнен басым."}
        </p>
      </div>

      {error && (
        <p className="whitespace-pre-wrap text-sm text-red-600">{error}</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? t("submit_saving") : t(submitLabelKey)}
      </Button>
    </form>
  );
}
