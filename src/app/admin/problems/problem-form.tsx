"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type TopicOption = {
  id: string;
  name_kz: string;
  grade: number;
};

export type ProblemFormValues = {
  topic_id: string;
  number: string;
  title_kz: string;
  title_ru: string;
  difficulty: "easy" | "med" | "hard";
  tags_kz: string;
  tags_ru: string;
  display_order: number;
  is_ready: boolean;
  problem_html_path: string | null;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  topics: TopicOption[];
  initial?: ProblemFormValues;
  submitLabel: string;
};

export function ProblemForm({ action, topics, initial, submitLabel }: Props) {
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
          setError("Белгісіз қате.");
        }
      }
    });
  }

  return (
    <form action={handleSubmit} className="max-w-2xl space-y-5">
      <div className="space-y-2">
        <Label htmlFor="topic_id">Тақырып</Label>
        <select
          id="topic_id"
          name="topic_id"
          defaultValue={initial?.topic_id ?? ""}
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="" disabled>
            Таңдаңыз
          </option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.grade}-сынып — {t.name_kz}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="number">Нөмір</Label>
        <Input
          id="number"
          name="number"
          defaultValue={initial?.number ?? ""}
          required
          placeholder="001"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="title_kz">Тақырыбы (қаз)</Label>
        <Input
          id="title_kz"
          name="title_kz"
          defaultValue={initial?.title_kz ?? ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="title_ru">Тақырыбы (орыс)</Label>
        <Input
          id="title_ru"
          name="title_ru"
          defaultValue={initial?.title_ru ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label>Қиындық</Label>
        <div className="flex gap-4">
          {(["easy", "med", "hard"] as const).map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="difficulty"
                value={d}
                defaultChecked={(initial?.difficulty ?? "easy") === d}
                required
              />
              {d === "easy" ? "Жеңіл" : d === "med" ? "Орташа" : "Қиын"}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags_kz">Тегтер (қаз) — үтірмен бөліңіз</Label>
        <Input
          id="tags_kz"
          name="tags_kz"
          defaultValue={initial?.tags_kz ?? ""}
          placeholder="векторлар, координаталар"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags_ru">Тегтер (орыс) — үтірмен бөліңіз</Label>
        <Input
          id="tags_ru"
          name="tags_ru"
          defaultValue={initial?.tags_ru ?? ""}
          placeholder="векторы, координаты"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="display_order">Реттік нөмір</Label>
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
        <Label htmlFor="is_ready">Дайын</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="problem_file">Есеп HTML файлы (қажет болса)</Label>
        <Input
          id="problem_file"
          name="problem_file"
          type="file"
          accept=".html,text/html"
        />
        {initial?.problem_html_path && (
          <p className="text-xs text-muted-foreground">
            Қазіргі файл: {initial.problem_html_path}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Сақталуда..." : submitLabel}
      </Button>
    </form>
  );
}
