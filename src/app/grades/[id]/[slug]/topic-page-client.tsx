"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Grid3X3Icon,
  Maximize2Icon,
  Minimize2Icon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

type TopicPageClientProps = {
  topic: Topic;
  theoryUrl: string | null;
  problems: Problem[];
};

type DifficultyFilter = "all" | Difficulty;

const difficultyMeta: Record<
  Difficulty,
  { label: string; className: string }
> = {
  easy: {
    label: "Жеңіл",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  med: {
    label: "Орташа",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  hard: {
    label: "Қиын",
    className: "bg-red-50 text-red-700 ring-red-200",
  },
};

function isUsableProblem(problem: Problem) {
  return problem.is_ready && Boolean(problem.signed_url);
}

export function TopicPageClient({
  topic,
  theoryUrl,
  problems,
}: TopicPageClientProps) {
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

  const moveActive = useCallback((direction: -1 | 1) => {
    setActiveIndex((current) => {
      if (current < 0) return current;
      return Math.min(Math.max(current + direction, 0), pickedProblems.length - 1);
    });
  }, [pickedProblems.length]);

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

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-[#1a1a2e]">
      <AppHeader topic={topic} />

      <main className="mx-auto max-w-[1440px] px-4 py-4">
        <TheoryCard topic={topic} theoryUrl={theoryUrl} />

        <section
          ref={problemSectionRef}
          className="mt-4 overflow-hidden rounded-xl border border-[#d8dde5] bg-white shadow-sm"
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
        topicName={topic.name_kz}
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

function AppHeader({ topic }: { topic: Topic }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-[#d8dde5] bg-white px-4 shadow-sm sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={`/grades/${topic.gradeId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeftIcon />
          <span>Басты бет</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold leading-tight">
            {topic.name_kz}
          </h1>
          <p className="truncate text-xs font-medium text-muted-foreground">
            {topic.gradeId}-сынып
          </p>
        </div>
      </div>
    </header>
  );
}

function TheoryCard({
  topic,
  theoryUrl,
}: {
  topic: Topic;
  theoryUrl: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#d8dde5] bg-white shadow-sm">
      <div className="flex min-h-12 items-center gap-3 border-b border-[#d8dde5] px-4">
        <span className="inline-flex items-center gap-1.5 rounded bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
          <BookOpenIcon className="size-3.5" />
          Теория
        </span>
        <h2 className="truncate text-sm font-semibold">
          {topic.name_kz} — теория және формулалар
        </h2>
      </div>

      {theoryUrl ? (
        <iframe
          src={theoryUrl}
          title="Теория"
          sandbox="allow-scripts allow-same-origin"
          width="100%"
          className="block h-[560px] w-full border-0 bg-white md:h-[640px]"
          style={{ border: 0 }}
        />
      ) : (
        <div className="flex h-80 items-center justify-center bg-muted/30 px-6 text-center text-sm text-muted-foreground">
          Теория файлы әлі жүктелмеген.
        </div>
      )}
    </section>
  );
}

function BankFab({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className="fixed right-6 bottom-6 z-40 h-12 rounded-full bg-blue-600 px-5 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700"
    >
      <Grid3X3Icon />
      <span>Есептер банкы</span>
      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
        {count}
      </span>
    </Button>
  );
}

function BankDrawer({
  open,
  onOpenChange,
  topicName,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-auto right-0 bottom-0 left-0 flex h-[82vh] max-h-[760px] w-full max-w-none translate-x-0 translate-y-0 grid-rows-none flex-col gap-0 rounded-b-none rounded-t-xl bg-white p-0 sm:max-w-none"
      >
        <div className="mx-auto mt-2 h-1 w-11 rounded-full bg-slate-300" />

        <DialogHeader className="border-b border-[#d8dde5] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle className="text-base font-bold">
                {topicName} есептері
                <span className="ml-2 text-sm font-medium text-muted-foreground">
                  · {problems.length}
                </span>
              </DialogTitle>

              <div className="relative w-full sm:w-72">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Іздеу..."
                  className="pl-8"
                />
              </div>

              <div className="flex rounded-lg border bg-muted/50 p-1">
                {[
                  ["all", "Бәрі"],
                  ["easy", "Жеңіл"],
                  ["med", "Орташа"],
                  ["hard", "Қиын"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDifficulty(value as DifficultyFilter)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors",
                      difficulty === value && "bg-white text-foreground shadow-sm",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <DialogClose render={<Button variant="ghost" size="icon-sm" />}>
              <XIcon />
              <span className="sr-only">Жабу</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {pickedProblems.length > 0 && (
          <div className="border-b border-[#d8dde5] bg-blue-50/70 px-5 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-blue-700">
                Бүгінгі сабаққа
                <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-white">
                  {pickedProblems.length}
                </span>
              </div>
              <button
                type="button"
                onClick={onClear}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Барлығын алып тастау
              </button>
            </div>

            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {pickedProblems.map((problem, index) => (
                <span
                  key={problem.id}
                  className="inline-flex max-w-64 items-center gap-1.5 rounded-full border bg-white py-1 pr-1 pl-3 text-xs"
                >
                  <span className="truncate">
                    <strong>{index + 1}.</strong> №{problem.number} ·{" "}
                    {problem.title_kz}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(problem.id)}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-red-600 hover:text-white"
                    aria-label={`${problem.title_kz} алып тастау`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {filteredProblems.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
              Ештеңе табылмады.
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

        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between rounded-none px-5">
          <div className="text-sm text-muted-foreground">
            Таңдалған:{" "}
            <strong className="text-foreground">{pickedProblems.length}</strong>{" "}
            есеп
          </div>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" />}>Жабу</DialogClose>
            <Button
              type="button"
              onClick={onUse}
              disabled={pickedProblems.length === 0}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Осы есептерді пайдалану · {pickedProblems.length}
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
  const usable = isUsableProblem(problem);
  const statusText = problem.is_ready ? "Файл жоқ" : "Дайындалуда";

  return (
    <button
      type="button"
      disabled={!usable}
      onClick={onToggle}
      className={cn(
        "relative flex min-h-32 flex-col gap-2 rounded-lg border bg-white p-3 text-left transition-all",
        usable && "hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md",
        picked && "border-blue-500 bg-blue-50/70",
        !usable && "cursor-not-allowed opacity-55",
      )}
    >
      {picked && (
        <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white shadow">
          {order}
        </span>
      )}

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-5 place-items-center rounded border",
            picked ? "border-blue-600 bg-blue-600 text-white" : "bg-white",
          )}
        >
          {picked && <CheckIcon className="size-3" />}
        </span>
        <span
          className={cn(
            "rounded-md border px-2 py-1 font-mono text-xs font-bold",
            picked
              ? "border-blue-600 bg-blue-600 text-white"
              : "bg-muted text-muted-foreground",
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
          {difficultyMeta[problem.difficulty].label}
        </span>
      </div>

      <div className="text-sm font-semibold leading-5 text-foreground">
        {problem.title_kz}
      </div>

      <div className="mt-auto flex flex-wrap gap-1">
        {usable ? (
          problem.tags_kz.length > 0 ? (
            problem.tags_kz.map((tag) => (
              <span
                key={tag}
                className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              тег жоқ
            </span>
          )
        ) : (
          <span className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
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
  if (!activeProblem) {
    return <ProblemEmpty onOpenBank={onOpenBank} />;
  }

  return (
    <div
      className={cn(
        "relative bg-white",
        isFullscreen && "fixed inset-0 z-[100] flex flex-col",
      )}
    >
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[#d8dde5] bg-muted/40 px-4 pr-14 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid min-w-7 place-items-center rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">
            №{activeProblem.number}
          </span>
          <span className="truncate font-semibold">{activeProblem.title_kz}</span>
        </div>
        <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {activeIndex + 1} / {pickedProblems.length}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onFullscreenChange(!isFullscreen)}
        className={cn(
          "absolute top-2.5 right-3 z-10 grid size-8 place-items-center rounded-md border bg-white/95 text-muted-foreground shadow-sm hover:text-foreground",
          isFullscreen && "bg-blue-600 text-white hover:text-white",
        )}
        aria-label="Толық экран"
      >
        {isFullscreen ? (
          <Minimize2Icon className="size-4" />
        ) : (
          <Maximize2Icon className="size-4" />
        )}
      </button>

      <iframe
        key={activeProblem.id}
        src={activeProblem.signed_url ?? "about:blank"}
        title={`№${activeProblem.number} ${activeProblem.title_kz}`}
        sandbox="allow-scripts allow-same-origin"
        width="100%"
        className={cn(
          "block w-full border-0 bg-white",
          isFullscreen ? "min-h-0 flex-1" : "h-[720px]",
        )}
        style={{ border: 0 }}
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
  return (
    <div className="flex h-[300px] flex-col items-center justify-center bg-muted/30 px-6 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-blue-50 text-blue-600">
        <CheckIcon className="size-7" />
      </div>
      <h2 className="text-base font-semibold">Сабақ есептері таңдалмаған</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Есептер банкын ашыңыз, бүгінгі сабаққа қажет есептерді белгілеңіз.
      </p>
      <Button
        type="button"
        onClick={onOpenBank}
        className="mt-4 bg-blue-600 text-white hover:bg-blue-700"
      >
        Есептер банкын ашу
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="flex h-[102px] items-stretch gap-2 border-t border-[#d8dde5] bg-white p-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={activeIndex <= 0}
        className="flex min-w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <ChevronLeftIcon className="size-5" />
        <span className="hidden sm:inline">Алдыңғы</span>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1">
          {problems.map((problem, index) => (
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
                "group relative flex h-[74px] w-40 shrink-0 cursor-grab flex-col justify-center gap-1 rounded-md border bg-white px-2 py-1 text-left transition-colors active:cursor-grabbing",
                index === activeIndex &&
                  "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/25",
                dragIndex === index && "opacity-50",
              )}
              title={problem.title_kz}
            >
              <div
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
                  index === activeIndex && "text-white/85",
                )}
              >
                {index + 1}/{problems.length} · №{problem.number}
              </div>
              <div
                className={cn(
                  "line-clamp-3 text-xs font-semibold leading-4 text-foreground",
                  index === activeIndex && "text-white",
                )}
              >
                {problem.title_kz}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(problem.id);
                }}
                className="absolute top-1 right-1 grid size-5 place-items-center rounded-full border bg-white text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100"
                aria-label={`${problem.title_kz} алып тастау`}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="hidden shrink-0 px-2 text-xs font-semibold text-muted-foreground sm:block">
          {activeIndex + 1} / {problems.length}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={activeIndex >= problems.length - 1}
        className="flex min-w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <span className="hidden sm:inline">Келесі</span>
        <ChevronRightIcon className="size-5" />
      </button>

      <button
        type="button"
        onClick={onOpenBank}
        className="relative flex min-w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-blue-600 bg-white px-3 text-xs font-semibold text-blue-600 hover:bg-blue-50"
      >
        <Grid3X3Icon className="size-4" />
        <span className="hidden sm:inline">Банк</span>
        <span className="absolute -top-2 -right-2 rounded-full border-2 border-white bg-blue-600 px-1.5 text-[10px] font-bold text-white">
          {problems.length}
        </span>
      </button>
    </div>
  );
}
