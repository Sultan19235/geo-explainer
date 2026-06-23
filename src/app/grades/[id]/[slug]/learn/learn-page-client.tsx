"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Grid3X3Icon,
  Maximize2Icon,
  Minimize2Icon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/strings";
import { cn } from "@/lib/utils";
import { IframeWithLoader } from "@/components/iframe-with-loader";
import { LessonHeader } from "../lesson-header";

export type Difficulty = "easy" | "med" | "hard";

export type Problem = {
  id: string;
  number: string;
  title_kz: string;
  title_ru: string | null;
  difficulty: Difficulty;
  tags_kz: string[];
  tags_ru: string[];
  display_order: number;
  is_ready: boolean;
  problem_html_path: string | null;
  signed_url: string | null;
};

type Topic = {
  gradeId: number;
  slug: string;
  name_kz: string;
  name_ru: string | null;
  description_kz: string | null;
  description_ru: string | null;
};

type LearnPageClientProps = {
  topic: Topic;
  theoryUrl: string | null;
  problems: Problem[];
};

type DifficultyFilter = "all" | Difficulty;

const difficultyMeta: Record<
  Difficulty,
  { className: string }
> = {
  easy: {
    className: "bg-[#ecfdf5] text-[#16a34a] ring-[#bbf7d0]",
  },
  med: {
    className: "bg-[#fff7ed] text-[#f59e0b] ring-[#fed7aa]",
  },
  hard: {
    className: "bg-[#fef2f2] text-[#dc2626] ring-[#fecaca]",
  },
};

function topicName(topic: Topic, lang: Lang) {
  return lang === "ru" ? topic.name_ru ?? topic.name_kz : topic.name_kz;
}

function problemTitle(problem: Problem, lang: Lang) {
  return lang === "ru"
    ? problem.title_ru ?? problem.title_kz
    : problem.title_kz;
}

function problemTags(problem: Problem, lang: Lang) {
  return lang === "ru" && problem.tags_ru.length > 0
    ? problem.tags_ru
    : problem.tags_kz;
}

