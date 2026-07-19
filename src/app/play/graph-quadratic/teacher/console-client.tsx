"use client";

// Teacher console: pick sections → open a room (code + QR) → watch live
// student cards stream in over SSE → leaderboard. Kazakh-only like the
// student page; the projected board is the audience.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  EyeOff,
  History,
  Loader2,
  Play,
  Square,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/quiz/confetti";
import { MathFormula } from "@/components/quiz/math-formula";
import { ParabolaMark } from "@/components/quiz/parabola-mark";
import { QrCode } from "@/components/quiz/qr-code";
import { TimerPill } from "@/components/quiz/timer-pill";
import { cn } from "@/lib/utils";
import { SECTION_INFO, type SectionId } from "@/lib/quiz/quadratic";
import {
  useTeacherSession,
  type LiveStudent,
  type ResumableRoom,
} from "@/lib/quiz/use-teacher-session";
import {
  useResultAutosave,
  type ResultSaveStatus,
} from "@/lib/quiz/use-result-autosave";

const QUIZ_TITLE = "Квадраттық функция";

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

export function ConsoleClient() {
  // Distinct from the pack consoles' `pack:<uuid>` keys — this legacy console
  // has no pack row behind it.
  const session = useTeacherSession({ persistKey: "graph-quadratic" });
  const [sections, setSections] = useState<Set<SectionId>>(() => new Set());
  const [qrOpen, setQrOpen] = useState(false);

  // Reconnect to a room that survived a reload: restore the section ticks the
  // room was opened with FIRST — the join link/QR derive from them.
  const resumeRoom = () => {
    const ctx = session.resumable?.ctx as { sections?: unknown } | undefined;
    if (ctx && Array.isArray(ctx.sections)) {
      const known = new Set<string>(SECTION_INFO.map((s) => s.id));
      const restored = ctx.sections.filter(
        (id): id is SectionId => typeof id === "string" && known.has(id),
      );
      if (restored.length > 0) setSections(new Set(restored));
    }
    session.resume();
  };

  // Freeze the scoreboard into the teacher's profile when the room ends.
  // Signed-out hosts get "off" back from the action and keep the old
  // ephemeral behavior. No quiz row or stable question ids behind this
  // legacy console — aggregates only.
  const resultSave = useResultAutosave({
    phase: session.phase,
    code: session.code,
    students: session.students,
    enabled: true,
    quizId: null,
    title: QUIZ_TITLE,
    questionIds: null,
  });

  // The join link without the room code — settled before the room opens, so
  // createRoom sends it to the server for the universal /join page.
  const studentPath = `/play/graph-quadratic?sec=${[...sections].join(",")}`;
  const studentUrl =
    session.code === null
      ? ""
      : `${window.location.origin}${studentPath}&code=${session.code}`;

  // One live room per teacher: the server refused the create — confirm ending
  // the other room, then the hook replays this create. The ref keeps
  // re-renders from re-opening the blocking dialog.
  const conflict = session.conflict;
  const conflictPrompted = useRef(false);
  useEffect(() => {
    if (!conflict) {
      conflictPrompted.current = false;
      return;
    }
    if (conflictPrompted.current) return;
    conflictPrompted.current = true;
    const ok = window.confirm(
      `Сізде ашық тест бар: «${conflict.title || QUIZ_TITLE}» (коды ${conflict.code}). Оны аяқтап, жаңасын бастайсыз ба?`,
    );
    void session.resolveConflict(ok);
  }, [conflict, session]);

  const kickWithConfirm = (s: LiveStudent) => {
    if (window.confirm(`${s.name} тесттен шығарылсын ба?`)) {
      session.kick(s.studentId);
    }
  };

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      {session.phase === "setup" && (
        <SetupScreen
          sections={sections}
          setSections={setSections}
          creating={session.creating}
          createError={session.createError}
          onCreate={() =>
            session.createRoom(QUIZ_TITLE, studentPath, {
              sections: [...sections],
            })
          }
          resumable={session.resumable}
          onResume={resumeRoom}
          onDiscardResume={() => {
            // Discarding a still-running room ENDS it for the students —
            // never let that be a single silent click.
            if (
              session.resumable &&
              session.resumable.status !== "ended" &&
              !window.confirm(
                "Ашық бөлме жабылады — оқушыларға «тест аяқталды» деп көрсетіледі. Жаңасын бастайсыз ба?",
              )
            ) {
              return;
            }
            session.discardResume();
          }}
        />
      )}
      {session.phase === "lobby" && session.code && (
        <LobbyScreen
          code={session.code}
          sections={sections}
          studentUrl={studentUrl}
          students={session.students}
          onStart={session.start}
          onBack={session.reset}
          onOpenQr={() => setQrOpen(true)}
          onKick={kickWithConfirm}
        />
      )}
      {session.phase === "live" && session.code && (
        <LiveScreen
          code={session.code}
          students={session.students}
          timeLeft={session.timeLeft}
          onEnd={() => {
            if (window.confirm("Сабақты аяқтайсыз ба?")) void session.end();
          }}
          onOpenQr={() => setQrOpen(true)}
          onKick={kickWithConfirm}
        />
      )}
      {session.phase === "results" && (
        <ResultsScreen
          students={session.students}
          onNew={session.reset}
          saveStatus={resultSave.status}
          onRetrySave={resultSave.retry}
        />
      )}

      {qrOpen && session.code && (
        <QrOverlay
          code={session.code}
          studentUrl={studentUrl}
          onClose={() => setQrOpen(false)}
        />
      )}
    </main>
  );
}

