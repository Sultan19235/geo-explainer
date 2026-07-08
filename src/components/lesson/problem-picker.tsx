"use client";

// Problem bank drawer for the lesson player — same bottom-sheet design as
// the learn page's BankDrawer: search, difficulty tabs, tag filter chips,
// card grid, picked tray, and an explicit "use these problems" commit.
// Nothing is preselected: the teacher investigates the bank and ticks what
// they need (pick order = lesson order). Selections can be saved to Supabase
// as named sets and reloaded across devices.

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
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
import { pickText } from "@/lib/lesson/types";
import type { BankProblem } from "@/lib/lesson/player-adapter";
import {
  createLessonSetAction,
  deleteLessonSetAction,
  listLessonSetsAction,
} from "@/lib/lesson/lesson-set-actions";
import type { LessonSetSummary } from "@/lib/lesson/lesson-set";

type Difficulty = "easy" | "med" | "hard";
type DifficultyFilter = "all" | Difficulty;

const difficultyMeta: Record<Difficulty, { className: string }> = {
  easy: { className: "bg-[#ecfdf5] text-[#16a34a] ring-[#bbf7d0]" },
  med: { className: "bg-[#fff7ed] text-[#f59e0b] ring-[#fed7aa]" },
  hard: { className: "bg-[#fef2f2] text-[#dc2626] ring-[#fecaca]" },
};

const WORDS = {
  saved: { kz: "Сақталған жинақтар", ru: "Сохранённые наборы" },
  savePlaceholder: { kz: "Жинақ атауы…", ru: "Название набора…" },
  save: { kz: "Сақтау", ru: "Сохранить" },
  signIn: {
    kz: "Жинақ сақтау үшін жүйеге кіріңіз.",
    ru: "Войдите в аккаунт, чтобы сохранять наборы.",
  },
  error: { kz: "Қате. Қайталап көріңіз.", ru: "Ошибка. Попробуйте ещё раз." },
} as const;

type SetsState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "ready"; sets: LessonSetSummary[] };

function problemTags(problem: BankProblem, lang: Lang): string[] {
  return (problem.tags ?? []).map((tag) => pickText(tag, lang));
}

function searchableText(problem: BankProblem): string {
  const parts: string[] = [problem.number];
  const pushLocalized = (value: BankProblem["title"]) => {
    if (typeof value === "string") parts.push(value);
    else {
      parts.push(value.kz);
      if (value.ru) parts.push(value.ru);
    }
  };
  pushLocalized(problem.title);
  for (const tag of problem.tags ?? []) pushLocalized(tag);
  return parts.join(" ").toLowerCase();
}

