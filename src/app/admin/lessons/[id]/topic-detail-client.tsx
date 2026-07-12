"use client";

// Topic detail: drag-drop bulk upload of .js lesson files + the quick-edit
// metadata table (number / difficulty / tags / order / publish / delete).
// Titles come from the files; re-uploading a file with the same id updates
// its content and keeps the metadata set here.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteLessonItemAction,
  setCatalogTopicLinkAction,
  updateLessonItemAction,
  uploadLessonFilesAction,
  type UploadFileResult,
} from "../actions";

export type CatalogTopicOption = {
  id: string;
  grade_id: number;
  slug: string;
  name_kz: string;
  lesson_topic_id: string | null;
};

export type AdminItem = {
  id: string;
  kind: "problem" | "theory";
  file_id: string;
  number: string;
  title_kz: string;
  difficulty: "easy" | "med" | "hard" | null;
  tags_kz: string[];
  tags_ru: string[];
  order_index: number;
  published: boolean;
  updated_at: string;
};

const inputClass =
  "h-8 rounded-md border-[1.5px] border-[#d8dde5] bg-white px-2 text-[12.5px] outline-none transition-colors focus:border-[#2563eb]";

export function TopicDetailClient({
  topic,
  items,
  catalogTopics,
  linkedCatalogId,
}: {
  topic: { id: string; slug: string; title_kz: string; published: boolean };
  items: AdminItem[];
  catalogTopics: CatalogTopicOption[];
  linkedCatalogId: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [results, setResults] = useState<UploadFileResult[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (fileList: FileList | File[]) => {
    const files: { name: string; text: string }[] = [];
    for (const file of Array.from(fileList)) {
      if (!/\.js$/i.test(file.name)) continue;
      files.push({ name: file.name, text: await file.text() });
    }
    if (files.length === 0) return;
    setUploading(true);
    setResults(null);
    try {
      const response = await uploadLessonFilesAction({
        topicId: topic.id,
        files,
      });
      setResults(response.results);
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  const problems = items.filter((item) => item.kind === "problem");
  const theory = items.filter((item) => item.kind === "theory");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/lessons"
          className="flex items-center gap-1 rounded-md border-[1.5px] border-[#d8dde5] px-2.5 py-1.5 text-xs font-semibold text-[#6b7280] hover:text-[#1a1a2e]"
        >
          <ArrowLeftIcon className="size-3.5" />
          Тақырыптар
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[#1a1a2e]">
          {topic.title_kz}
          <span className="ml-2 text-sm font-medium text-[#6b7280]">
            /{topic.slug}
          </span>
        </h1>
        <a
          href={`/labs/lesson/${topic.slug}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-md border-[1.5px] border-[#d8dde5] px-2.5 py-1.5 text-xs font-semibold text-[#6b7280] hover:border-[#c5cad3] hover:text-[#1a1a2e]"
        >
          <ExternalLinkIcon className="size-3.5" />
          Сабақты ашу
        </a>
      </div>

      <CatalogLinkPanel
        lessonTopicId={topic.id}
        catalogTopics={catalogTopics}
        linkedCatalogId={linkedCatalogId}
      />

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn(
          "mt-5 cursor-pointer rounded-xl border-2 border-dashed bg-white p-8 text-center transition-colors",
          dragOver
            ? "border-[#2563eb] text-[#2563eb]"
            : "border-[#c5cad3] text-[#6b7280] hover:border-[#9ca3af]",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".js"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm font-semibold">
            <Loader2Icon className="size-5 animate-spin" />
            Жүктелуде…
          </div>
        ) : (
          <>
            <UploadIcon className="mx-auto size-6" />
            <div className="mt-2 text-sm font-semibold">
              .js сабақ файлдарын осында тастаңыз (топтап болады)
            </div>
            <div className="mt-1 text-xs">
              Есеп те, теория да — бір жерге. Қайта жүктеу мазмұнды жаңартады,
              метадеректер сақталады.
            </div>
          </>
        )}
      </div>

      {results && (
        <div className="mt-3 rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-3 text-[12.5px]">
          {results.map((result, index) => (
            <div
              key={index}
              className={cn(
                "flex gap-2 py-0.5",
                result.ok ? "text-[#15803d]" : "text-[#dc2626]",
              )}
            >
              <span className="font-semibold">{result.name}:</span>
              <span>{result.message}</span>
            </div>
          ))}
        </div>
      )}

      {theory.length > 0 && (
        <>
          <h2 className="mt-6 text-[13px] font-bold uppercase tracking-[0.05em] text-[#6b7280]">
            Теория · {theory.length}
          </h2>
          <div className="mt-2 flex flex-col gap-2">
            {theory.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      <h2 className="mt-6 text-[13px] font-bold uppercase tracking-[0.05em] text-[#6b7280]">
        Есептер · {problems.length}
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {problems.length === 0 && (
          <div className="rounded-xl border-[1.5px] border-dashed border-[#c5cad3] bg-white p-6 text-center text-sm text-[#6b7280]">
            Әзірге есеп жоқ — файлдарды жоғарыда жүктеңіз.
          </div>
        )}
        {problems.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

// Attach this lesson topic to a catalog topic: the /grades learn page of the
// chosen topic then renders the native lesson player instead of HTML iframes.
function CatalogLinkPanel({
  lessonTopicId,
  catalogTopics,
  linkedCatalogId,
}: {
  lessonTopicId: string;
  catalogTopics: CatalogTopicOption[];
  linkedCatalogId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(linkedCatalogId ?? "");
  const [error, setError] = useState<string | null>(null);

  const grades = [...new Set(catalogTopics.map((row) => row.grade_id))];
  const linked = catalogTopics.find((row) => row.id === linkedCatalogId);
  const dirty = selected !== (linkedCatalogId ?? "");

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setCatalogTopicLinkAction({
        lessonTopicId,
        topicId: selected || null,
      });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  };

  return (
    <div className="mt-5 rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4">
      <div className="text-[13px] font-bold uppercase tracking-[0.05em] text-[#6b7280]">
        Негізгі сайтқа қосу
      </div>
      <div className="mt-1 text-xs text-[#6b7280]">
        Каталогтағы тақырыпқа байлансаңыз, оның сабақ беті осы файлдардан
        (жаңа плеерден) ашылады.
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className={cn(inputClass, "min-w-64 max-w-full")}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— байланбаған (тек /labs) —</option>
          {grades.map((grade) => (
            <optgroup key={grade} label={`${grade}-сынып`}>
              {catalogTopics
                .filter((row) => row.grade_id === grade)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name_kz} (/{row.slug})
                    {row.lesson_topic_id &&
                    row.lesson_topic_id !== lessonTopicId
                      ? " · басқа сабаққа байланған"
                      : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="flex h-8 items-center gap-1 rounded-md bg-[#2563eb] px-3 text-[12px] font-semibold text-white transition-colors enabled:hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending && <Loader2Icon className="size-3.5 animate-spin" />}
          Сақтау
        </button>
        {linked && !dirty && (
          <a
            href={`/grades/${linked.grade_id}/${linked.slug}/learn`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-[#2563eb] hover:underline"
          >
            <ExternalLinkIcon className="size-3.5" />
            Сайттағы сабақ
          </a>
        )}
      </div>
      {error && <div className="mt-2 text-xs text-[#dc2626]">{error}</div>}
    </div>
  );
}

function ItemRow({ item }: { item: AdminItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [number, setNumber] = useState(item.number);
  const [difficulty, setDifficulty] = useState(item.difficulty ?? "");
  const [tagsKz, setTagsKz] = useState(item.tags_kz.join(", "));
  const [tagsRu, setTagsRu] = useState(item.tags_ru.join(", "));
  const [order, setOrder] = useState(String(item.order_index));
  const [published, setPublished] = useState(item.published);
  const [dirty, setDirty] = useState(false);

  const save = () => {
    startTransition(async () => {
      const result = await updateLessonItemAction({
        id: item.id,
        number,
        difficulty: (difficulty || null) as "easy" | "med" | "hard" | null,
        tagsKz: tagsKz.split(",").map((tag) => tag.trim()),
        tagsRu: tagsRu.split(",").map((tag) => tag.trim()),
        orderIndex: Number(order) || 0,
        published,
      });
      if (result.ok) {
        setDirty(false);
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!window.confirm(`Өшіру: ${item.title_kz}?`)) return;
    startTransition(async () => {
      const result = await deleteLessonItemAction({ id: item.id });
      if (result.ok) router.refresh();
    });
  };

  const mark = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-[#d8dde5] bg-white px-3 py-2.5">
      <input
        className={cn(inputClass, "w-16")}
        value={number}
        onChange={(e) => mark(setNumber)(e.target.value)}
        placeholder="№"
        title="Нөмірі"
      />
      <div className="min-w-40 flex-1 truncate text-[13px] font-semibold text-[#1a1a2e]">
        {item.title_kz}
        <span className="ml-2 text-[11px] font-normal text-[#9ca3af]">
          {item.file_id}
        </span>
      </div>
      {item.kind === "problem" && (
        <select
          className={cn(inputClass, "w-28")}
          value={difficulty}
          onChange={(e) => mark(setDifficulty)(e.target.value)}
          title="Күрделілігі"
        >
          <option value="">— деңгей —</option>
          <option value="easy">Жеңіл</option>
          <option value="med">Орташа</option>
          <option value="hard">Қиын</option>
        </select>
      )}
      <input
        className={cn(inputClass, "w-44")}
        value={tagsKz}
        onChange={(e) => mark(setTagsKz)(e.target.value)}
        placeholder="тегтер KZ (үтірмен)"
        title="Тегтер (KZ)"
      />
      <input
        className={cn(inputClass, "w-44")}
        value={tagsRu}
        onChange={(e) => mark(setTagsRu)(e.target.value)}
        placeholder="теги RU"
        title="Теги (RU)"
      />
      <input
        className={cn(inputClass, "w-14")}
        value={order}
        onChange={(e) => mark(setOrder)(e.target.value)}
        placeholder="реті"
        title="Реті"
      />
      <button
        type="button"
        onClick={() => mark(setPublished)(!published)}
        className={cn(
          "rounded-md border-[1.5px] px-2 py-1 text-[11.5px] font-semibold",
          published
            ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
            : "border-[#d8dde5] text-[#6b7280]",
        )}
      >
        {published ? "жарияланған" : "черновик"}
      </button>
      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="flex h-8 items-center gap-1 rounded-md bg-[#2563eb] px-3 text-[12px] font-semibold text-white transition-colors enabled:hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {pending && <Loader2Icon className="size-3.5 animate-spin" />}
        Сақтау
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label="delete"
        className="grid size-8 place-items-center rounded-md text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-[#dc2626]"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  );
}
