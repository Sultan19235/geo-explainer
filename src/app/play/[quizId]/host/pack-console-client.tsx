"use client";

// Teacher console of the quiz engine: open a room (code + QR) → watch live
// student cards stream in over SSE → leaderboard. Rendered standalone at
// /play/<id>/host and embedded in the lesson page's quizzes tab.

import { Fragment, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  Check,
  Copy,
  EyeOff,
  Flag,
  Expand,
  GripVertical,
  ListChecks,
  ListOrdered,
  Loader2,
  Play,
  QrCode as QrCodeIcon,
  Shuffle,
  Square,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Confetti } from "@/components/quiz/confetti";
import { MathText } from "@/components/quiz/math-text";
import { QrCode } from "@/components/quiz/qr-code";
import { TimerPill } from "@/components/quiz/timer-pill";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  loc,
  type Localized,
  type PackQuestion,
  type PackTag,
  type PackTagColor,
  type PackTagGroup,
} from "@/lib/quiz/pack";
import { engineT } from "@/lib/quiz/engine-strings";
import type { SavedQuizRef } from "@/lib/quiz/saved-quiz";
import {
  createSavedQuizAction,
  updateSavedQuizAction,
} from "@/lib/quiz/saved-quiz-actions";
import {
  useTeacherSession,
  type LiveStudent,
} from "@/lib/quiz/use-teacher-session";

const AVATAR_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#7c3aed",
  "#ec4899",
  "#f97316",
];

const MEDALS = ["🥇", "🥈", "🥉"];
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

function avatarColor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function pctOf(s: LiveStudent) {
  return s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
}

function pctColor(pct: number) {
  return pct >= 70
    ? "text-emerald-600"
    : pct >= 40
      ? "text-amber-600"
      : "text-red-600";
}

function sortStudents(students: Map<string, LiveStudent>) {
  return Array.from(students.values()).sort((a, b) => {
    const pA = a.total > 0 ? a.score / a.total : 0;
    const pB = b.total > 0 ? b.score / b.total : 0;
    return pB !== pA ? pB - pA : b.score - a.score;
  });
}

// The saved quiz currently being edited in the console. `snapshot` is the
// composition at last save; comparing against the live selection detects
// unsaved changes.
type SavedState = { id: string; name: string; snapshot: string };

function selectionSnapshot(ids: string[], mode: "custom" | "shuffle") {
  return `${ids.join(",")}|${mode}`;
}

