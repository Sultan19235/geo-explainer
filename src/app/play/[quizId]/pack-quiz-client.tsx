"use client";

// Student side of the quiz engine: renders any quiz pack through the shared
// live-session machine. Self-paced — each student walks the question list at
// their own speed while the teacher watches the live scoreboard.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Confetti } from "@/components/quiz/confetti";
import { DragParabola } from "@/components/quiz/drag-parabola";
import { GeoGebraFigure } from "@/components/quiz/geogebra-figure";
import { GraphCanvas } from "@/components/quiz/graph-canvas";
import { MathFormula } from "@/components/quiz/math-formula";
import { MathText } from "@/components/quiz/math-text";
import { TimerPill } from "@/components/quiz/timer-pill";
import {
  formatFunc,
  generateGraphPackQuestion,
  gradeDrag,
  graphPropertyChoiceCount,
  graphPropertyChoices,
  isGraphMode,
  isSectionId,
  toVertexForm,
  type QuadParams,
  type VertexTriple,
} from "@/lib/quiz/quadratic";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  checkInputAnswer,
  loc,
  seededOrder,
  type PackGenerator,
  type PackQuestion,
  type QuizPack,
} from "@/lib/quiz/pack";
import { engineT } from "@/lib/quiz/engine-strings";
import {
  useLiveSession,
  type QuizStats,
} from "@/lib/quiz/use-live-session";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

type AnswerRecord = { ok: boolean; pick?: number; given?: string };

type PackExtra = {
  seed: number;
  idx: number;
  done: boolean;
  answered: Record<string, AnswerRecord>;
};

function identityOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

// How many selectable choices a question shows — options for mcq, or the
// choices for a graph-quadratic question (graphs/formulas for A & C, generated
// property values for B).
function choiceCount(q: PackQuestion): number {
  if (q.type === "graph-quadratic" && q.graph) {
    const g = q.graph;
    if (g.mode === "B") return graphPropertyChoiceCount(g.ask);
    if (g.mode === "D") return 0; // drag-to-build has no options
    return 1 + g.distractors.length;
  }
  return q.options?.length ?? 0;
}

export function PackQuizClient({
  quizId,
  pack,
  preview,
}: {
  quizId: string;
  pack: QuizPack;
  preview: boolean;
}) {
  if (preview) return <PreviewMode pack={pack} />;
  return <LiveMode quizId={quizId} pack={pack} />;
}

// ═══ LIVE (the real classroom flow) ══════════════════════════════════════