// ═══ SETUP ══════════════════════════════════════════════════════════════

function SetupScreen({
  sections,
  setSections,
  creating,
  createError,
  onCreate,
  resumable,
  onResume,
  onDiscardResume,
}: {
  sections: Set<SectionId>;
  setSections: (s: Set<SectionId>) => void;
  creating: boolean;
  // "race_unsupported" rides along from the shared hook's union but can never
  // occur here — this console never sends a race config on create.
  createError:
    | "unauthorized"
    | "network"
    | "race_unsupported"
    | "tourney_unsupported"
    | null;
  onCreate: () => void;
  resumable: ResumableRoom | null;
  onResume: () => void;
  onDiscardResume: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const allSelected = sections.size === SECTION_INFO.length;

  const toggle = (id: SectionId) => {
    const next = new Set(sections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSections(next);
  };

  const showEmptyError = touched && sections.size === 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <ParabolaMark className="mx-auto mb-3 size-12 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">{QUIZ_TITLE}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Тікелей тест · Бөлімдерді таңдаңыз
        </p>
      </div>

      {/* a room from a previous page-load is still alive — offer reconnect */}
      {resumable && (
        <div
          role="status"
          className="mb-4 rounded-2xl border-2 border-primary/40 bg-accent p-4"
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <History className="size-4 shrink-0 text-primary" aria-hidden />
            Ашық бөлме табылды
            <span className="rounded-full border border-primary/20 bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-[0.2em] text-primary">
              {resumable.code}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {resumable.status === "ended"
              ? "Тест аяқталды, бірақ нәтижелері сақтаулы — ашуға болады."
              : "Бөлме әлі жұмыс істеп тұр — қайта қосылсаңыз, оқушылар нәтижелерімен оралады."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onResume} className="font-semibold">
              <Play className="size-3.5" aria-hidden />
              {resumable.status === "ended"
                ? "Нәтижелерді ашу"
                : "Қайта қосылу"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDiscardResume}
              className="text-muted-foreground"
            >
              Жаңасын бастау
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-bold">Бөлімдер</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSections(
                allSelected
                  ? new Set()
                  : new Set(SECTION_INFO.map((s) => s.id)),
              )
            }
          >
            {allSelected ? "Барлығын алып тастау" : "Бәрін таңдау"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {SECTION_INFO.map((sec) => {
            const selected = sections.has(sec.id);
            return (
              <button
                key={sec.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(sec.id)}
                className={cn(
                  "flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-4 transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "border-border bg-white hover:border-primary/40 hover:bg-accent/40",
                )}
              >
                <MathFormula formula={sec.formula} className="text-lg" />
                <span
                  className={cn(
                    "font-mono text-[0.62rem] transition-colors",
                    selected ? "text-primary-foreground/75" : "text-muted-foreground",
                  )}
                >
                  {sec.example}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {(showEmptyError || createError) && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {createError === "unauthorized"
            ? "Сайтқа кіру қажет — бетті жаңартып, қайта кіріңіз"
            : createError === "network"
              ? "Серверге қосылу мүмкін болмады. Қайталап көріңіз."
              : "Кем дегенде 1 бөлімді таңдаңыз"}
        </p>
      )}

      <Button
        disabled={creating}
        onClick={() => {
          setTouched(true);
          if (sections.size > 0) onCreate();
        }}
        className="mt-4 h-12 w-full text-base font-semibold"
      >
        {creating ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Бөлме құрылуда…
          </>
        ) : (
          <>
            <Play className="size-4" aria-hidden />
            Бөлме құру
          </>
        )}
      </Button>
    </div>
  );
}

// ═══ LOBBY ══════════════════════════════════════════════════════════════

function LobbyScreen({
  code,
  sections,
  studentUrl,
  students,
  onStart,
  onBack,
  onOpenQr,
  onKick,
}: {
  code: string;
  sections: Set<SectionId>;
  studentUrl: string;
  students: Map<string, LiveStudent>;
  onStart: () => void;
  onBack: () => void;
  onOpenQr: () => void;
  onKick: (s: LiveStudent) => void;
}) {
  const joined = Array.from(students.values());
  const here = joined.filter((s) => s.connected !== false);
  const sectionNames = SECTION_INFO.filter((s) => sections.has(s.id));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{QUIZ_TITLE}</h1>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {sectionNames.map((s) => (
              <MathFormula key={s.id} formula={s.formula} />
            ))}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden />
          Өзгерту
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
        <div className="min-w-44 flex-1">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Бөлме коды
          </p>
          <p className="mt-1 font-mono text-5xl font-bold tracking-[0.25em] text-primary">
            {code}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Оқушылар QR кодты сканерлейді немесе мына сайтқа кіреді:
          </p>
          <p className="mt-0.5 text-lg font-bold tracking-tight text-primary">
            join.matem.school
          </p>
          <CopyCodeButton code={code} />
        </div>
        <button
          type="button"
          onClick={onOpenQr}
          aria-label="QR кодты үлкейту"
          className="rounded-xl border border-border bg-white p-2 transition-transform outline-none hover:scale-[1.03] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <QrCode text={studentUrl} size={120} />
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Оқушылар
          </h2>
          <p className="mt-1 mb-2">
            <span className="font-mono text-3xl font-bold text-primary">
              {here.length}
            </span>
            <span className="ml-1.5 text-sm text-muted-foreground">дайын</span>
          </p>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {joined.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Күтілуде…
              </p>
            ) : (
              joined.map((s, i) => (
                <div
                  key={s.studentId}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2",
                    s.connected === false && "opacity-45",
                  )}
                >
                  <Avatar name={s.name} index={i} size="sm" />
                  <span className="truncate text-sm font-semibold">
                    {s.name}
                  </span>
                  {s.connected === false ? (
                    <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      шығып кетті
                    </span>
                  ) : (
                    <Check
                      className="ml-auto size-4 shrink-0 text-emerald-600"
                      aria-label="қосылды"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onKick(s)}
                    title="Оқушыны шығару"
                    aria-label="Оқушыны шығару"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Нұсқаулық
          </h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm leading-relaxed text-muted-foreground">
            <li>Экранды тақтаға көрсетіңіз</li>
            <li>Оқушылар QR кодты сканерлейді</li>
            <li>Атын жазып кіреді</li>
            <li>
              <b className="text-emerald-600">Бастау</b> батырмасын басыңыз
            </li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground italic">
            Сабақ 45 минутқа шектелген
          </p>
        </section>
      </div>

      <Button
        disabled={joined.length === 0}
        onClick={onStart}
        className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700"
      >
        <Play className="size-4" aria-hidden />
        {joined.length > 0
          ? `Бастау (${joined.length} оқушы)`
          : "Бастау (оқушылар күтілуде…)"}
      </Button>
    </div>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-2.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard blocked — the code is on screen anyway
        }
      }}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-600" aria-hidden />
          Көшірілді!
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden />
          Көшіру
        </>
      )}
    </Button>
  );
}

