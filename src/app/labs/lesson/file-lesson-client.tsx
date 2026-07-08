"use client";

// Uploaded-topic lesson page: theory and problems come from the teacher's
// bulk-uploaded lesson files (served same-origin via /lesson-files/<id>),
// executed against ONE persistent GeoGebra applet — switching problems is a
// clear-and-rebuild on the same engine, not a reload. The next problem's
// file is preloaded in the background while the current one is taught.

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { TheoryPlayer } from "@/components/lesson/theory-player";
import { ProblemPlayer } from "@/components/lesson/problem-player";
import type { LessonProblemDef, LessonTheoryDef } from "@/lib/lesson/file-format";
import { loadLessonFile, preloadLessonFile } from "@/lib/lesson/file-loader";
import {
  fileToPlayerProblem,
  fileToPlayerTheory,
  type BankProblem,
} from "@/lib/lesson/player-adapter";
import type { Localized } from "@/lib/lesson/types";
import { LessonShell } from "./lesson-shell";

export type LessonItemRef = {
  // lesson_items.id (uuid) — the serving route key.
  itemId: string;
  // meta.id from the file — the stable content id (?q=, saved sets).
  fileId: string;
  number: string;
  titleKz: string;
  titleRu: string | null;
  difficulty: "easy" | "med" | "hard" | null;
  tagsKz: string[];
  tagsRu: string[];
};

export type FileLessonTopic = {
  slug: string;
  titleKz: string;
  titleRu: string | null;
  subtitleKz: string | null;
  subtitleRu: string | null;
};

function fileUrl(itemId: string): string {
  return `/lesson-files/${itemId}`;
}

function toLocalized(kz: string, ru: string | null): Localized {
  return ru ? { kz, ru } : kz;
}

function zipTags(kz: string[], ru: string[]): Localized[] {
  return kz.map((tag, index) => toLocalized(tag, ru[index] ?? null));
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center gap-3 text-sm text-[#6b7280]">
      <Loader2Icon className="size-5 animate-spin" />
      {label}
    </div>
  );
}

export function FileLessonClient({
  topic,
  theoryItems,
  problemItems,
}: {
  topic: FileLessonTopic;
  theoryItems: LessonItemRef[];
  problemItems: LessonItemRef[];
}) {
  const { lang } = useT();
  const [theoryDefs, setTheoryDefs] = useState<LessonTheoryDef[] | null>(null);
  const [problemDefs, setProblemDefs] = useState<
    Record<string, LessonProblemDef | "loading" | "error">
  >({});

  const itemByFileId = useMemo(
    () => new Map(problemItems.map((item) => [item.fileId, item])),
    [problemItems],
  );

  const bank: BankProblem[] = useMemo(
    () =>
      problemItems.map((item) => ({
        id: item.fileId,
        number: item.number,
        title: toLocalized(item.titleKz, item.titleRu),
        difficulty: item.difficulty ?? undefined,
        tags: zipTags(item.tagsKz, item.tagsRu),
      })),
    [problemItems],
  );

  // Theory files are few — load them all up front.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      theoryItems.map((item) =>
        loadLessonFile(fileUrl(item.itemId)).then((loaded) =>
          loaded.kind === "theory" ? loaded.def : null,
        ),
      ),
    )
      .then((defs) => {
        if (cancelled) return;
        setTheoryDefs(defs.filter((def): def is LessonTheoryDef => def !== null));
      })
      .catch(() => {
        if (!cancelled) setTheoryDefs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [theoryItems]);

  const ensureProblem = (bankId: string) => {
    const item = itemByFileId.get(bankId);
    if (!item || problemDefs[bankId]) return;
    setProblemDefs((current) => ({ ...current, [bankId]: "loading" }));
    loadLessonFile(fileUrl(item.itemId))
      .then((loaded) => {
        setProblemDefs((current) => ({
          ...current,
          [bankId]: loaded.kind === "problem" ? loaded.def : "error",
        }));
      })
      .catch(() => {
        setProblemDefs((current) => ({ ...current, [bankId]: "error" }));
      });
  };

  const theory = theoryDefs ? fileToPlayerTheory(theoryDefs) : null;
  const title = toLocalized(topic.titleKz, topic.titleRu);
  const subtitle = topic.subtitleKz
    ? toLocalized(topic.subtitleKz, topic.subtitleRu)
    : undefined;

  const loadingLabel =
    lang === "ru" ? "Загрузка задачи…" : "Есеп жүктелуде…";
  const errorLabel =
    lang === "ru"
      ? "Не удалось загрузить задачу. Обновите страницу."
      : "Есеп жүктелмеді. Бетті жаңартыңыз.";

  return (
    <LessonShell
      topicId={topic.slug}
      title={title}
      subtitle={subtitle}
      bank={bank}
      theorySlot={
        theory ? (
          <TheoryPlayer theory={theory} lang={lang} />
        ) : theoryDefs === null ? (
          <Loading label={lang === "ru" ? "Загрузка теории…" : "Теория жүктелуде…"} />
        ) : null
      }
      onActiveProblem={(problem, next) => {
        ensureProblem(problem.id);
        const nextItem = next ? itemByFileId.get(next.id) : null;
        if (nextItem) preloadLessonFile(fileUrl(nextItem.itemId));
      }}
      renderProblem={(problem, { isFullscreen }) => {
        const def = problemDefs[problem.id];
        if (!def || def === "loading") {
          return <Loading label={loadingLabel} />;
        }
        if (def === "error") {
          return (
            <div className="grid h-[220px] place-items-center px-6 text-center text-sm text-[#dc2626]">
              {errorLabel}
            </div>
          );
        }
        return (
          <ProblemPlayer
            key={def.id}
            problem={fileToPlayerProblem(def, problem.number)}
            lang={lang}
            hotkeys={isFullscreen}
            className={isFullscreen ? "min-h-0 flex-1" : "h-[620px]"}
          />
        );
      }}
    />
  );
}