function LiveMode({
  quizId,
  pack: fullPack,
}: {
  quizId: string;
  pack: QuizPack;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const searchParams = useSearchParams();
  const urlCode = (searchParams.get("code") ?? "").toUpperCase();

  // The teacher may open a room with only a subset of questions; those ids
  // ride along on the join link as `?q=id1,id2,...` — in the teacher's chosen
  // order, which we preserve. Absent → the whole pack in pack order.
  // `?shuffle=1` (room-level choice) deals every student their own question
  // and option order on top of whatever the pack defaults say.
  const qParam = searchParams.get("q");
  const shuffleParam = searchParams.get("shuffle") === "1";
  const pack = useMemo<QuizPack>(() => {
    let questions = fullPack.questions;
    if (qParam) {
      const byId = new Map(fullPack.questions.map((q) => [q.id, q]));
      const seen = new Set<string>();
      const picked = qParam
        .split(",")
        .map((s) => s.trim())
        .filter((id) => {
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return byId.has(id);
        })
        .map((id) => byId.get(id)!);
      if (picked.length > 0) questions = picked;
    }
    return {
      ...fullPack,
      questions,
      shuffleQuestions: shuffleParam || fullPack.shuffleQuestions,
      shuffleOptions: shuffleParam || fullPack.shuffleOptions,
    };
  }, [fullPack, qParam, shuffleParam]);

  // Generator quiz: the teacher's ticks arrive on the join link as
  // `?sec=...&modes=...` (chosen on the console at room start). A link
  // without them — e.g. an old QR — falls back to the pack's own settings.
  const secParam = searchParams.get("sec");
  const modesParam = searchParams.get("modes");
  const generator = useMemo(() => {
    const base = fullPack.generator;
    if (!base) return null;
    const sections = (secParam ?? "").split(",").filter(isSectionId);
    const modes = (modesParam ?? "").split(",").filter(isGraphMode);
    return {
      ...base,
      sections: sections.length > 0 ? sections : base.sections,
      modes: modes.length > 0 ? modes : base.modes,
    };
  }, [fullPack.generator, secParam, modesParam]);

  const questionCount = pack.questions.length;
  const defaultExtra = useMemo<PackExtra>(
    () => ({
      seed: Math.floor(Math.random() * 2 ** 31),
      idx: 0,
      done: false,
      answered: {},
    }),
    [],
  );

  const session = useLiveSession<PackExtra>(urlCode, {
    storagePrefix: `ms_pack_${quizId}_`,
    defaultExtra,
    sanitizeExtra: (raw) => {
      if (typeof raw.seed !== "number" || !Number.isFinite(raw.seed)) {
        return null;
      }
      const idx =
        typeof raw.idx === "number" && Number.isInteger(raw.idx)
          ? Math.min(Math.max(raw.idx, 0), Math.max(questionCount - 1, 0))
          : 0;
      const answered: Record<string, AnswerRecord> = {};
      if (typeof raw.answered === "object" && raw.answered !== null) {
        for (const [id, value] of Object.entries(
          raw.answered as Record<string, unknown>,
        )) {
          if (typeof value === "object" && value !== null && "ok" in value) {
            const v = value as AnswerRecord;
            answered[id] = {
              ok: Boolean(v.ok),
              pick: typeof v.pick === "number" ? v.pick : undefined,
              given: typeof v.given === "string" ? v.given : undefined,
            };
          }
        }
      }
      return { seed: raw.seed, idx, done: raw.done === true, answered };
    },
  });

  const qOrder = useMemo(
    () =>
      pack.shuffleQuestions
        ? seededOrder(questionCount, session.extra.seed)
        : identityOrder(questionCount),
    [pack.shuffleQuestions, questionCount, session.extra.seed],
  );

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      {session.phase === "checking" && (
        <CenterFrame>
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("join_pending")}
          </p>
        </CenterFrame>
      )}
      {session.phase === "join" && (
        <JoinScreen pack={pack} session={session} />
      )}
      {session.phase === "waiting" && (
        <WaitScreen name={session.studentName} />
      )}
      {session.phase === "active" &&
        (generator ? (
          // Generator quiz: endless machine-made questions, no "done" — the
          // stream runs until the teacher ends the room.
          <GeneratedFlow generator={generator} session={session} />
        ) : session.extra.done ? (
          <DoneScreen stats={session.stats} timeLeft={session.timeLeft} />
        ) : (
          <QuestionFlow
            pack={pack}
            session={session}
            qOrder={qOrder}
          />
        ))}
      {session.phase === "ended" && <EndedScreen stats={session.stats} />}
      {session.phase === "kicked" && (
        <KickedScreen onRejoin={session.rejoin} />
      )}
    </main>
  );
}

type Session = ReturnType<typeof useLiveSession<PackExtra>>;

function CenterFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      {children}
    </div>
  );
}

// ═══ JOIN ═══════════════════════════════════════════════════════════════