// ═══ LIVE ═══════════════════════════════════════════════════════════════

function LiveScreen({
  code,
  students,
  timeLeft,
  onEnd,
  onOpenQr,
  onKick,
}: {
  code: string;
  students: Map<string, LiveStudent>;
  timeLeft: number;
  onEnd: () => void;
  onOpenQr: () => void;
  onKick: (s: LiveStudent) => void;
}) {
  const sorted = useMemo(() => sortStudents(students), [students]);
  const withScore = sorted.filter((s) => s.total > 0);
  const avg = withScore.length
    ? Math.round(
        withScore.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) /
          withScore.length,
      )
    : 0;
  const away = sorted.filter(
    (s) => !s.focused && s.connected !== false,
  ).length;

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 border-b border-primary/10 bg-[#f6f8fc]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <h1 className="text-sm font-bold">{QUIZ_TITLE}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <TimerPill seconds={timeLeft} />
            <span className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold">
              <Users className="size-3.5" aria-hidden />
              <span className="font-mono">{sorted.length}</span>
            </span>
            <span className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold">
              <Target className="size-3.5" aria-hidden />
              <span className="font-mono">{avg}%</span>
            </span>
            {away > 0 && (
              <span className="flex animate-pulse items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                <EyeOff className="size-3.5" aria-hidden />
                <span className="font-mono">{away}</span> сыртта
              </span>
            )}
            <button
              type="button"
              onClick={onOpenQr}
              className="rounded-full border border-primary/20 bg-accent px-3 py-1 font-mono text-xs font-bold tracking-[0.2em] text-accent-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {code}
            </button>
            <Button variant="destructive" size="sm" onClick={onEnd}>
              <Square className="size-3" aria-hidden />
              Аяқтау
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
          {sorted.map((s, i) => (
            <StudentCard
              key={s.studentId}
              student={s}
              rank={i + 1}
              onKick={() => onKick(s)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentCard({
  student: s,
  rank,
  onKick,
}: {
  student: LiveStudent;
  rank: number;
  onKick: () => void;
}) {
  const pct = pctOf(s);
  const wrong = s.total - s.score;
  const left = s.connected === false;
  // Live "away" clock: an off-screen tab throttles its heartbeat (and a left
  // student's page is gone entirely), so once the student is off-screen or
  // left we tick the timer up locally from the last report rather than
  // waiting for their return for the true total to land.
  const ticking = s.awaySince != null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  const awaySeconds = Math.round(
    ticking
      ? s.awaySeconds + (Date.now() - (s.awaySince as number)) / 1000
      : s.awaySeconds,
  );
  const barColor =
    pct >= 70 ? "bg-emerald-600" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card p-3 shadow-sm transition-colors duration-300",
        s.flash === "ok"
          ? "border-emerald-500 bg-emerald-50"
          : s.flash === "err"
            ? "border-red-500 bg-red-50"
            : rank === 1
              ? "border-amber-300 bg-gradient-to-br from-amber-50 to-card"
              : rank === 2
                ? "border-slate-300 bg-gradient-to-br from-slate-50 to-card"
                : rank === 3
                  ? "border-orange-300 bg-gradient-to-br from-orange-50 to-card"
                  : "border-border",
        left && "opacity-55 saturate-50",
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="w-6 shrink-0 text-center font-mono text-sm font-bold">
          {MEDALS[rank - 1] ?? rank}
        </span>
        <Avatar name={s.name} index={rank - 1} size="md" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {s.name}
        </span>
        <span className={cn("font-mono text-base font-bold", pctColor(pct))}>
          {pct}%
        </span>
        <button
          type="button"
          onClick={onKick}
          title="Оқушыны шығару"
          aria-label="Оқушыны шығару"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1">
        <MiniStat value={s.score} label="Дұрыс" className="text-emerald-600" />
        <MiniStat value={wrong} label="Қате" className="text-red-600" />
        <MiniStat value={s.total} label="Барлығы" className="text-amber-600" />
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[0.68rem] font-semibold",
            left
              ? "text-muted-foreground"
              : s.focused
                ? "text-muted-foreground"
                : "text-red-600",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              left
                ? "bg-slate-400"
                : s.focused
                  ? "bg-emerald-500"
                  : "animate-pulse bg-red-500",
            )}
            aria-hidden
          />
          {left ? "Шығып кетті" : s.focused ? "Экранда" : "Сыртта"}
        </span>
        {(s.tabSwitches > 0 || awaySeconds >= 1) && (
          <span className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[0.6rem] font-bold text-red-700">
            <EyeOff className="size-2.5" aria-hidden />
            {s.tabSwitches}× · {awaySeconds}с
          </span>
        )}
      </div>
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
    <div className="rounded-lg bg-background px-1 py-1.5 text-center">
      <div className={cn("font-mono text-sm font-bold", className)}>
        {value}
      </div>
      <div className="text-[0.55rem] font-bold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

function Avatar({
  name,
  index,
  size,
}: {
  name: string;
  index: number;
  size: "sm" | "md";
}) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        size === "sm" ? "size-7 text-xs" : "size-8 text-sm",
      )}
      style={{ background: `${color}1f`, color }}
    >
      {(name[0] ?? "?").toUpperCase()}
    </span>
  );
}