export function PackConsoleClient({
  quizId,
  title,
  questions,
  tagGroups,
  embedded = false,
  canSave = true,
  savedQuiz = null,
  initialSelectedIds,
  initialOrderMode,
}: {
  quizId: string;
  title: Localized;
  questions: PackQuestion[];
  tagGroups?: PackTagGroup[];
  embedded?: boolean;
  // false for dev-preview, where there is no signed-in user to own a save.
  canSave?: boolean;
  savedQuiz?: SavedQuizRef | null;
  initialSelectedIds?: string[];
  initialOrderMode?: "custom" | "shuffle";
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const session = useTeacherSession();
  const [qrOpen, setQrOpen] = useState(false);
  // Which questions the teacher includes in this room — an ordered list; in
  // "custom" mode students get exactly this sequence. Defaults to the whole
  // pack in pack order (or the saved quiz being edited). Frozen once the room
  // opens (the picker is only shown in the setup phase).
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => initialSelectedIds ?? questions.map((q) => q.id),
  );
  // "custom" → students follow selectedIds; "shuffle" → each student's device
  // deals its own question/option order (anti-cheating for neighbors).
  const [orderMode, setOrderMode] = useState<"custom" | "shuffle">(
    initialOrderMode ?? "custom",
  );
  // When some saved ids no longer exist in the pack, the loaded selection
  // already differs from the row — an unmatchable snapshot keeps "save
  // changes" enabled so the teacher can persist the cleanup.
  const [saved, setSaved] = useState<SavedState | null>(() =>
    savedQuiz
      ? {
          id: savedQuiz.id,
          name: savedQuiz.name,
          snapshot:
            savedQuiz.missing > 0
              ? "stale"
              : selectionSnapshot(
                  initialSelectedIds ?? questions.map((q) => q.id),
                  initialOrderMode ?? "custom",
                ),
        }
      : null,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const quizTitle = loc(title, lang);

  // Keep the join link (and QR) clean when `q` adds nothing: the whole pack in
  // pack order, or the whole pack under shuffle where order is irrelevant.
  // selectedIds only ever holds distinct ids from this pack, so length
  // equality means "same set".
  const wholePack = selectedIds.length === questions.length;
  const packOrder = questions.map((q) => q.id).join(",");
  const qParam =
    selectedIds.length > 0 &&
    !(wholePack && (orderMode === "shuffle" || selectedIds.join(",") === packOrder))
      ? selectedIds.join(",")
      : null;
  // session.code is null during SSR, so window is only touched in the browser.
  const studentUrl =
    session.code === null
      ? ""
      : `${window.location.origin}/play/${quizId}?code=${session.code}${
          qParam ? `&q=${encodeURIComponent(qParam)}` : ""
        }${orderMode === "shuffle" ? "&shuffle=1" : ""}`;

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };

  // Embedded setup blends into the lesson page (plain background, site-style
  // cards); once a room opens, the console becomes its own framed graph-paper
  // surface — the visual cue that "quiz mode" started.
  const plainSetup = embedded && session.phase === "setup";

  return (
    <div
      ref={rootRef}
      className={cn(
        "text-foreground",
        !plainSetup && "quiz-grid-paper",
        embedded &&
          !plainSetup &&
          "min-h-[640px] overflow-hidden rounded-xl border-[1.5px] border-border shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:min-h-[760px]",
        !embedded && "min-h-dvh",
      )}
    >
      {session.phase === "setup" && (
        <SetupScreen
          quizId={quizId}
          quizTitle={quizTitle}
          questions={questions}
          tagGroups={tagGroups}
          embedded={embedded}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          orderMode={orderMode}
          setOrderMode={setOrderMode}
          canSave={canSave}
          saved={saved}
          setSaved={setSaved}
          savedMissing={savedQuiz?.missing ?? 0}
          creating={session.creating}
          createError={session.createError}
          onCreate={() => void session.createRoom(quizTitle)}
        />
      )}

      {session.phase === "lobby" && session.code && (
        <LobbyScreen
          code={session.code}
          studentUrl={studentUrl}
          students={session.students}
          onStart={() => void session.start()}
          onOpenQr={() => setQrOpen(true)}
        />
      )}

      {session.phase === "live" && session.code && (
        <LiveScreen
          quizTitle={quizTitle}
          code={session.code}
          students={session.students}
          timeLeft={session.timeLeft}
          onEnd={() => {
            if (window.confirm(t("c_end_confirm"))) void session.end();
          }}
          onOpenQr={() => setQrOpen(true)}
          onFullscreen={toggleFullscreen}
        />
      )}

      {session.phase === "results" && (
        <ResultsScreen students={session.students} onNew={session.reset} />
      )}

      {qrOpen && session.code && (
        <QrOverlay
          code={session.code}
          studentUrl={studentUrl}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
}

// ═══ SETUP (title + order mode + question picker) ═══════════════════════

const TAG_BADGE_COLORS: Record<PackTagColor, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  slate: "border-border bg-background text-muted-foreground",
};

function SetupScreen({
  quizId,
  quizTitle,
  questions,
  tagGroups,
  embedded,
  selectedIds,
  setSelectedIds,
  orderMode,
  setOrderMode,
  canSave,
  saved,
  setSaved,
  savedMissing,
  creating,
  createError,
  onCreate,
}: {
  quizId: string;
  quizTitle: string;
  questions: PackQuestion[];
  tagGroups?: PackTagGroup[];
  embedded: boolean;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  orderMode: "custom" | "shuffle";
  setOrderMode: (mode: "custom" | "shuffle") => void;
  canSave: boolean;
  saved: SavedState | null;
  setSaved: (s: SavedState) => void;
  savedMissing: number;
  creating: boolean;
  createError: "unauthorized" | "network" | null;
  onCreate: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const total = questions.length;
  const selectedCount = selectedIds.length;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  // id → question + its stable "№ in the pack" (shown even when filters hide
  // neighbors, so numbering never shifts under the teacher).
  const byId = useMemo(
    () =>
      new Map(
        questions.map((q, i) => [q.id, { question: q, number: i + 1 }] as const),
      ),
    [questions],
  );
  const tagDefs = useMemo(() => {
    const map = new Map<string, PackTag>();
    for (const group of tagGroups ?? [])
      for (const tag of group.tags) map.set(tag.id, tag);
    return map;
  }, [tagGroups]);

  // Tag filter: chips from different groups AND together, chips inside one
  // group OR together (e.g. "cube" + "easy" = easy cube questions).
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const visible = useMemo(() => {
    if (activeTags.size === 0 || !tagGroups) return questions;
    return questions.filter((q) => {
      for (const group of tagGroups) {
        const active = group.tags.filter((tag) => activeTags.has(tag.id));
        if (active.length === 0) continue;
        if (!active.some((tag) => q.tags?.includes(tag.id))) return false;
      }
      return true;
    });
  }, [questions, tagGroups, activeTags]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions)
      for (const tid of q.tags ?? []) counts.set(tid, (counts.get(tid) ?? 0) + 1);
    return counts;
  }, [questions]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // "Select all" acts on the filtered view: appends the visible unselected
  // (in pack order) or clears the visible ones, leaving the rest untouched.
  const allVisibleSelected =
    visible.length > 0 && visible.every((q) => selectedSet.has(q.id));
  const toggleAllVisible = () => {
    const visibleIds = new Set(visible.map((q) => q.id));
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.has(id))
        : [...prev, ...visible.filter((q) => !selectedSet.has(q.id)).map((q) => q.id)],
    );
  };

  const toggleTag = (id: string) =>
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Embedded: the lesson page's main already pads horizontally, and site
  // cards are flatter (thin border + hairline shadow) than the standalone
  // console's floating cards on graph paper.
  const cardClass = embedded
    ? "rounded-xl border-[1.5px] border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    : "rounded-2xl border border-border bg-card shadow-lg shadow-blue-950/5";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl",
        embedded ? "py-2" : "px-4 py-6",
      )}
    >
      {/* header card */}
      <div className={cn(cardClass, "p-5")}>
        {!embedded && (
          <div className="mb-3 flex justify-end">
            <LanguageToggle />
          </div>
        )}
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-2xl">
            🧮
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              {quizTitle}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ListChecks className="size-4" aria-hidden />
              <span className="tabular-nums">
                {selectedCount} / {total}
              </span>{" "}
              {t("c_selected")}
            </p>
          </div>
        </div>

        {/* order mode */}
        <div
          role="radiogroup"
          aria-label={`${t("c_mode_custom")} / ${t("c_mode_shuffle")}`}
          className="mt-4 grid gap-2 sm:grid-cols-2"
        >
          <ModeButton
            active={orderMode === "custom"}
            icon={ListOrdered}
            label={t("c_mode_custom")}
            desc={t("c_mode_custom_desc")}
            onClick={() => setOrderMode("custom")}
          />
          <ModeButton
            active={orderMode === "shuffle"}
            icon={Shuffle}
            label={t("c_mode_shuffle")}
            desc={t("c_mode_shuffle_desc")}
            onClick={() => setOrderMode("shuffle")}
          />
        </div>

        {canSave && (
          <SaveQuizControls
            quizId={quizId}
            selectedIds={selectedIds}
            orderMode={orderMode}
            saved={saved}
            setSaved={setSaved}
            embedded={embedded}
          />
        )}

        {savedMissing > 0 && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
            {t("c_saved_missing").replace("{n}", String(savedMissing))}
          </p>
        )}
        {createError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
          >
            {createError === "unauthorized"
              ? t("c_err_unauthorized")
              : t("c_err_network")}
          </p>
        )}
        {selectedCount === 0 && !createError && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
            {t("c_none_selected")}
          </p>
        )}

        <Button
          onClick={onCreate}
          disabled={creating || selectedCount === 0}
          className="mt-4 h-12 w-full text-base font-semibold"
        >
          {creating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("c_creating")}
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden />
              {t("c_open_room")}
            </>
          )}
        </Button>
      </div>

      {/* selection tray */}
      {selectedCount > 0 && (
        <SelectionTray
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          byId={byId}
          lang={lang}
          reorderable={orderMode === "custom"}
          cardClass={cardClass}
        />
      )}

      {/* tag filter chips */}
      {tagGroups && tagGroups.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-1.5 px-1">
          <FilterChip
            active={activeTags.size === 0}
            label={`${t("c_filter_all")} · ${total}`}
            onClick={() => setActiveTags(new Set())}
          />
          {tagGroups.map((group) => (
            <Fragment key={group.id}>
              <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
              {group.tags.map((tag) => (
                <FilterChip
                  key={tag.id}
                  active={activeTags.has(tag.id)}
                  label={`${loc(tag.label, lang)} · ${tagCounts.get(tag.id) ?? 0}`}
                  onClick={() => toggleTag(tag.id)}
                />
              ))}
            </Fragment>
          ))}
        </div>
      )}

      {/* picker toolbar */}
      <div className="mb-2 mt-4 flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("c_select_hint")}
        </p>
        <button
          type="button"
          onClick={toggleAllVisible}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          {allVisibleSelected ? t("c_deselect_all") : t("c_select_all")}
        </button>
      </div>

      {/* question list (filtered view, stable pack numbering) */}
      <div className="space-y-2">
        {visible.map((question) => (
          <QuestionPreviewRow
            key={question.id}
            index={byId.get(question.id)?.number ?? 0}
            question={question}
            lang={lang}
            selected={selectedSet.has(question.id)}
            orderPos={
              orderMode === "custom" && selectedSet.has(question.id)
                ? selectedIds.indexOf(question.id) + 1
                : null
            }
            tagDefs={tagDefs}
            onToggle={() => toggle(question.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  icon: typeof ListOrdered;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-xl border-[1.5px] p-3 text-left transition-colors",
        active
          ? "border-primary bg-accent"
          : "border-border bg-background hover:border-primary/40",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-bold",
          active ? "text-primary" : "text-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
      <span className="mt-1 block text-xs leading-snug text-muted-foreground">
        {desc}
      </span>
    </button>
  );
}

// ═══ SAVE QUIZ (name + reuse from the dashboard) ═════════════════════════

function SaveQuizControls({
  quizId,
  selectedIds,
  orderMode,
  saved,
  setSaved,
  embedded,
}: {
  quizId: string;
  selectedIds: string[];
  orderMode: "custom" | "shuffle";
  saved: SavedState | null;
  setSaved: (s: SavedState) => void;
  embedded: boolean;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  // naming = the name input is open (first save, or "save as new" of an
  // already-saved quiz — both create a new row).
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = selectionSnapshot(selectedIds, orderMode);
  const dirty = saved !== null && snapshot !== saved.snapshot;
  const empty = selectedIds.length === 0;

  const errorText = (code: string) =>
    code === "unauthorized"
      ? t("c_err_unauthorized")
      : code === "limit"
        ? t("c_save_err_limit")
        : t("c_save_err");

  const flashSaved = () => {
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const createNew = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || empty) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createSavedQuizAction({
        quizId,
        name: trimmed,
        questionIds: selectedIds,
        orderMode,
      });
      if (res.ok) {
        setSaved({ id: res.id, name: trimmed, snapshot });
        setNaming(false);
        setName("");
        flashSaved();
        // Keep the address reopenable: a refresh of the standalone console
        // returns to this saved quiz. The embedded console shares the lesson
        // page's URL, so it is left alone.
        if (!embedded) {
          const url = new URL(window.location.href);
          url.searchParams.set("saved", res.id);
          window.history.replaceState(null, "", url);
        }
      } else {
        setError(errorText(res.error));
      }
    } catch {
      setError(errorText("network"));
    }
    setBusy(false);
  };

  const saveChanges = async () => {
    if (!saved || busy || empty) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateSavedQuizAction({
        id: saved.id,
        questionIds: selectedIds,
        orderMode,
      });
      if (res.ok) {
        setSaved({ ...saved, snapshot });
        flashSaved();
      } else {
        setError(errorText(res.error));
      }
    } catch {
      setError(errorText("network"));
    }
    setBusy(false);
  };

  return (
    <div className="mt-3">
      {naming ? (
        <div className="rounded-xl border-[1.5px] border-primary/40 bg-background p-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              maxLength={120}
              placeholder={t("c_save_name_placeholder")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createNew();
                if (e.key === "Escape") {
                  setNaming(false);
                  setName("");
                }
              }}
              className="h-9 flex-1"
            />
            <Button
              size="sm"
              disabled={busy || !name.trim() || empty}
              onClick={() => void createNew()}
              className="h-9 font-semibold"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              {t("c_save_confirm")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setNaming(false);
                setName("");
              }}
              className="h-9"
            >
              {t("c_save_cancel")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("c_saved_hint")}
          </p>
        </div>
      ) : saved ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-border bg-background px-3 py-2">
          <Bookmark className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {saved.name}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || empty || !dirty}
            onClick={() => void saveChanges()}
            className="h-8 font-semibold"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : justSaved && !dirty ? (
              <>
                <Check className="size-3.5" aria-hidden />
                {t("c_saved_ok")}
              </>
            ) : (
              t("c_save_changes")
            )}
          </Button>
          <button
            type="button"
            title={t("c_save_as_new")}
            aria-label={t("c_save_as_new")}
            disabled={busy}
            onClick={() => setNaming(true)}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <BookmarkPlus className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={empty}
          onClick={() => setNaming(true)}
          className="h-10 w-full font-semibold"
        >
          <BookmarkPlus className="size-4" aria-hidden />
          {t("c_save_quiz")}
        </Button>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// ═══ SELECTION TRAY (the quiz being built, in order) ════════════════════