function JoinScreen({ pack, session }: { pack: QuizPack; session: Session }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  // Pre-filled after a kick→rejoin round-trip, empty on a fresh visit.
  const [name, setName] = useState(session.studentName);
  const [code, setCode] = useState("");

  return (
    <CenterFrame>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-lg shadow-blue-950/5">
        <div className="mb-3 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-2xl">
            🧮
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {loc(pack.title, lang)}
          </h1>
          {pack.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {loc(pack.description, lang)}
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void session.join(name, code);
          }}
          noValidate
        >
          {session.joinError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
            >
              {t(`err_${session.joinError}`)}
            </p>
          )}
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="quiz-name">{t("join_name_label")}</Label>
            <Input
              id="quiz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("join_name_placeholder")}
              maxLength={20}
              autoComplete="off"
              autoCorrect="off"
              className="h-12 text-base"
            />
          </div>
          {session.needsCodeInput && (
            <div className="mb-4 flex flex-col gap-2">
              <Label htmlFor="quiz-code">{t("join_code_label")}</Label>
              <Input
                id="quiz-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="——————"
                maxLength={6}
                autoComplete="off"
                className="h-12 text-center font-mono text-xl tracking-[0.4em] uppercase"
              />
            </div>
          )}
          <Button
            type="submit"
            disabled={session.joinPending}
            className="mt-1 h-12 w-full text-base font-semibold"
          >
            {session.joinPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("join_pending")}
              </>
            ) : (
              <>
                {t("join_button")}
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </div>
    </CenterFrame>
  );
}

// ═══ WAIT ═══════════════════════════════════════════════════════════════

function WaitScreen({ name }: { name: string }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <CenterFrame>
      <div className="grid size-16 animate-pulse place-items-center rounded-2xl bg-accent text-3xl">
        ⏳
      </div>
      <h1 className="mt-5 text-xl font-bold tracking-tight">
        {t("waiting_title")}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {t("waiting_desc")}
      </p>
      <span className="mt-5 rounded-full border border-primary/20 bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
        {name}
      </span>
    </CenterFrame>
  );
}

// ═══ QUESTION FLOW ═══════════════════════════════════════════════════════