function appendLang(url: string | null, lang: Lang) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}lang=${lang}`;
}

function isUsableProblem(problem: Problem) {
  return problem.is_ready && Boolean(problem.signed_url);
}

export function LearnPageClient({
  topic,
  theoryUrl,
  problems,
}: LearnPageClientProps) {
  const { t, lang } = useT();
  const [bankOpen, setBankOpen] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const problemSectionRef = useRef<HTMLElement | null>(null);

  const problemById = useMemo(
    () => new Map(problems.map((problem) => [problem.id, problem])),
    [problems],
  );

  const pickedProblems = useMemo(
    () =>
      pickedIds
        .map((id) => problemById.get(id))
        .filter((problem): problem is Problem => Boolean(problem)),
    [pickedIds, problemById],
  );

  const activeProblem =
    activeIndex >= 0 && activeIndex < pickedProblems.length
      ? pickedProblems[activeIndex]
      : null;

  const togglePick = (problem: Problem) => {
    if (!isUsableProblem(problem)) return;

    setPickedIds((current) => {
      const activeId =
        activeIndex >= 0 && activeIndex < current.length
          ? current[activeIndex]
          : null;
      const next = current.includes(problem.id)
        ? current.filter((id) => id !== problem.id)
        : [...current, problem.id];

      if (next.length === 0) {
        setActiveIndex(-1);
      } else if (activeId) {
        const nextActiveIndex = next.indexOf(activeId);
        setActiveIndex(
          nextActiveIndex >= 0
            ? nextActiveIndex
            : Math.min(activeIndex, next.length - 1),
        );
      }

      return next;
    });
  };

  const removePickedProblem = (problemId: string) => {
    const problem = problemById.get(problemId);
    if (problem) togglePick(problem);
  };

  const clearPlaylist = () => {
    setPickedIds([]);
    setActiveIndex(-1);
    setIsFullscreen(false);
  };

  const usePlaylist = () => {
    if (pickedIds.length === 0) return;

    setActiveIndex((current) =>
      current >= 0 && current < pickedIds.length ? current : 0,
    );
    setBankOpen(false);

    window.setTimeout(() => {
      problemSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 180);
  };

  const moveActive = useCallback(
    (direction: -1 | 1) => {
      setActiveIndex((current) => {
        if (current < 0) return current;
        return Math.min(
          Math.max(current + direction, 0),
          pickedProblems.length - 1,
        );
      });
    },
    [pickedProblems.length],
  );

  const reorderPicked = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setPickedIds((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length
      ) {
        return current;
      }

      const activeId =
        activeIndex >= 0 && activeIndex < current.length
          ? current[activeIndex]
          : null;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      if (activeId) {
        setActiveIndex(next.indexOf(activeId));
      }

      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const tagName =
        target instanceof HTMLElement ? target.tagName.toLowerCase() : "";

      if (tagName === "input" || tagName === "textarea") return;

      if (event.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
          event.preventDefault();
          return;
        }
        if (bankOpen) {
          setBankOpen(false);
          event.preventDefault();
        }
      }

      if (bankOpen || !activeProblem) return;

      if (event.key === "ArrowLeft") {
        moveActive(-1);
        event.preventDefault();
      }
      if (event.key === "ArrowRight") {
        moveActive(1);
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeProblem, bankOpen, isFullscreen, moveActive]);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  const localizedTopicName = topicName(topic, lang);

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-[#1a1a2e]">
      <LessonHeader
        gradeId={topic.gradeId}
        localizedName={localizedTopicName}
        backHref={`/grades/${topic.gradeId}/${topic.slug}`}
        backLabel={t("hub_back_to_lesson")}
      />

      <main className="w-full px-4 py-3">
        <TheoryCard
          theoryUrl={appendLang(theoryUrl, lang)}
          lang={lang}
          localizedName={localizedTopicName}
        />

        <section
          ref={problemSectionRef}
          className="mt-4 overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
          <ProblemViewer
            activeProblem={activeProblem}
            activeIndex={activeIndex}
            pickedProblems={pickedProblems}
            isFullscreen={isFullscreen}
            onFullscreenChange={setIsFullscreen}
            onOpenBank={() => setBankOpen(true)}
            onPrev={() => moveActive(-1)}
            onNext={() => moveActive(1)}
            onJump={setActiveIndex}
            onRemove={removePickedProblem}
            onReorder={reorderPicked}
          />
        </section>
      </main>

      {!activeProblem && (
        <BankFab count={problems.length} onClick={() => setBankOpen(true)} />
      )}

      <BankDrawer
        open={bankOpen}
        onOpenChange={setBankOpen}
        topicName={localizedTopicName}
        problems={problems}
        pickedIds={pickedIds}
        onTogglePick={togglePick}
        onRemove={removePickedProblem}
        onClear={clearPlaylist}
        onUse={usePlaylist}
      />
    </div>
  );
}

function TheoryCard({
  theoryUrl,
  lang,
  localizedName,
}: {
  theoryUrl: string | null;
  lang: Lang;
  localizedName: string;
}) {
  const { t } = useT();
  return (
    <section className="overflow-hidden rounded-xl border-[1.5px] border-[#d8dde5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-h-12 items-center gap-3 border-b-[1.5px] border-[#d8dde5] px-[18px] py-[11px]">
        <span className="inline-flex items-center rounded bg-[#ecfdf5] px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#16a34a]">
          {t("theory_badge")}
        </span>
        <h2 className="truncate text-sm font-semibold text-[#1a1a2e]">
          {localizedName} {t("theory_heading_suffix")}
        </h2>
      </div>

      {theoryUrl ? (
        <IframeWithLoader
          key={`theory:${lang}`}
          src={theoryUrl}
          title={t("theory_badge")}
          sandbox="allow-scripts allow-same-origin"
          className="block h-[560px] w-full border-0 bg-white md:h-[640px]"
        />
      ) : (
        <div className="flex h-80 items-center justify-center bg-[#f8f9fb] px-6 text-center text-sm text-[#6b7280]">
          {t("theory_not_uploaded")}
        </div>
      )}
    </section>
  );
}

function BankFab({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useT();
  return (
    <Button
      type="button"
      onClick={onClick}
      className="fixed right-6 bottom-6 z-40 h-12 rounded-full bg-[#2563eb] px-[18px] text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#1d4ed8] hover:shadow-[0_8px_22px_rgba(37,99,235,0.45)]"
    >
      <Grid3X3Icon className="size-[18px]" />
      <span>{t("bank_button")}</span>
      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
        {count}
      </span>
    </Button>
  );
}

function BankDrawer({
  open,
  onOpenChange,
  topicName: localizedTopicName,
  problems,
  pickedIds,
  onTogglePick,
  onRemove,
  onClear,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicName: string;
  problems: Problem[];
  pickedIds: string[];
  onTogglePick: (problem: Problem) => void;
  onRemove: (problemId: string) => void;
  onClear: () => void;
  onUse: () => void;
}) {
  const { t, lang } = useT();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");

  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  const pickedProblems = useMemo(
    () =>
      pickedIds
        .map((id) => problems.find((problem) => problem.id === id))
        .filter((problem): problem is Problem => Boolean(problem)),
    [pickedIds, problems],
  );

  const filteredProblems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return problems.filter((problem) => {
      if (difficulty !== "all" && problem.difficulty !== difficulty) {
        return false;
      }
      if (!query) return true;

      const searchable = [
        problem.number,
        problem.title_kz,
        problem.title_ru ?? "",
        ...problem.tags_kz,
        ...problem.tags_ru,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [difficulty, problems, search]);

  const difficultyLabel = (d: Difficulty | "all") =>
    d === "all"
      ? t("difficulty_all")
      : d === "easy"
        ? t("difficulty_easy")
        : d === "med"
          ? t("difficulty_med")
          : t("difficulty_hard");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-slate-950/45 supports-backdrop-filter:backdrop-blur-0"
        className="top-auto right-0 bottom-0 left-0 flex h-[82vh] max-h-[760px] w-full max-w-none translate-x-0 translate-y-0 grid-rows-none flex-col gap-0 rounded-b-none rounded-t-[14px] border-t-[1.5px] border-[#d8dde5] bg-white p-0 text-[#1a1a2e] shadow-[0_-10px_30px_rgba(0,0,0,0.18)] sm:max-w-none data-open:animate-in data-open:slide-in-from-bottom data-open:duration-300 data-closed:animate-out data-closed:slide-out-to-bottom data-closed:duration-200"
      >
        <div className="mx-auto mt-2 mb-1 h-1 w-[42px] rounded-full bg-[#c5cad3]" />

        <DialogHeader className="border-b-[1.5px] border-[#d8dde5] px-[22px] pt-1.5 pb-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle className="text-base font-bold text-[#1a1a2e]">
                {localizedTopicName} {t("bank_topic_suffix")}
                <span className="ml-2 text-[13px] font-medium text-[#6b7280]">
                  · {problems.length}
                </span>
              </DialogTitle>

              <div className="relative w-full sm:w-72">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#9ca3af]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("bank_search_placeholder")}
                  className="h-[34px] rounded-md border-[1.5px] border-[#d8dde5] bg-[#f8f9fb] pl-8 text-[13px] text-[#1a1a2e] placeholder:text-[#9ca3af] focus-visible:border-[#2563eb] focus-visible:ring-[#2563eb]/15"
                />
              </div>

              <div className="flex rounded-md border border-[#d8dde5] bg-[#f8f9fb] p-0.5">
                {(["all", "easy", "med", "hard"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDifficulty(value)}
                    className={cn(
                      "rounded px-3 py-1.5 text-xs font-semibold text-[#6b7280] transition-colors",
                      difficulty === value &&
                        "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                    )}
                  >
                    {difficultyLabel(value)}
                  </button>
                ))}
              </div>
            </div>

            <DialogClose render={<Button variant="ghost" size="icon-sm" />}>
              <XIcon className="text-[#6b7280]" />
              <span className="sr-only">{t("bank_close")}</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {pickedProblems.length > 0 && (
          <div className="border-b-[1.5px] border-[#d8dde5] bg-gradient-to-b from-[#dbeafe] to-transparent px-[22px] py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-[0.05em] text-[#1d4ed8]">
                {t("bank_today")}
                <span className="ml-2 rounded-full bg-[#2563eb] px-2 py-0.5 text-white">
                  {pickedProblems.length}
                </span>
              </div>
              <button
                type="button"
                onClick={onClear}
                className="rounded-md border-[1.5px] border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                {t("bank_clear_all")}
              </button>
            </div>

            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {pickedProblems.map((problem, index) => {
                const title = problemTitle(problem, lang);
                return (
                  <span
                    key={problem.id}
                    className="inline-flex max-w-64 items-center gap-1.5 rounded-full border-[1.5px] border-[#d8dde5] bg-white py-1 pr-1 pl-3 text-xs text-[#1a1a2e]"
                  >
                    <span className="truncate">
                      <strong className="text-[#1d4ed8]">{index + 1}.</strong>{" "}
                      №{problem.number} · {title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(problem.id)}
                      className="grid size-5 shrink-0 place-items-center rounded-full text-[#6b7280] transition-colors hover:bg-red-600 hover:text-white"
                      aria-label={t("bank_remove_item")(title)}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid flex-1 content-start grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 overflow-y-auto px-[22px] py-[18px]">
          {filteredProblems.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-[#6b7280]">
              {t("bank_nothing_found")}
            </div>
          ) : (
            filteredProblems.map((problem) => (
              <BankCard
                key={problem.id}
                problem={problem}
                picked={pickedSet.has(problem.id)}
                order={pickedIds.indexOf(problem.id) + 1}
                onToggle={() => onTogglePick(problem)}
              />
            ))
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between rounded-none border-t-[1.5px] border-[#d8dde5] bg-white px-[22px] py-3">
          <div className="text-[13px] text-[#6b7280]">
            {t("bank_selected_label")}{" "}
            <strong className="font-bold text-[#1a1a2e]">
              {pickedProblems.length}
            </strong>{" "}
            {t("bank_selected_problems")}
          </div>
          <div className="flex gap-2">
            <DialogClose
              render={
                <Button
                  variant="outline"
                  className="h-9 rounded-md border-[1.5px] border-[#d8dde5] bg-white px-5 text-[13px] font-semibold text-[#6b7280] hover:bg-[#f1f3f7] hover:text-[#1a1a2e]"
                />
              }
            >
              {t("bank_close")}
            </DialogClose>
            <Button
              type="button"
              onClick={onUse}
              disabled={pickedProblems.length === 0}
              className="h-9 rounded-md bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8] disabled:bg-slate-300"
            >
              {t("bank_use_button")} · {pickedProblems.length}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankCard({
  problem,
  picked,
  order,
  onToggle,
}: {
  problem: Problem;
  picked: boolean;
  order: number;
  onToggle: () => void;
}) {
  const { t, lang } = useT();
  const usable = isUsableProblem(problem);
  const title = problemTitle(problem, lang);
  const tags = problemTags(problem, lang);
  const difficultyLabelText =
    problem.difficulty === "easy"
      ? t("difficulty_easy")
      : problem.difficulty === "med"
        ? t("difficulty_med")
        : t("difficulty_hard");
  const statusText = problem.is_ready ? t("file_missing") : t("in_preparation");

  return (
    <button
      type="button"
      disabled={!usable}
      onClick={onToggle}
      className={cn(
        "relative flex min-h-[120px] flex-col gap-2 rounded-lg border-[1.5px] border-[#d8dde5] bg-white p-3 text-left transition-all",
        usable &&
          "hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]",
        picked &&
          "border-[#2563eb] bg-gradient-to-br from-[#dbeafe] to-white shadow-[0_4px_12px_rgba(37,99,235,0.15)]",
        !usable && "cursor-not-allowed opacity-55",
      )}
    >
      {picked && (
        <span className="absolute top-2 right-2 grid size-[22px] place-items-center rounded-full bg-[#2563eb] text-[10.5px] font-bold text-white shadow-[0_2px_6px_rgba(15,23,42,0.06)]">
          {order}
        </span>
      )}

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-5 place-items-center rounded-[5px] border-[1.5px] border-[#d8dde5]",
            picked
              ? "border-[#2563eb] bg-[#2563eb] text-white"
              : "bg-white",
          )}
        >
          {picked && <CheckIcon className="size-3" />}
        </span>
        <span
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-bold",
            picked
              ? "border-[#2563eb] bg-[#2563eb] text-white"
              : "border-[#d8dde5] bg-[#f8f9fb] text-[#6b7280]",
          )}
        >
          №{problem.number}
        </span>
        <span
          className={cn(
            "ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1",
            difficultyMeta[problem.difficulty].className,
          )}
        >
          {difficultyLabelText}
        </span>
      </div>

      <div className="text-[13.5px] font-semibold leading-[1.4] text-[#1a1a2e]">
        {title}
      </div>

      <div className="mt-auto flex flex-wrap gap-1">
        {usable ? (
          tags.length > 0 ? (
            tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-[#d8dde5] bg-[#f8f9fb] px-1.5 py-0.5 text-[10.5px] text-[#6b7280]"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="rounded border border-[#d8dde5] bg-[#f8f9fb] px-1.5 py-0.5 text-[10.5px] text-[#6b7280]">
              {t("no_tags")}
            </span>
          )
        ) : (
          <span className="rounded border border-[#d8dde5] bg-[#f8f9fb] px-1.5 py-0.5 text-[10.5px] text-[#6b7280]">
            {statusText}
          </span>
        )}
      </div>
    </button>
  );
}

function ProblemViewer({
  activeProblem,
  activeIndex,
  pickedProblems,
  isFullscreen,
  onFullscreenChange,
  onOpenBank,
  onPrev,
  onNext,
  onJump,
  onRemove,
  onReorder,
}: {
  activeProblem: Problem | null;
  activeIndex: number;
  pickedProblems: Problem[];
  isFullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
  onOpenBank: () => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  onRemove: (problemId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const { t, lang } = useT();

  if (!activeProblem) {
    return <ProblemEmpty onOpenBank={onOpenBank} />;
  }

  const title = problemTitle(activeProblem, lang);

  return (
    <div
      className={cn(
        "relative bg-white",
        isFullscreen && "fixed inset-0 z-[100] flex flex-col",
      )}
    >
      <button
        type="button"
        onClick={() => onFullscreenChange(!isFullscreen)}
        className={cn(
          "absolute top-2.5 right-3 z-10 grid size-8 place-items-center rounded-md border-[1.5px] border-[#d8dde5] bg-white/95 text-[#6b7280] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]",
          isFullscreen &&
            "border-[#2563eb] bg-[#2563eb] text-white hover:text-white",
        )}
        aria-label={t("fullscreen")}
      >
        {isFullscreen ? (
          <Minimize2Icon className="size-4" />
        ) : (
          <Maximize2Icon className="size-4" />
        )}
      </button>

      <IframeWithLoader
        key={`${activeProblem.id}:${lang}`}
        src={appendLang(activeProblem.signed_url, lang) ?? "about:blank"}
        title={`№${activeProblem.number} ${title}`}
        sandbox="allow-scripts allow-same-origin"
        className={cn(
          "block w-full border-0 bg-white",
          isFullscreen ? "min-h-0 flex-1" : "h-[720px]",
        )}
      />

      <PlaylistNavigator
        activeIndex={activeIndex}
        problems={pickedProblems}
        onPrev={onPrev}
        onNext={onNext}
        onJump={onJump}
        onOpenBank={onOpenBank}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    </div>
  );
}

function ProblemEmpty({ onOpenBank }: { onOpenBank: () => void }) {
  const { t } = useT();
  return (
    <div className="flex h-[300px] flex-col items-center justify-center bg-[#f8f9fb] px-6 text-center">
      <div className="mb-3.5 grid size-14 place-items-center rounded-full bg-[#dbeafe] text-[#2563eb]">
        <CheckIcon className="size-7" />
      </div>
      <h2 className="text-[15px] font-semibold text-[#1a1a2e]">
        {t("empty_picked_title")}
      </h2>
      <p className="mt-1.5 max-w-md text-[13px] leading-[1.6] text-[#6b7280]">
        {t("empty_picked_text")}
      </p>
      <Button
        type="button"
        onClick={onOpenBank}
        className="mt-4 h-10 rounded-md bg-[#2563eb] px-[22px] text-[13px] font-semibold text-white hover:-translate-y-0.5 hover:bg-[#1d4ed8] hover:shadow-[0_4px_12px_rgba(37,99,235,0.25)]"
      >
        {t("open_bank")}
      </Button>
    </div>
  );
}

function PlaylistNavigator({
  activeIndex,
  problems,
  onPrev,
  onNext,
  onJump,
  onOpenBank,
  onRemove,
  onReorder,
}: {
  activeIndex: number;
  problems: Problem[];
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  onOpenBank: () => void;
  onRemove: (problemId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const { t, lang } = useT();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="flex h-[102px] items-stretch gap-2 border-t-[1.5px] border-[#d8dde5] bg-white p-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={activeIndex <= 0}
        className="flex min-w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[11.5px] font-semibold leading-tight text-white transition-all enabled:hover:-translate-y-0.5 enabled:hover:bg-[#1d4ed8] enabled:hover:shadow-[0_4px_12px_rgba(37,99,235,0.30)] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <ChevronLeftIcon className="size-[18px]" />
        <span className="hidden sm:inline">{t("nav_prev")}</span>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-[1.5px] border-[#d8dde5] bg-[#f8f9fb] px-2 py-1">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 scroll-smooth">
          {problems.map((problem, index) => {
            const title = problemTitle(problem, lang);
            return (
              <div
                key={problem.id}
                draggable
                role="button"
                tabIndex={0}
                onClick={() => onJump(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onJump(index);
                }}
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(from)) onReorder(from, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "group relative flex h-[74px] w-[168px] shrink-0 cursor-grab flex-col justify-center gap-0.5 rounded-md border-[1.5px] border-[#d8dde5] bg-white px-2 py-1 text-left transition-all duration-150 hover:border-[#2563eb] hover:bg-[#dbeafe] active:cursor-grabbing",
                  index === activeIndex &&
                    "border-[#2563eb] bg-[#2563eb] text-white shadow-[0_2px_6px_rgba(37,99,235,0.35)]",
                  dragIndex === index && "opacity-50",
                )}
                aria-pressed={index === activeIndex}
                title={title}
              >
                <div
                  className={cn(
                    "text-[9.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]",
                    index === activeIndex && "text-white/85",
                  )}
                >
                  {index + 1}/{problems.length} · №{problem.number}
                </div>
                <div
                  className={cn(
                    "line-clamp-3 text-[11px] font-semibold leading-[1.25] text-[#1a1a2e]",
                    index === activeIndex && "text-white",
                  )}
                >
                  {title}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(problem.id);
                  }}
                  className="absolute top-1 right-1 grid size-[15px] place-items-center rounded-full border border-[#d8dde5] bg-white text-[#6b7280] opacity-0 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-opacity hover:border-red-600 hover:bg-red-600 hover:text-white group-hover:opacity-100"
                  aria-label={t("bank_remove_item")(title)}
                >
                  <XIcon className="size-2" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden shrink-0 px-2 text-xs font-semibold text-[#6b7280] sm:block">
          {activeIndex + 1} / {problems.length}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={activeIndex >= problems.length - 1}
        className="flex min-w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[11.5px] font-semibold leading-tight text-white transition-all enabled:hover:-translate-y-0.5 enabled:hover:bg-[#1d4ed8] enabled:hover:shadow-[0_4px_12px_rgba(37,99,235,0.30)] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <span className="hidden sm:inline">{t("nav_next")}</span>
        <ChevronRightIcon className="size-[18px]" />
      </button>

      <button
        type="button"
        onClick={onOpenBank}
        className="relative flex min-w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-[#2563eb] bg-white px-3 text-[11.5px] font-semibold leading-tight text-[#2563eb] transition-colors hover:bg-[#dbeafe]"
      >
        <Grid3X3Icon className="size-4" />
        <span className="hidden sm:inline">{t("nav_bank")}</span>
        <span className="absolute -top-1.5 -right-1.5 rounded-full border-2 border-white bg-[#2563eb] px-1.5 text-[10px] font-bold text-white">
          {problems.length}
        </span>
      </button>
    </div>
  );
}
