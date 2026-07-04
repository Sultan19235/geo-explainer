"use client";

// Teacher console of the quiz engine: open a room (code + QR) → watch live
// student cards stream in over SSE → leaderboard. Rendered standalone at
// /play/<id>/host and embedded in the lesson page's quizzes tab.

import { useRef, useState } from "react";
import {
  Check,
  Copy,
  EyeOff,
  Flag,
  Expand,
  ListChecks,
  Loader2,
  Play,
  QrCode as QrCodeIcon,
  Square,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/quiz/confetti";
import { MathText } from "@/components/quiz/math-text";
import { QrCode } from "@/components/quiz/qr-code";
import { TimerPill } from "@/components/quiz/timer-pill";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { loc, type Localized } from "@/lib/quiz/pack";
import { engineT } from "@/lib/quiz/engine-strings";
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

export function PackConsoleClient({
  quizId,
  title,
  questionCount,
  embedded = false,
}: {
  quizId: string;
  title: Localized;
  questionCount: number;
  embedded?: boolean;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const session = useTeacherSession();
  const [qrOpen, setQrOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const quizTitle = loc(title, lang);
  // session.code is null during SSR, so window is only touched in the browser.
  const studentUrl =
    session.code === null
      ? ""
      : `${window.location.origin}/play/${quizId}?code=${session.code}`;

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "quiz-grid-paper text-foreground",
        embedded ? "min-h-[640px] rounded-b-xl md:min-h-[760px]" : "min-h-dvh",
      )}
    >
      {session.phase === "setup" && (
        <div className="flex min-h-[inherit] flex-col items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
            <div className="mb-3 flex justify-end">
              <LanguageToggle />
            </div>
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-2xl">
              🧮
            </div>
            <h1 className="text-xl font-bold tracking-tight">{quizTitle}</h1>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <ListChecks className="size-4" aria-hidden />
              {questionCount} {t("c_questions")}
            </p>
            {session.createError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
              >
                {session.createError === "unauthorized"
                  ? t("c_err_unauthorized")
                  : t("c_err_network")}
              </p>
            )}
            <Button
              onClick={() => void session.createRoom(quizTitle)}
              disabled={session.creating}
              className="mt-5 h-12 w-full text-base font-semibold"
            >
              {session.creating ? (
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
        </div>
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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-1 truncate text-sm font-bold sm:text-base">
          <MathText text={quizTitle} />
        </h1>
        <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs font-bold tracking-widest">
          {code}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold tabular-nums">
          <Users className="size-3.5 text-primary" aria-hidden />
          {sorted.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
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
            className="grid size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
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
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((s, rank) => {
            const pct = pctOf(s);
            return (
              <div
                key={s.studentId}
                className={cn(
                  "rounded-xl border-[1.5px] border-border bg-card p-3 transition-shadow",
                  s.flash === "ok" && "border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]",
                  s.flash === "err" && "border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: avatarColor(s.name) }}
                  >
                    {rank < 3 ? MEDALS[rank] : s.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate text-sm font-bold">{s.name}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-bold tabular-nums">
                    {s.score}
                    <span className="text-xs font-semibold text-muted-foreground">
                      /{s.total}
                    </span>
                  </span>
                  <span
                    className={cn("text-sm font-bold tabular-nums", pctColor(pct))}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  {s.finished && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Flag className="size-3" aria-hidden />
                      {t("c_finished_tag")}
                    </span>
                  )}
                  {!s.focused && (
                    <span className="flex items-center gap-1 text-red-500">
                      <EyeOff className="size-3" aria-hidden />
                      {t("c_away_tag")}
                    </span>
                  )}
                  {s.tabSwitches > 0 && (
                    <span title="tab switches">↷ {s.tabSwitches}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