function QuestionFlow({
  pack,
  session,
  qOrder,
}: {
  pack: QuizPack;
  session: Session;
  qOrder: number[];
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [inputValue, setInputValue] = useState("");
  const [formulasOpen, setFormulasOpen] = useState(false);

  const { extra } = session;
  const total = pack.questions.length;
  const position = Math.min(extra.idx, total - 1);
  const question = pack.questions[qOrder[position]];
  const prior = extra.answered[question.id];
  const isLast = position >= total - 1;

  const optOrder = useMemo(() => {
    const count = choiceCount(question);
    if (count === 0) return [];
    return pack.shuffleOptions
      ? seededOrder(count, (extra.seed ^ ((qOrder[position] + 1) * 7919)) >>> 0)
      : identityOrder(count);
  }, [pack.shuffleOptions, question, extra.seed, qOrder, position]);

  const answer = (record: AnswerRecord) => {
    if (prior) return;
    session.recordAnswer(record.ok, question.id);
    session.updateExtra({
      answered: { ...extra.answered, [question.id]: record },
    });
  };

  const next = () => {
    setInputValue("");
    if (isLast) {
      session.updateExtra({ done: true });
      session.markFinished();
    } else {
      session.updateExtra({ idx: position + 1 });
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      {/* header */}
      <header className="mb-3 flex items-center gap-2">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold tabular-nums">
          {t("question_label")} {position + 1}/{total}
        </span>
        <ScorePill stats={session.stats} />
        {session.stats.streak >= 3 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Flame className="size-3.5" aria-hidden />
            {session.stats.streak}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.timeLeft !== null && <TimerPill seconds={session.timeLeft} />}
        </div>
      </header>

      {/* progress */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${Math.round((Object.keys(extra.answered).length / total) * 100)}%`,
          }}
        />
      </div>

      <QuestionCard
        key={question.id}
        question={question}
        lang={lang}
        optOrder={optOrder}
        record={prior ?? null}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onPick={(displayIndex) => {
          const pick = optOrder[displayIndex];
          // Graph choices are [equation, ...distractors], so index 0 is correct.
          const correctIndex =
            question.type === "graph-quadratic" ? 0 : question.correct;
          answer({ ok: pick === correctIndex, pick });
        }}
        onCheckInput={() => {
          if (!inputValue.trim()) return;
          answer({
            ok: checkInputAnswer(inputValue, question),
            given: inputValue,
          });
        }}
        onCheckDrag={(ok, given) => answer({ ok, given })}
      />

      {/* after-answer bar */}
      {prior && (
        <Button
          onClick={next}
          className="mt-4 h-12 w-full text-base font-semibold"
        >
          {isLast ? (
            <>
              {t("finish_button")}
              <Flag className="size-4" aria-hidden />
            </>
          ) : (
            <>
              {t("next_button")}
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      )}

      {/* formulas */}
      {pack.formulas && pack.formulas.length > 0 && (
        <button
          type="button"
          onClick={() => setFormulasOpen(true)}
          className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-lg shadow-blue-950/10"
        >
          <BookOpen className="size-4" aria-hidden />
          {t("formulas_button")}
        </button>
      )}
      {formulasOpen && pack.formulas && (
        <FormulasPanel
          formulas={pack.formulas.map((f) => loc(f, lang))}
          onClose={() => setFormulasOpen(false)}
        />
      )}
    </div>
  );
}

// ═══ GENERATED FLOW (endless machine-made questions) ═════════════════════

function randomOrder(count: number): number[] {
  const order = identityOrder(count);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Endless stream from the pack's generator settings. Each student's device
// makes its own questions — nothing is stored, matching the old generator
// page. Runs until the room ends (no finish button).
function GeneratedFlow({
  generator,
  session,
}: {
  generator: PackGenerator;
  session: Session;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [seq, setSeq] = useState(1);
  const [question, setQuestion] = useState<PackQuestion>(
    () =>
      generateGraphPackQuestion(
        generator.sections,
        generator.modes,
        1,
      ) as PackQuestion,
  );
  const [optOrder, setOptOrder] = useState<number[]>(() =>
    randomOrder(choiceCount(question)),
  );
  const [record, setRecord] = useState<AnswerRecord | null>(null);

  const answer = (rec: AnswerRecord) => {
    if (record) return;
    session.recordAnswer(rec.ok);
    setRecord(rec);
  };

  const next = () => {
    const n = seq + 1;
    const q = generateGraphPackQuestion(
      generator.sections,
      generator.modes,
      n,
    ) as PackQuestion;
    setSeq(n);
    setQuestion(q);
    setOptOrder(randomOrder(choiceCount(q)));
    setRecord(null);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold tabular-nums">
          {t("question_label")} {seq}
        </span>
        <ScorePill stats={session.stats} />
        {session.stats.streak >= 3 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <Flame className="size-3.5" aria-hidden />
            {session.stats.streak}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.timeLeft !== null && <TimerPill seconds={session.timeLeft} />}
        </div>
      </header>

      <QuestionCard
        key={question.id}
        question={question}
        lang={lang}
        optOrder={optOrder}
        record={record}
        onPick={(displayIndex) => {
          const pick = optOrder[displayIndex];
          answer({ ok: pick === 0, pick });
        }}
        onCheckDrag={(ok, given) => answer({ ok, given })}
      />

      {record && (
        <Button
          onClick={next}
          className="mt-4 h-12 w-full text-base font-semibold"
        >
          {t("next_button")}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}

function ScorePill({ stats }: { stats: QuizStats }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 tabular-nums">
      <Check className="size-3.5" aria-hidden />
      {stats.correct}
      <span className="sr-only">{t("score_label")}</span>
    </span>
  );
}

// One question with options / input + feedback. Shared with preview mode:
// `revealed` renders the correct answer without a student pick.
function QuestionCard({
  question,
  lang,
  optOrder,
  record,
  revealed = false,
  inputValue,
  onInputChange,
  onPick,
  onCheckInput,
  onCheckDrag,
}: {
  question: PackQuestion;
  lang: "kz" | "ru";
  optOrder: number[];
  record: AnswerRecord | null;
  revealed?: boolean;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onPick?: (displayIndex: number) => void;
  onCheckInput?: () => void;
  onCheckDrag?: (ok: boolean, given: string) => void;
}) {
  const t = engineT(lang);
  const answered = record !== null || revealed;
  // Two-step answering: tapping an option only selects it; the Check button
  // below confirms. Guards against misclicks on phones. Callers remount this
  // card per question (key=question.id), which resets the selection.
  const [selected, setSelected] = useState<number | null>(null);
  const graph = question.type === "graph-quadratic" ? question.graph : null;
  // Mode A shows graph thumbnails as options; B & C show a text list. In every
  // mode the correct choice is index 0, matching the grading in QuestionFlow.
  const graphThumbs = graph?.mode === "A" ? [graph.equation, ...graph.distractors] : null;
  let graphTextOptions: ReactNode[] = [];
  if (graph?.mode === "C") {
    graphTextOptions = [graph.equation, ...graph.distractors].map((p, i) => (
      <MathFormula key={i} formula={formatFunc(p)} />
    ));
  } else if (graph?.mode === "B") {
    graphTextOptions = graphPropertyChoices(graph.equation, graph.ask, lang).map(
      (s, i) => <span key={i}>{s}</span>,
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-blue-950/5">
      <div className="text-[17px] font-medium leading-relaxed">
        <MathText text={loc(question.text, lang)} />
      </div>

      {question.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={question.image}
          alt=""
          className="mt-4 max-h-72 w-full rounded-xl border border-border object-contain"
        />
      )}

      {question.geogebra && (
        <GeoGebraFigure figure={question.geogebra} className="mt-4" />
      )}

      {/* Mode A — show the equation, pick its graph. */}
      {graphThumbs && (
        <div className="mt-4">
          <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-5 text-center [background-size:18px_18px]">
            <MathFormula
              formula={formatFunc(graphThumbs[0])}
              className="text-2xl font-medium text-blue-950 sm:text-3xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {optOrder.map((originalIndex, displayIndex) => (
              <GraphOptionTile
                key={originalIndex}
                params={graphThumbs[originalIndex]}
                label={OPTION_LABELS[displayIndex]}
                answered={answered}
                isSelected={!answered && selected === displayIndex}
                showCorrect={answered && originalIndex === 0}
                showWrong={
                  answered && record?.pick === originalIndex && originalIndex !== 0
                }
                onPick={() => setSelected(displayIndex)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modes B & C — show the graph, pick a property (B) or the formula (C). */}
      {graph && (graph.mode === "B" || graph.mode === "C") && (
        <div className="mt-4">
          <div className="mx-auto mb-4 h-60 w-full max-w-sm overflow-hidden rounded-xl border border-border sm:h-72">
            <GraphCanvas params={graph.equation} />
          </div>
          <div className="grid gap-2.5">
            {optOrder.map((originalIndex, displayIndex) => {
              const isCorrect = originalIndex === 0;
              const isPicked = record?.pick === originalIndex;
              const isSel = !answered && selected === displayIndex;
              return (
                <button
                  key={originalIndex}
                  type="button"
                  disabled={answered}
                  onClick={() => setSelected(displayIndex)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border-[1.5px] border-border bg-background px-4 py-3 text-left text-[15px] transition-colors",
                    !answered && "hover:border-primary/50 hover:bg-accent",
                    isSel && "border-primary bg-accent ring-2 ring-primary/15",
                    answered && isCorrect && "border-emerald-500 bg-emerald-50",
                    answered && isPicked && !isCorrect && "border-red-400 bg-red-50",
                    answered && !isCorrect && !isPicked && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-xs font-bold",
                      isSel && "border-primary bg-primary text-white",
                      answered && isCorrect &&
                        "border-emerald-500 bg-emerald-500 text-white",
                      answered && isPicked && !isCorrect &&
                        "border-red-400 bg-red-400 text-white",
                    )}
                  >
                    {OPTION_LABELS[displayIndex]}
                  </span>
                  {graphTextOptions[originalIndex]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode D — show the equation, drag a parabola to match it. */}
      {graph?.mode === "D" && (
        <DragQuestion
          target={graph.equation}
          record={record}
          revealed={revealed}
          onCheckDrag={onCheckDrag}
        />
      )}

      {question.type === "mcq" && question.options && (
        <div className="mt-4 grid gap-2.5">
          {optOrder.map((originalIndex, displayIndex) => {
            const isCorrect = originalIndex === question.correct;
            const isPicked = record?.pick === originalIndex;
            const isSel = !answered && selected === displayIndex;
            return (
              <button
                key={originalIndex}
                type="button"
                disabled={answered}
                onClick={() => setSelected(displayIndex)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-[1.5px] border-border bg-background px-4 py-3 text-left text-[15px] transition-colors",
                  !answered && "hover:border-primary/50 hover:bg-accent",
                  isSel && "border-primary bg-accent ring-2 ring-primary/15",
                  answered && isCorrect && "border-emerald-500 bg-emerald-50",
                  answered &&
                    isPicked &&
                    !isCorrect &&
                    "border-red-400 bg-red-50",
                  answered && !isCorrect && !isPicked && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-xs font-bold",
                    isSel && "border-primary bg-primary text-white",
                    answered && isCorrect &&
                      "border-emerald-500 bg-emerald-500 text-white",
                    answered && isPicked && !isCorrect &&
                      "border-red-400 bg-red-400 text-white",
                  )}
                >
                  {OPTION_LABELS[displayIndex]}
                </span>
                <MathText text={loc(question.options![originalIndex], lang)} />
              </button>
            );
          })}
        </div>
      )}

      {/* confirm bar for choice questions (input & drag have their own) */}
      {!answered &&
        onPick &&
        (Boolean(graphThumbs) ||
          graphTextOptions.length > 0 ||
          (question.type === "mcq" && question.options)) && (
          <Button
            className="mt-4 h-12 w-full text-base font-semibold"
            disabled={selected === null}
            onClick={() => {
              if (selected !== null) onPick(selected);
            }}
          >
            {t("check_button")}
            <Check className="size-4" aria-hidden />
          </Button>
        )}

      {question.type === "input" && (
        <div className="mt-4">
          {answered ? (
            <div
              className={cn(
                "rounded-xl border-[1.5px] px-4 py-3 font-mono text-base",
                revealed || record?.ok
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-red-400 bg-red-50",
              )}
            >
              {revealed ? question.answer : record?.given}
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onCheckInput?.();
              }}
            >
              <Input
                value={inputValue ?? ""}
                onChange={(e) => onInputChange?.(e.target.value)}
                placeholder={t("input_placeholder")}
                autoComplete="off"
                autoCorrect="off"
                className="h-12 flex-1 text-base"
              />
              <Button type="submit" className="h-12 px-5 font-semibold">
                {t("check_button")}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* feedback */}
      {answered && (
        <div className="mt-4">
          {!revealed && (
            <p
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-bold",
                record?.ok
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700",
              )}
            >
              {record?.ok ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <X className="size-4" aria-hidden />
              )}
              {record?.ok ? t("feedback_correct") : t("feedback_wrong")}
            </p>
          )}
          {!revealed && record && !record.ok && question.type !== "graph-quadratic" && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("correct_answer_label")}:{" "}
              <span className="font-semibold text-foreground">
                <MathText
                  text={
                    question.type === "mcq" && question.options
                      ? loc(question.options[question.correct ?? 0], lang)
                      : (question.answer ?? "")
                  }
                />
              </span>
            </p>
          )}
          {question.solution && question.solution.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("solution_label")}
              </p>
              <div className="space-y-1.5 text-sm leading-relaxed">
                {question.solution.map((step, i) => (
                  <p key={i}>
                    <MathText text={loc(step, lang)} />
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// One selectable graph option (mode A): a live GraphCanvas — crisp, pannable,
// zoomable, with numbered axes — inside a pickable tile. A tap picks; a drag
// pans the plot without picking (the guard below tells them apart by how far
// the pointer moved).
function GraphOptionTile({
  params,
  label,
  answered,
  isSelected,
  showCorrect,
  showWrong,
  onPick,
}: {
  params: QuadParams;
  label: string;
  answered: boolean;
  isSelected: boolean;
  showCorrect: boolean;
  showWrong: boolean;
  onPick: () => void;
}) {
  const downAt = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      role="button"
      tabIndex={answered ? -1 : 0}
      aria-label={label}
      aria-pressed={isSelected}
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = downAt.current;
        downAt.current = null;
        if (answered || !start) return;
        // Moved more than a few px → it was a pan, not a pick.
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) onPick();
      }}
      onKeyDown={(e) => {
        if (!answered && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl border-2 bg-white outline-none transition-all focus-visible:ring-3 focus-visible:ring-ring/50",
        !answered && "cursor-pointer hover:border-primary/50",
        showCorrect
          ? "border-emerald-500 ring-4 ring-emerald-500/15"
          : showWrong
            ? "border-red-400 ring-4 ring-red-400/15"
            : isSelected
              ? "border-primary ring-4 ring-primary/15"
              : "border-border",
        answered && !showCorrect && !showWrong && "opacity-55",
      )}
    >
      <span
        className={cn(
          "absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-md text-xs font-bold text-white",
          showCorrect ? "bg-emerald-500" : showWrong ? "bg-red-400" : "bg-primary",
        )}
      >
        {label}
      </span>
      <GraphCanvas params={params} />
    </div>
  );
}

// Mode D: the student drags a parabola to match `target`, then presses Check.
// Manages its own attempt state; reports the graded result up via onCheckDrag.
function DragQuestion({
  target,
  record,
  revealed,
  onCheckDrag,
}: {
  target: QuadParams;
  record: AnswerRecord | null;
  revealed: boolean;
  onCheckDrag?: (ok: boolean, given: string) => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [attempt, setAttempt] = useState<VertexTriple>({ a: 1, m: 0, n: 0 });
  const answered = record !== null || revealed;

  // What the plot shows: preview → the target; answered → the saved attempt;
  // otherwise the live attempt being dragged.
  let shown: VertexTriple = attempt;
  if (revealed) {
    shown = toVertexForm(target);
  } else if (record?.given) {
    try {
      shown = JSON.parse(record.given) as VertexTriple;
    } catch {
      shown = attempt;
    }
  }
  // After a wrong answer, overlay the target so the student sees the right shape.
  const reference = record !== null && !record.ok ? target : undefined;

  return (
    <div className="mt-4">
      <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-4 text-center [background-size:18px_18px]">
        <MathFormula
          formula={formatFunc(target)}
          className="text-xl font-medium text-blue-950 sm:text-2xl"
        />
      </div>
      <DragParabola
        value={shown}
        onChange={answered ? undefined : setAttempt}
        disabled={answered}
        reference={reference}
      />
      {!answered && (
        <>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {lang === "ru"
              ? "Двигайте точки · пустое место — перемещение · два пальца — масштаб"
              : "Нүктелерді жылжытыңыз · бос жер — жылжыту · екі саусақ — үлкейту"}
          </p>
          <Button
            className="mt-3 h-12 w-full text-base font-semibold"
            onClick={() =>
              onCheckDrag?.(gradeDrag(attempt, target), JSON.stringify(attempt))
            }
          >
            {t("check_button")}
          </Button>
        </>
      )}
    </div>
  );
}

function FormulasPanel({
  formulas,
  onClose,
}: {
  formulas: string[];
  onClose: () => void;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-blue-950/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <BookOpen className="size-4 text-primary" aria-hidden />
            {t("formulas_button")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close_button")}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-2.5 text-[15px] leading-relaxed">
          {formulas.map((formula, i) => (
            <p key={i}>
              <MathText text={formula} />
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ DONE / ENDED ═════════════════════════════════════════════════════════

function DoneScreen({
  stats,
  timeLeft,
}: {
  stats: QuizStats;
  timeLeft: number | null;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <CenterFrame>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <h1 className="text-xl font-bold tracking-tight">{t("done_title")}</h1>
        <ScoreSummary stats={stats} />
        <p className="mt-3 text-sm text-muted-foreground">{t("done_desc")}</p>
        {timeLeft !== null && (
          <div className="mt-4 flex justify-center">
            <TimerPill seconds={timeLeft} />
          </div>
        )}
      </div>
    </CenterFrame>
  );
}

function EndedScreen({ stats }: { stats: QuizStats }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const total = stats.correct + stats.wrong;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  return (
    <CenterFrame>
      {pct >= 70 && <Confetti />}
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <h1 className="text-xl font-bold tracking-tight">{t("ended_title")}</h1>
        <ScoreSummary stats={stats} />
        <p className="mt-3 text-sm text-muted-foreground">{t("ended_desc")}</p>
      </div>
    </CenterFrame>
  );
}

// The teacher removed this student. Re-joining is allowed by design (a wrong
// kick shouldn't lock a kid out of the lesson) — the teacher can always kick
// again.
function KickedScreen({ onRejoin }: { onRejoin: () => void }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  return (
    <CenterFrame>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-lg shadow-blue-950/5">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-red-50 text-2xl">
          🚪
        </div>
        <h1 className="text-xl font-bold tracking-tight">
          {t("kicked_title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("kicked_desc")}</p>
        <Button onClick={onRejoin} className="mt-5 w-full font-semibold">
          {t("kicked_rejoin")}
        </Button>
      </div>
    </CenterFrame>
  );
}

function ScoreSummary({ stats }: { stats: QuizStats }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const total = stats.correct + stats.wrong;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t("result_label")}
      </p>
      <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
        {stats.correct}
        <span className="text-xl text-muted-foreground"> / {total}</span>
      </p>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">{pct}%</p>
    </div>
  );
}

// ═══ PREVIEW (admin) ══════════════════════════════════════════════════════

function PreviewMode({ pack }: { pack: QuizPack }) {
  if (pack.generator && pack.questions.length === 0) {
    return <GeneratedPreview generator={pack.generator} pack={pack} />;
  }
  return <ListPreview pack={pack} />;
}

// Preview of a generator quiz: sample questions made on the spot. Generated
// after mount (not during server render) so the server and browser never
// disagree about the random question.
function GeneratedPreview({
  generator,
  pack,
}: {
  generator: PackGenerator;
  pack: QuizPack;
}) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [seq, setSeq] = useState(0);
  const [question, setQuestion] = useState<PackQuestion | null>(null);

  useEffect(() => {
    setQuestion(
      generateGraphPackQuestion(
        generator.sections,
        generator.modes,
        seq + 1,
      ) as PackQuestion,
    );
  }, [generator, seq]);

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded bg-amber-100 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-800">
            {t("preview_badge")}
          </span>
          <h1 className="text-sm font-bold">{loc(pack.title, lang)}</h1>
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </header>

        {question ? (
          <QuestionCard
            key={question.id}
            question={question}
            lang={lang}
            optOrder={identityOrder(choiceCount(question))}
            record={null}
            revealed
          />
        ) : (
          <div className="grid h-60 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
          </div>
        )}

        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => setSeq((n) => n + 1)}
        >
          {lang === "ru" ? "Другой пример" : "Басқа мысал"}
        </Button>
      </div>
    </main>
  );
}

function ListPreview({ pack }: { pack: QuizPack }) {
  const { lang } = useLanguage();
  const t = engineT(lang);
  const [index, setIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(true);
  const total = pack.questions.length;
  const question = pack.questions[index];

  return (
    <main className="quiz-grid-paper min-h-dvh text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded bg-amber-100 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-800">
            {t("preview_badge")}
          </span>
          <h1 className="text-sm font-bold">{loc(pack.title, lang)}</h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAnswers((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {showAnswers ? (
                <EyeOff className="size-3.5" aria-hidden />
              ) : (
                <Eye className="size-3.5" aria-hidden />
              )}
              {showAnswers
                ? t("preview_hide_answers")
                : t("preview_show_answers")}
            </button>
            <LanguageToggle />
          </div>
        </header>

        <QuestionCard
          key={question.id}
          question={question}
          lang={lang}
          optOrder={identityOrder(choiceCount(question))}
          record={null}
          revealed={showAnswers}
        />

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="text-sm font-bold tabular-nums">
            {index + 1} / {total}
          </span>
          <Button
            variant="outline"
            disabled={index >= total - 1}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </main>
  );
}
