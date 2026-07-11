"use client";

// Admin · Lessons: topics of the new lesson player (bulk-uploaded .js
// content files). Create a topic here, then open it to bulk-upload files
// and tidy metadata.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { createTopicAction, setTopicPublishedAction } from "./actions";

export type AdminTopic = {
  id: string;
  slug: string;
  title_kz: string;
  title_ru: string | null;
  subtitle_kz: string | null;
  published: boolean;
  order_index: number;
  problems: number;
  theory: number;
};

const inputClass =
  "h-9 w-full rounded-md border-[1.5px] border-[#d8dde5] bg-white px-2.5 text-[13px] outline-none transition-colors focus:border-[#2563eb]";

export function LessonsAdminClient({ topics }: { topics: AdminTopic[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    slug: "",
    titleKz: "",
    titleRu: "",
    subtitleKz: "",
    subtitleRu: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createTopicAction(form);
      if (result.ok) {
        setForm({ slug: "", titleKz: "", titleRu: "", subtitleKz: "", subtitleRu: "" });
        router.push(`/admin/lessons/${result.id}`);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-lg font-bold text-[#1a1a2e]">Сабақтар (lesson player)</h1>
      <p className="mt-1 text-sm text-[#6b7280]">
        Жаңа ойнатқыштың тақырыптары. Тақырыпты ашып, .js сабақ файлдарын
        топтап жүктеңіз.
      </p>

      <div className="mt-5 rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4">
        <div className="text-[13px] font-bold text-[#1a1a2e]">Жаңа тақырып</div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <input
            className={inputClass}
            placeholder="slug (мыс. cube)"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Атауы (KZ) *"
            value={form.titleKz}
            onChange={(e) => setForm({ ...form, titleKz: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Название (RU)"
            value={form.titleRu}
            onChange={(e) => setForm({ ...form, titleRu: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Подзаголовок KZ (сынып…)"
            value={form.subtitleKz}
            onChange={(e) => setForm({ ...form, subtitleKz: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Подзаголовок RU"
            value={form.subtitleRu}
            onChange={(e) => setForm({ ...form, subtitleRu: e.target.value })}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={create}
            disabled={pending || !form.slug.trim() || !form.titleKz.trim()}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#2563eb] px-4 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {pending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            Құру
          </button>
          {error && <span className="text-[13px] text-[#dc2626]">{error}</span>}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {topics.length === 0 && (
          <div className="rounded-xl border-[1.5px] border-dashed border-[#c5cad3] bg-white p-8 text-center text-sm text-[#6b7280]">
            Әзірге тақырып жоқ.
          </div>
        )}
        {topics.map((topic) => (
          <TopicRow key={topic.id} topic={topic} />
        ))}
      </div>
    </div>
  );
}

function TopicRow({ topic }: { topic: AdminTopic }) {
  const [pending, startTransition] = useTransition();
  const [published, setPublished] = useState(topic.published);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-[#d8dde5] bg-white px-4 py-3">
      <Link
        href={`/admin/lessons/${topic.id}`}
        className="min-w-0 flex-1 hover:text-[#2563eb]"
      >
        <div className="truncate text-[14px] font-bold text-[#1a1a2e]">
          {topic.title_kz}
          <span className="ml-2 text-xs font-medium text-[#6b7280]">
            /{topic.slug}
          </span>
        </div>
        <div className="text-xs text-[#6b7280]">
          {topic.problems} есеп · {topic.theory} теория
          {topic.subtitle_kz ? ` · ${topic.subtitle_kz}` : ""}
        </div>
      </Link>

      <a
        href={`/labs/lesson/${topic.slug}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 rounded-md border-[1.5px] border-[#d8dde5] px-2.5 py-1 text-xs font-semibold text-[#6b7280] hover:border-[#c5cad3] hover:text-[#1a1a2e]"
      >
        <ExternalLinkIcon className="size-3.5" />
        Ашу
      </a>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const next = !published;
            const result = await setTopicPublishedAction({
              id: topic.id,
              published: next,
            });
            if (result.ok) setPublished(next);
          })
        }
        className={cn(
          "rounded-md border-[1.5px] px-2.5 py-1 text-xs font-semibold transition-colors",
          published
            ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
            : "border-[#d8dde5] bg-white text-[#6b7280] hover:text-[#1a1a2e]",
        )}
      >
        {published ? "Жарияланған" : "Черновик"}
      </button>
    </div>
  );
}