export function ProblemPicker({
  open,
  onOpenChange,
  problems,
  appliedIds,
  onApply,
  topicId,
  topicTitle,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problems: BankProblem[];
  // null = the lesson is on the "all problems" default (nothing explicitly
  // picked yet) — the drawer then opens with an empty selection.
  appliedIds: string[] | null;
  onApply: (ids: string[]) => void;
  topicId: string;
  topicTitle: string;
  lang: Lang;
}) {
  const { t } = useT();
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [setsState, setSetsState] = useState<SetsState>({ status: "loading" });
  const [setName, setSetName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Fresh session per open: current applied subset (for editing) or empty.
  useEffect(() => {
    if (!open) return;
    setPicked(appliedIds ?? []);
    setSearch("");
    setDifficulty("all");
    setActiveTags([]);
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listLessonSetsAction(topicId).then((result) => {
      if (cancelled) return;
      if (result.ok) setSetsState({ status: "ready", sets: result.sets });
      else if (result.error === "unauthorized")
        setSetsState({ status: "unauthorized" });
      else setSetsState({ status: "ready", sets: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [open, topicId]);

  const allTags = useMemo(() => {
    const tags: string[] = [];
    for (const problem of problems) {
      for (const tag of problemTags(problem, lang)) {
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
    return tags;
  }, [problems, lang]);

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const pickedProblems = useMemo(
    () =>
      picked
        .map((id) => problems.find((problem) => problem.id === id))
        .filter((problem): problem is BankProblem => Boolean(problem)),
    [picked, problems],
  );

  const filteredProblems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return problems.filter((problem) => {
      if (difficulty !== "all" && problem.difficulty !== difficulty) {
        return false;
      }
      if (activeTags.length > 0) {
        const tags = problemTags(problem, lang);
        if (!activeTags.some((tag) => tags.includes(tag))) return false;
      }
      if (!query) return true;
      return searchableText(problem).includes(query);
    });
  }, [problems, difficulty, activeTags, search, lang]);

  const difficultyLabel = (d: DifficultyFilter) =>
    d === "all"
      ? t("difficulty_all")
      : d === "easy"
        ? t("difficulty_easy")
        : d === "med"
          ? t("difficulty_med")
          : t("difficulty_hard");

  const togglePick = (id: string) => {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleTag = (tag: string) => {
    setActiveTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  };

  const saveSet = () => {
    const name = setName.trim();
    if (!name || picked.length === 0) return;
    setMessage(null);
    startTransition(async () => {
      const result = await createLessonSetAction({
        topicId,
        name,
        problemIds: picked,
      });
      if (result.ok) {
        setSetName("");
        const refreshed = await listLessonSetsAction(topicId);
        if (refreshed.ok)
          setSetsState({ status: "ready", sets: refreshed.sets });
      } else {
        setMessage(pickText(WORDS.error, lang));
      }
    });
  };

  const deleteSet = (id: string) => {
    startTransition(async () => {
      const result = await deleteLessonSetAction({ id });
      if (result.ok && setsState.status === "ready") {
        setSetsState({
          status: "ready",
          sets: setsState.sets.filter((set) => set.id !== id),
        });
      }
    });
  };

  const loadSet = (set: LessonSetSummary) => {
    // Ids that vanished from the pack are dropped here, at load time. The
    // teacher still confirms with the "use" button.
    const known = new Set(problems.map((problem) => problem.id));
    const ids = set.problemIds.filter((id) => known.has(id));
    if (ids.length > 0) setPicked(ids);
  };

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
                {topicTitle} {t("bank_topic_suffix")}
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

          {allTags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {allTags.map((tag) => {
                const active = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border-[1.5px] px-3 py-1 text-xs font-semibold transition-colors",
                      active
                        ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]"
                        : "border-[#d8dde5] bg-white text-[#6b7280] hover:border-[#c5cad3] hover:text-[#1a1a2e]",
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
              {activeTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTags([])}
                  className="grid size-6 place-items-center rounded-full text-[#6b7280] transition-colors hover:bg-[#eef1f5] hover:text-[#1a1a2e]"
                  aria-label={t("bank_clear_all")}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
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
                onClick={() => setPicked([])}
                className="rounded-md border-[1.5px] border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                {t("bank_clear_all")}
              </button>
            </div>

            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {pickedProblems.map((problem, index) => {
                const title = pickText(problem.title, lang);
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
                      onClick={() => togglePick(problem.id)}
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
                lang={lang}
                difficultyLabel={
                  problem.difficulty ? difficultyLabel(problem.difficulty) : ""
                }
                picked={pickedSet.has(problem.id)}
                order={picked.indexOf(problem.id) + 1}
                onToggle={() => togglePick(problem.id)}
              />
            ))
          )}
        </div>

        <div className="border-t border-dashed border-[#d8dde5] px-[22px] py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#6b7280]">
              {pickText(WORDS.saved, lang)}
            </span>

            {setsState.status === "loading" && (
              <Loader2Icon className="size-3.5 animate-spin text-[#6b7280]" />
            )}

            {setsState.status === "unauthorized" && (
              <span className="text-xs text-[#6b7280]">
                {pickText(WORDS.signIn, lang)}
              </span>
            )}

            {setsState.status === "ready" && (
              <>
                {setsState.sets.map((set) => (
                  <span
                    key={set.id}
                    className="inline-flex items-center overflow-hidden rounded-full border-[1.5px] border-[#d8dde5] bg-white"
                  >
                    <button
                      type="button"
                      onClick={() => loadSet(set)}
                      title={set.name}
                      className="flex h-7 items-center gap-1 pl-3 pr-1.5 text-xs font-semibold text-[#1a1a2e] transition-colors hover:bg-[#eef1f5]"
                    >
                      <span className="max-w-[160px] truncate">{set.name}</span>
                      <span className="text-[#6b7280]">
                        · {set.problemIds.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSet(set.id)}
                      disabled={pending}
                      aria-label="delete"
                      className="grid h-7 w-6 place-items-center border-l border-[#e5e8ee] text-[#9ca3af] transition-colors hover:text-[#dc2626]"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={setName}
                  onChange={(event) => setSetName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveSet();
                  }}
                  placeholder={pickText(WORDS.savePlaceholder, lang)}
                  maxLength={120}
                  className="h-7 w-44 rounded-full border-[1.5px] border-[#d8dde5] bg-white px-3 text-xs outline-none transition-colors focus:border-[#2563eb]"
                />
                <button
                  type="button"
                  onClick={saveSet}
                  disabled={
                    pending || setName.trim().length === 0 || picked.length === 0
                  }
                  className="flex h-7 items-center gap-1 rounded-full bg-[#2563eb] px-3 text-xs font-semibold text-white transition-colors enabled:hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {pending && <Loader2Icon className="size-3 animate-spin" />}
                  {pickText(WORDS.save, lang)}
                </button>
                {message && (
                  <span className="text-xs text-[#dc2626]">{message}</span>
                )}
              </>
            )}
          </div>
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
              onClick={() => {
                onApply(picked);
                onOpenChange(false);
              }}
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
  lang,
  difficultyLabel,
  picked,
  order,
  onToggle,
}: {
  problem: BankProblem;
  lang: Lang;
  difficultyLabel: string;
  picked: boolean;
  order: number;
  onToggle: () => void;
}) {
  const { t } = useT();
  const title = pickText(problem.title, lang);
  const tags = problemTags(problem, lang);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "relative flex min-h-[120px] flex-col gap-2 rounded-lg border-[1.5px] border-[#d8dde5] bg-white p-3 text-left transition-all",
        "hover:-translate-y-0.5 hover:border-[#2563eb] hover:shadow-[0_4px_12px_rgba(37,99,235,0.12)]",
        picked &&
          "border-[#2563eb] bg-gradient-to-br from-[#dbeafe] to-white shadow-[0_4px_12px_rgba(37,99,235,0.15)]",
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
            picked ? "border-[#2563eb] bg-[#2563eb] text-white" : "bg-white",
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
        {problem.difficulty && (
          <span
            className={cn(
              "ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1",
              difficultyMeta[problem.difficulty].className,
            )}
          >
            {difficultyLabel}
          </span>
        )}
      </div>

      <div className="text-[13.5px] font-semibold leading-[1.4] text-[#1a1a2e]">
        {title}
      </div>

      <div className="mt-auto flex flex-wrap gap-1">
        {tags.length > 0 ? (
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
        )}
      </div>
    </button>
  );
}
