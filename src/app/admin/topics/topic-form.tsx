"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/context";

export type GradeOption = { id: number };

export type TopicFormValues = {
  grade_id: number | null;
  slug: string;
  name_kz: string;
  name_ru: string;
  description_kz: string;
  description_ru: string;
  is_published: boolean;
  is_free_sample: boolean;
  display_order: number;
  theory_html_path: string | null;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  grades: GradeOption[];
  initial?: TopicFormValues;
  submitLabelKey: "submit_create" | "submit_save";
};

export function TopicForm({ action, grades, initial, submitLabelKey }: Props) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
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
        <Label htmlFor="grade_id">{t("field_grade")}</Label>
        <select
          id="grade_id"
          name="grade_id"
          defaultValue={initial?.grade_id ?? ""}
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="" disabled>
            {t("field_grade_choose")}
          </option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {t("grade_label")(g.id)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">{t("field_slug")}</Label>
        <Input
          id="slug"
          name="slug"
          defaultValue={initial?.slug ?? ""}
          required
          placeholder="vectors-intro"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name_kz">{t("field_name_kz")}</Label>
        <Input
          id="name_kz"
          name="name_kz"
          defaultValue={initial?.name_kz ?? ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name_ru">{t("field_name_ru")}</Label>
        <Input
          id="name_ru"
          name="name_ru"
          defaultValue={initial?.name_ru ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description_kz">{t("field_description_kz")}</Label>
        <Textarea
          id="description_kz"
          name="description_kz"
          defaultValue={initial?.description_kz ?? ""}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description_ru">{t("field_description_ru")}</Label>
        <Textarea
          id="description_ru"
          name="description_ru"
          defaultValue={initial?.description_ru ?? ""}
          rows={3}
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
          id="is_published"
          name="is_published"
          defaultChecked={initial?.is_published ?? false}
        />
        <Label htmlFor="is_published">{t("field_is_published")}</Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="is_free_sample"
          name="is_free_sample"
          defaultChecked={initial?.is_free_sample ?? false}
        />
        <Label htmlFor="is_free_sample">{t("field_is_free_sample")}</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="theory_file">{t("field_theory_file")}</Label>
        <Input
          id="theory_file"
          name="theory_file"
          type="file"
          accept=".html,text/html"
        />
        {initial?.theory_html_path && (
          <p className="text-xs text-muted-foreground">
            {t("current_file")}: {initial.theory_html_path}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? t("submit_saving") : t(submitLabelKey)}
      </Button>
    </form>
  );
}