function SelectionTray({
  selectedIds,
  setSelectedIds,
  byId,
  lang,
  reorderable,
  cardClass,
}: {
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  byId: Map<string, { question: PackQuestion; number: number }>;
  lang: "kz" | "ru";
  reorderable: boolean;
  cardClass: string;
}) {
  const t = engineT(lang);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const move = (from: number, to: number) =>
    setSelectedIds((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });

  const remove = (id: string) =>
    setSelectedIds((prev) => prev.filter((x) => x !== id));

  return (
    <div className={cn("mt-4", cardClass)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5">
        <ListOrdered className="size-4 text-primary" aria-hidden />
        <p className="text-sm font-bold">{t("c_tray_title")}</p>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-bold tabular-nums">
          {selectedIds.length}
        </span>
        {!reorderable && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Shuffle className="size-3.5" aria-hidden />
            {t("c_tray_shuffle_note")}
          </span>
        )}
      </div>
      <ol className="max-h-72 overflow-y-auto p-2">
        {selectedIds.map((id, i) => {
          const entry = byId.get(id);
          if (!entry) return null;
          return (
            <li
              key={id}
              draggable={reorderable}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", id);
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(i);
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "flex items-start gap-1.5 rounded-lg px-2 py-1.5",
                dragIndex === i && "opacity-40",
                overIndex === i &&
                  dragIndex !== null &&
                  dragIndex !== i &&
                  "bg-accent",
              )}
            >
              {reorderable && (
                <GripVertical
                  className="mt-1.5 size-4 shrink-0 cursor-grab text-muted-foreground/50"
                  aria-hidden
                />
              )}
              <span className="w-6 shrink-0 pt-1 text-right font-mono text-xs font-bold tabular-nums text-primary">
                {i + 1}.
              </span>
              <span className="min-w-0 flex-1 pt-1 text-[13px] leading-snug">
                <MathText text={loc(entry.question.text, lang)} />
              </span>
              {reorderable && (
                <>
                  <TrayButton
                    label={t("c_move_up")}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </TrayButton>
                  <TrayButton
                    label={t("c_move_down")}
                    disabled={i === selectedIds.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </TrayButton>
                </>
              )}
              <TrayButton label={t("c_remove_question")} onClick={() => remove(id)}>
                <X className="size-3.5" aria-hidden />
              </TrayButton>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TrayButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md border border-transparent text-muted-foreground",
        disabled
          ? "opacity-30"
          : "hover:border-border hover:bg-background hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function QuestionPreviewRow({
  index,
  question,
  lang,
  selected,
  orderPos,
  tagDefs,
  onToggle,
}: {
  index: number;
  question: PackQuestion;
  lang: "kz" | "ru";
  selected: boolean;
  // 1-based position in the teacher's order; null hides it (shuffle mode /
  // unselected) and the checkbox falls back to a plain check mark.
  orderPos: number | null;
  tagDefs: Map<string, PackTag>;
  onToggle: () => void;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={() => {
        // let teachers drag-select/copy question text without toggling
        const sel = window.getSelection();
        if (sel && sel.type === "Range") return;
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "group cursor-pointer rounded-xl border-[1.5px] bg-card p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary/40"
          : "border-border opacity-60 hover:border-primary/40 hover:opacity-80",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors",
            selected
              ? "border-primary bg-primary text-white"
              : "border-border bg-background text-transparent group-hover:border-primary/50",
          )}
        >
          {selected && orderPos !== null ? (
            <span className="text-[10px] font-bold leading-none tabular-nums">
              {orderPos}
            </span>
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex gap-2 text-[15px] font-medium leading-snug">
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {index}.
            </span>
            <MathText text={loc(question.text, lang)} />
          </div>

          {question.tags && question.tags.length > 0 && tagDefs.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {question.tags.map((tid) => {
                const def = tagDefs.get(tid);
                if (!def) return null;
                return (
                  <span
                    key={tid}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                      TAG_BADGE_COLORS[def.color ?? "slate"],
                    )}
                  >
                    {loc(def.label, lang)}
                  </span>
                );
              })}
            </div>
          )}

          {question.type === "mcq" && question.options && (
            <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
              {question.options.map((opt, oi) => {
                const correct = oi === question.correct;
                return (
                  <div
                    key={oi}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]",
                      correct
                        ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-800"
                        : "border-border bg-background text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border text-[10px] font-bold",
                        correct
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {correct ? (
                        <Check className="size-3" aria-hidden />
                      ) : (
                        OPTION_LABELS[oi]
                      )}
                    </span>
                    <MathText text={loc(opt, lang)} />
                  </div>
                );
              })}
            </div>
          )}

          {question.type === "input" && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 px-2.5 py-1.5 text-[13px] font-semibold text-emerald-800">
              <Check className="size-3.5" aria-hidden />
              <MathText text={question.answer ?? ""} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ LOBBY ══════════════════════════════════════════════════════════════

function LobbyScreen({
  code,
  studentUrl,
  students,
  onStart,
  onOpenQr,
}: {
  code: string;
  studentUrl: string;
  students: Map<string, LiveStudent>;
  onStart: () => void;
  onOpenQr: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [copied, setCopied] = useState(false);
  const names = Array.from(students.values());

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {t("c_room_code")}
      </p>
      <p className="mt-1 font-mono text-6xl font-bold tracking-[0.18em] text-primary sm:text-7xl">
        {code}
      </p>

      <button
        type="button"
        onClick={onOpenQr}
        title={t("c_show_qr")}
        className="mt-6 rounded-2xl border border-border bg-white p-3 shadow-lg shadow-blue-950/5 transition-transform hover:scale-[1.02]"
      >
        <QrCode text={studentUrl} size={200} />
      </button>
      <p className="mt-3 text-sm text-muted-foreground">{t("c_scan_hint")}</p>

      <button
        type="button"
        onClick={copyLink}
        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {copied ? t("c_copied") : t("c_copy_link")}
      </button>

      <div className="mt-7 w-full rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Users className="size-4 text-primary" aria-hidden />
          {t("c_students")}: {names.length}
        </p>
        {names.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("c_waiting_students")}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {names.map((s) => (
              <span
                key={s.studentId}
                className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-sm font-semibold"
              >
                <span
                  className="grid size-6 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: avatarColor(s.name) }}
                >
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={onStart}
        disabled={names.length === 0}
        className="mt-6 h-13 w-full max-w-sm text-base font-semibold"
      >
        <Play className="size-4" aria-hidden />
        {t("c_start")}
      </Button>
    </div>
  );
}

// ═══ LIVE ═══════════════════════════════════════════════════════════════

function LiveScreen({
  quizTitle,
  code,
  students,
  timeLeft,
  onEnd,
  onOpenQr,
  onFullscreen,
}: {
  quizTitle: string;
  code: string;
  students: Map<string, LiveStudent>;
  timeLeft: number;
  onEnd: () => void;
  onOpenQr: () => void;
  onFullscreen: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const sorted = sortStudents(students);
  const away = sorted.filter((s) => !s.focused).length;

  return (
    <div className="w-full px-3 py-3 sm:px-4">
      <header className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="min-w-0 truncate text-sm font-bold sm:text-base">
            <MathText text={quizTitle} />
          </h1>
          <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs font-bold tracking-widest">
            {code}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums">
            <Users className="size-3.5 text-primary" aria-hidden />
            {sorted.length}
          </span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums",
              away > 0
                ? "animate-pulse border-red-200 bg-red-50 text-red-700"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            <EyeOff className="size-3.5" aria-hidden />
            {away} {t("c_out_count")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TimerPill seconds={timeLeft} />
          <button
            type="button"
            onClick={onOpenQr}
            title={t("c_show_qr")}
            className="grid size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <QrCodeIcon className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onFullscreen}
            title={t("c_fullscreen")}
            className="hidden size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground sm:grid"
          >
            <Expand className="size-4" aria-hidden />
          </button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onEnd}
            className="h-8 font-semibold"
          >
            <Square className="size-3.5" aria-hidden />
            {t("c_end")}
          </Button>
        </div>
      </header>

      {sorted.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          {t("c_no_students")}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
          {sorted.map((s, i) => (
            <StudentCard key={s.studentId} student={s} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Total time spent off-screen, compact: "55с" / "2м 5с".
function fmtAway(seconds: number) {
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}м ${s}с` : `${m}м`;
}

function StudentCard({
  student: s,
  rank,
}: {
  student: LiveStudent;
  rank: number;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const pct = pctOf(s);
  const wrong = s.total - s.score;
  const barColor =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div
      className={cn(
        "rounded-xl border-[1.5px] bg-card p-3 transition-shadow",
        rank === 1
          ? "border-amber-300 bg-gradient-to-br from-amber-50 to-card"
          : rank === 2
            ? "border-slate-300 bg-gradient-to-br from-slate-50 to-card"
            : rank === 3
              ? "border-orange-300 bg-gradient-to-br from-orange-50 to-card"
              : "border-border",
        s.flash === "ok" &&
          "border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]",
        s.flash === "err" &&
          "border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-center font-mono text-sm font-bold">
          {MEDALS[rank - 1] ?? rank}
        </span>
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
          style={{ background: avatarColor(s.name) }}
        >
          {s.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {s.name}
        </span>
        <span
          className={cn(
            "font-mono text-base font-bold tabular-nums",
            pctColor(pct),
          )}
        >
          {pct}%
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1">
        <MiniStat
          value={s.score}
          label={t("c_stat_correct")}
          className="text-emerald-600"
        />
        <MiniStat
          value={wrong}
          label={t("c_stat_wrong")}
          className="text-red-600"
        />
        <MiniStat
          value={s.total}
          label={t("c_stat_total")}
          className="text-amber-600"
        />
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            barColor,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-bold",
            s.focused ? "text-emerald-700" : "text-red-600",
          )}
        >
          <span
            className={cn(
              "size-2 animate-pulse rounded-full",
              s.focused ? "bg-emerald-500" : "bg-red-500",
            )}
            aria-hidden
          />
          {s.focused ? t("c_on_screen") : t("c_off_screen")}
        </span>
        {s.finished && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <Flag className="size-3" aria-hidden />
            {t("c_finished_tag")}
          </span>
        )}
      </div>

      {s.tabSwitches > 0 && (
        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-sm font-bold text-red-700">
          <EyeOff className="size-4" aria-hidden />
          {s.tabSwitches}× · {fmtAway(s.awaySeconds)}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-background/70 px-1 py-1.5 text-center">
      <div className={cn("font-mono text-base font-bold tabular-nums", className)}>
        {value}
      </div>
      <div className="truncate text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// ═══ RESULTS ════════════════════════════════════════════════════════════

function ResultsScreen({
  students,
  onNew,
}: {
  students: Map<string, LiveStudent>;
  onNew: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const sorted = sortStudents(students);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {sorted.length > 0 && <Confetti />}
      <h1 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
        <Trophy className="size-6 text-amber-500" aria-hidden />
        {t("c_results_title")}
      </h1>

      {sorted.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          {t("c_results_empty")}
        </p>
      ) : (
        <>
          <div className="mt-7 flex items-end justify-center gap-3">
            {sorted.slice(0, 3).map((s, i) => (
              <div
                key={s.studentId}
                className={cn(
                  "flex w-36 flex-col items-center rounded-2xl border border-border bg-card p-4 shadow-lg shadow-blue-950/5",
                  i === 0 && "order-2 -translate-y-3 border-amber-300",
                  i === 1 && "order-1",
                  i === 2 && "order-3",
                )}
              >
                <span className="text-3xl">{MEDALS[i]}</span>
                <span className="mt-1.5 w-full truncate text-center text-sm font-bold">
                  {s.name}
                </span>
                <span className="text-lg font-bold tabular-nums text-primary">
                  {s.score}/{s.total}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold tabular-nums",
                    pctColor(pctOf(s)),
                  )}
                >
                  {pctOf(s)}%
                </span>
              </div>
            ))}
          </div>

          {sorted.length > 3 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
              {sorted.slice(3).map((s, i) => (
                <div
                  key={s.studentId}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="w-6 text-right font-bold tabular-nums text-muted-foreground">
                    {i + 4}
                  </span>
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: avatarColor(s.name) }}
                  >
                    {s.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate font-semibold">{s.name}</span>
                  <span className="ml-auto font-bold tabular-nums">
                    {s.score}/{s.total}
                  </span>
                  <span
                    className={cn(
                      "w-11 text-right font-bold tabular-nums",
                      pctColor(pctOf(s)),
                    )}
                  >
                    {pctOf(s)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="mt-5 text-center text-xs text-muted-foreground">
        {t("c_results_note")}
      </p>
      <div className="mt-4 flex justify-center">
        <Button onClick={onNew} variant="outline" className="font-semibold">
          {t("c_new_session")}
        </Button>
      </div>
    </div>
  );
}

// ═══ QR OVERLAY (projector) ═════════════════════════════════════════════

function QrOverlay({
  code,
  studentUrl,
  onClose,
}: {
  code: string;
  studentUrl: string;
  onClose: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 bg-white p-6"
      onClick={onClose}
      role="dialog"
      aria-label={t("c_show_qr")}
    >
      <p className="font-mono text-5xl font-bold tracking-[0.2em] text-primary sm:text-7xl">
        {code}
      </p>
      <QrCode text={studentUrl} size={Math.min(420, typeof window !== "undefined" ? window.innerWidth - 80 : 420)} />
      <p className="text-base text-muted-foreground">{t("c_scan_hint")}</p>
    </div>
  );
}