// ═══ RESULTS ════════════════════════════════════════════════════════════

function ResultsScreen({
  students,
  onNew,
  saveStatus,
  onRetrySave,
}: {
  students: Map<string, LiveStudent>;
  onNew: () => void;
  saveStatus: ResultSaveStatus;
  onRetrySave: () => void;
}) {
  const sorted = sortStudents(students);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      {sorted.length > 0 && <Confetti />}
      <div className="mb-6 text-center">
        <Trophy className="mx-auto mb-2 size-10 text-amber-500" aria-hidden />
        <h1 className="text-2xl font-bold tracking-tight">Нәтижелер</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sorted.length} оқушы
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((s, i) => {
          const pct = pctOf(s);
          const wrong = s.total - s.score;
          return (
            <div
              key={s.studentId}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm",
                i === 0
                  ? "border-amber-300 bg-gradient-to-r from-amber-50 to-card"
                  : i === 1
                    ? "border-slate-300 bg-gradient-to-r from-slate-50 to-card"
                    : i === 2
                      ? "border-orange-300 bg-gradient-to-r from-orange-50 to-card"
                      : "border-border",
              )}
            >
              <span className="w-7 shrink-0 text-center font-mono text-sm font-bold">
                {MEDALS[i] ?? i + 1}
              </span>
              <Avatar name={s.name} index={i} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  ✓ {s.score} · ✗ {wrong} · {s.total} сұрақ
                  {s.tabSwitches > 0 && (
                    <span className="text-red-600">
                      {" "}
                      · {s.tabSwitches}× сыртта ({s.awaySeconds}с)
                    </span>
                  )}
                </p>
              </div>
              <span
                className={cn("font-mono text-lg font-bold", pctColor(pct))}
              >
                {pct}%
              </span>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Бұл сабаққа ешкім қосылмады
          </p>
        )}
      </div>

      <div className="mt-5 flex min-h-7 items-center justify-center gap-2 text-xs">
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Нәтижелер профильге сақталуда…
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
            <Check className="size-3.5" aria-hidden />
            Нәтижелер профиліңізге сақталды
          </span>
        )}
        {saveStatus === "error" && (
          <span className="flex items-center gap-2 font-semibold text-destructive">
            Нәтижелерді сақтау сәтсіз болды
            <Button
              size="sm"
              variant="outline"
              onClick={onRetrySave}
              className="h-7 px-2 text-xs font-semibold"
            >
              Қайталау
            </Button>
          </span>
        )}
      </div>

      <Button
        onClick={onNew}
        className="mt-4 h-12 w-full text-base font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Жаңа сабақ
      </Button>
    </div>
  );
}

// ═══ QR OVERLAY ═════════════════════════════════════════════════════════

function QrOverlay({
  code,
  studentUrl,
  onClose,
}: {
  code: string;
  studentUrl: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Бөлмеге кіру QR коды"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] rounded-3xl bg-white p-9 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Жабу"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-md p-1.5 text-slate-400 outline-none hover:text-slate-700 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
        <QrCode text={studentUrl} size={280} className="mx-auto" />
        <p className="mt-5 font-mono text-4xl font-bold tracking-[0.3em] text-primary">
          {code}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          QR кодты сканерлеңіз немесе мына сайтқа кіріңіз:
        </p>
        <p className="mt-1 text-xl font-bold tracking-tight text-primary">
          join.matem.school
        </p>
      </div>
    </div>
  );
}
