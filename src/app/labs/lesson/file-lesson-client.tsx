"use client";

// Uploaded-topic lesson page: theory and problems come from the teacher's
// bulk-uploaded lesson files (served same-origin via /lesson-files/<id>),
// executed against ONE persistent GeoGebra applet — switching problems is a
// clear-and-rebuild on the same engine, not a reload. The next problem's
// file is preloaded in the background while the current one is taught.

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { TheoryPlayer } from "@/components/lesson/theory-player";
import { ProblemPlayer } from "@/components/lesson/problem-player";
import type { LessonProblemDef, LessonTheoryDef } from "@/lib/lesson/file-format";
import { loadLessonFile, type LoadedLessonFile } from "@/lib/lesson/file-loader";
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
  // updated_at as epoch ms — cache-buster for the immutable file URL.
  version: number;
};

export type FileLessonTopic = {
  slug: string;
  titleKz: string;
  titleRu: string | null;
  subtitleKz: string | null;
  subtitleRu: string | null;
};

function fileUrl(item: LessonItemRef): string {
  return `/lesson-files/${item.itemId}?v=${item.version}`;
}

function toLocalized(kz: string, ru: string | null): Localized {
  return ru ? { kz, ru } : kz;
}

function zipTags(kz: string[], ru: string[]): Localized[] {
  return kz.map((tag, index) => toLocalized(tag, ru[index] ?? null));
}

function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 text-sm text-[#6b7280]",
        className ?? "h-[220px]",
      )}
    >
      <Loader2Icon className="size-5 animate-spin" />
      {label}
    </div>
  );
}

export function FileLessonClient({
  topic,
  theoryItems,
  problemItems,
  backHref,
}: {
  topic: FileLessonTopic;
  theoryItems: LessonItemRef[];
  problemItems: LessonItemRef[];
  backHref?: string;
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

  // Bank cards show the real statement once the file is parsed (the
  // background preload below fills problemDefs shortly after page load).
  const bank: BankProblem[] = useMemo(
    () =>
      problemItems.map((item) => {
        const def = problemDefs[item.fileId];
        const loadedDef = def && def !== "loading" && def !== "error" ? def : null;
        return {
          id: item.fileId,
          number: item.number,
          title: toLocalized(item.titleKz, item.titleRu),
          difficulty: item.difficulty ?? undefined,
          tags: zipTags(item.tagsKz, item.tagsRu),
          statementHtml: loadedDef?.statement,
        };
      }),
    [problemItems, problemDefs],
  );

  // Theory files are few — load them all up front.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      theoryItems.map((item) =>
        loadLessonFile(fileUrl(item)).then((loaded) =>
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

  const storeLoaded = (bankId: string, loaded: LoadedLessonFile) => {
    setProblemDefs((current) => {
      const existing = current[bankId];
      if (existing && existing !== "loading") return current;
      return {
        ...current,
        [bankId]: loaded.kind === "problem" ? loaded.def : "error",
      };
    });
  };

  const ensureProblem = (bankId: string) => {
    const item = itemByFileId.get(bankId);
    if (!item || problemDefs[bankId]) return;
    setProblemDefs((current) => ({ ...current, [bankId]: "loading" }));
    loadLessonFile(fileUrl(item))
      .then((loaded) => storeLoaded(bankId, loaded))
      .catch(() => {
        setProblemDefs((current) => ({ ...current, [bankId]: "error" }));
      });
  };

  // Preload every problem file: warm the HTTP cache in parallel (responses
  // are immutable thanks to ?v=), then parse them one by one through the
  // runtime queue so any jump — near or far — is served locally and the bank
  // can show statements. Parsing is sequential with at most one file queued,
  // so a teacher's click still jumps ahead of the remaining preloads.
  useEffect(() => {
    let cancelled = false;
    for (const item of problemItems) {
      void fetch(fileUrl(item)).catch(() => {});
    }
    (async () => {
      for (const item of problemItems) {
        if (cancelled) return;
        try {
          const loaded = await loadLessonFile(fileUrl(item));
          if (cancelled) return;
          storeLoaded(item.fileId, loaded);
        } catch {
          // Best-effort; ensureProblem surfaces real errors on demand.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [problemItems]);

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
      backHref={backHref}
      bank={bank}
      theorySlot={
        theory ? (
          <TheoryPlayer theory={theory} lang={lang} />
        ) : theoryDefs === null ? (
          <Loading label={lang === "ru" ? "Загрузка теории…" : "Теория жүктелуде…"} />
        ) : null
      }
      onActiveProblem={(problem) => {
        ensureProblem(problem.id);
      }}
      renderProblem={(problem, { isFullscreen, solveMode }) => {
        // Loading/error placeholders keep the player's exact footprint so a
        // far jump doesn't collapse the section (worst in fullscreen, where
        // it read as "the lesson closed").
        const frameClass = isFullscreen ? "min-h-0 flex-1" : "h-[620px]";
        const def = problemDefs[problem.id];
        if (!def || def === "loading") {
          return <Loading label={loadingLabel} className={frameClass} />;
        }
        if (def === "error") {
          return (
            <div
              className={cn(
                "grid place-items-center px-6 text-center text-sm text-[#dc2626]",
                frameClass,
              )}
            >
              {errorLabel}
            </div>
          );
        }
        return (
          <ProblemPlayer
            key={def.id}
            problem={fileToPlayerProblem(def, problem.number)}
            lang={lang}
            mode={solveMode}
            hotkeys={isFullscreen}
            className={isFullscreen ? "min-h-0 flex-1" : "h-[620px]"}
          />
        );
      }}
    />
  );
}
