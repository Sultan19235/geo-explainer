"use client";

// Graph-quiz authoring widget. Set a parabola, choose the interaction mode,
// stack up questions, then download a pack.json — no JSON typed by hand. The
// file goes through the ordinary New Quiz upload, so authored graph questions
// flow through the same engine as MCQ packs.
//
//   A — show the equation, student picks its graph
//   B — show the graph, student picks a property (vertex/axis/direction/y-int)
//   C — show the graph, student picks the equation

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Download, Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MathFormula } from "@/components/quiz/math-formula";
import { ParabolaThumb } from "@/components/quiz/parabola-thumb";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  formatFunc,
  graphPropertyChoices,
  suggestDistractors,
  type GraphAsk,
  type QuadParams,
} from "@/lib/quiz/quadratic";
import { validatePack } from "@/lib/quiz/pack";
import { createGraphQuizAction } from "../actions";
import { type TopicOption } from "../quiz-form";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const MAX_DISTRACTORS = 5;

type GraphMode = "A" | "B" | "C" | "D";

const MODE_TABS: { mode: GraphMode; label: string }[] = [
  { mode: "A", label: "Формула → график" },
  { mode: "B", label: "График → қасиет" },
  { mode: "C", label: "График → формула" },
  { mode: "D", label: "Теңдеу → сызу" },
];

const ASK_TABS: { ask: GraphAsk; label: string }[] = [
  { ask: "vertex", label: "Төбесі" },
  { ask: "axis", label: "Симметрия осі" },
  { ask: "direction", label: "Бағыты" },
  { ask: "yIntercept", label: "Oy қиюы" },
];

type BuiltQuestion =
  | { mode: "A" | "C"; equation: QuadParams; distractors: QuadParams[] }
  | { mode: "B"; equation: QuadParams; ask: GraphAsk }
  | { mode: "D"; equation: QuadParams };

// Parse a school-style number: accepts a decimal comma and a unicode minus.
function num(s: string): number {
  return Number(s.replace(",", ".").replace(/−/g, "-").trim());
}

function keyOf(p: QuadParams): string {
  return JSON.stringify(p);
}

export function GraphBuilderClient({ topics }: { topics: TopicOption[] }) {
  const { lang } = useT();
  const [mode, setMode] = useState<GraphMode>("A");
  const [topicId, setTopicId] = useState("");
  const [isSaving, startSave] = useTransition();
  const [ask, setAsk] = useState<GraphAsk>("vertex");
  const [formType, setFormType] = useState<"vertex" | "standard">("vertex");
  const [fields, setFields] = useState({
    a: "1",
    m: "0",
    n: "0",
    b: "0",
    c: "0",
  });
  const [distractors, setDistractors] = useState<QuadParams[]>([]);
  const [questions, setQuestions] = useState<BuiltQuestion[]>([]);
  const [titleKz, setTitleKz] = useState("");
  const [titleRu, setTitleRu] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const usesDistractors = mode === "A" || mode === "C";

  const setField = (name: keyof typeof fields, value: string) =>
    setFields((f) => ({ ...f, [name]: value }));

  // The parabola currently described by the form, or null if invalid (a = 0
  // or a blank field).
  const equation = useMemo<QuadParams | null>(() => {
    const a = num(fields.a);
    if (!Number.isFinite(a) || a === 0) return null;
    if (formType === "vertex") {
      const m = num(fields.m);
      const n = num(fields.n);
      if (!Number.isFinite(m) || !Number.isFinite(n)) return null;
      return { mode: "vertex", a, m, n };
    }
    const b = num(fields.b);
    const cFull = num(fields.c);
    if (!Number.isFinite(b) || !Number.isFinite(cFull)) return null;
    return { mode: "standard", a, b, cFull };
  }, [formType, fields]);

  const equationKey = equation ? keyOf(equation) : "";

  // All plausible wrong graphs for this parabola (toggle chips, modes A & C).
  const suggestions = useMemo(
    () => (equation ? suggestDistractors(equation, 6) : []),
    [equation],
  );

  // When the parabola changes, reset the selection to the first three
  // suggestions so there's always a sensible default.
  useEffect(() => {
    setDistractors(equation ? suggestDistractors(equation, 3) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equationKey]);

  const selectedKeys = useMemo(
    () => new Set(distractors.map(keyOf)),
    [distractors],
  );

  function toggleDistractor(p: QuadParams) {
    const k = keyOf(p);
    setDistractors((cur) => {
      if (cur.some((d) => keyOf(d) === k)) {
        return cur.filter((d) => keyOf(d) !== k);
      }
      if (cur.length >= MAX_DISTRACTORS) return cur;
      return [...cur, p];
    });
  }

  const canAdd =
    equation !== null && (!usesDistractors || distractors.length >= 1);

  function addQuestion() {
    if (!equation) return;
    if (usesDistractors) {
      if (distractors.length < 1) return;
      setQuestions((qs) => [...qs, { mode, equation, distractors }]);
    } else if (mode === "B") {
      setQuestions((qs) => [...qs, { mode: "B", equation, ask }]);
    } else {
      setQuestions((qs) => [...qs, { mode: "D", equation }]);
    }
    setError(null);
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  function buildPack() {
    const title = titleRu.trim()
      ? { kz: titleKz.trim() || "Графиктік тест", ru: titleRu.trim() }
      : titleKz.trim() || "Графиктік тест";
    return {
      version: 1 as const,
      title,
      questions: questions.map((q, i) => ({
        id: `g${i + 1}`,
        type: "graph-quadratic" as const,
        graph:
          q.mode === "B"
            ? { mode: "B" as const, equation: q.equation, ask: q.ask }
            : q.mode === "D"
              ? { mode: "D" as const, equation: q.equation }
              : {
                  mode: q.mode,
                  equation: q.equation,
                  distractors: q.distractors,
                },
      })),
    };
  }

  // Validate through the real engine validator before handing over a file, so
  // the author never downloads a pack the upload will reject.
  function validatedJson(): string | null {
    if (questions.length === 0) {
      setError("Кемінде бір сұрақ қосыңыз.");
      return null;
    }
    const pack = buildPack();
    const { errors } = validatePack(pack);
    if (errors.length > 0) {
      setError(errors.join("\n"));
      return null;
    }
    setError(null);
    return JSON.stringify(pack, null, 2);
  }

  function downloadPack() {
    const json = validatedJson();
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pack.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyPack() {
    const json = validatedJson();
    if (!json) return;
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // One-click: validate, create the quiz row, upload the pack, go to the list.
  function saveToQuiz() {
    if (!topicId) {
      setError("Тақырыпты таңдаңыз.");
      return;
    }
    if (!titleKz.trim()) {
      setError("Қазақша атауды жазыңыз.");
      return;
    }
    const json = validatedJson();
    if (!json) return;
    startSave(async () => {
      try {
        await createGraphQuizAction({
          topic_id: topicId,
          title_kz: titleKz.trim(),
          title_ru: titleRu.trim() || null,
          pack_json: json,
        });
      } catch (e) {
        if (e instanceof Error) {
          if (e.message === "NEXT_REDIRECT") throw e;
          setError(e.message);
        } else {
          setError("Белгісіз қате.");
        }
      }
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        График тестін құрастыру
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Параболаны орнатып, сұрақ түрін таңдаңыз. Соңында pack.json жүктеп
        алып, «Жаңа тест» бетінде тест дестесі ретінде жүктеңіз.
      </p>

      {/* mode selector */}
      <div className="mt-5 flex flex-wrap gap-2">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            onClick={() => setMode(tab.mode)}
            className={cn(
              "rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
              mode === tab.mode
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {/* ── EDITOR ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex gap-2">
              {(["vertex", "standard"] as const).map((ft) => (
                <button
                  key={ft}
                  type="button"
                  onClick={() => setFormType(ft)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                    formType === ft
                      ? "border-primary bg-accent text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {ft === "vertex" ? (
                    <MathFormula formula="y = a(x − m)^2 + n" />
                  ) : (
                    <MathFormula formula="y = ax^2 + bx + c" />
                  )}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="a"
                value={fields.a}
                onChange={(v) => setField("a", v)}
                invalid={num(fields.a) === 0 || !Number.isFinite(num(fields.a))}
              />
              {formType === "vertex" ? (
                <>
                  <NumberField
                    label="m"
                    value={fields.m}
                    onChange={(v) => setField("m", v)}
                  />
                  <NumberField
                    label="n"
                    value={fields.n}
                    onChange={(v) => setField("n", v)}
                  />
                </>
              ) : (
                <>
                  <NumberField
                    label="b"
                    value={fields.b}
                    onChange={(v) => setField("b", v)}
                  />
                  <NumberField
                    label="c"
                    value={fields.c}
                    onChange={(v) => setField("c", v)}
                  />
                </>
              )}
            </div>
            {num(fields.a) === 0 && (
              <p className="mt-2 text-xs font-medium text-red-600">
                a ≠ 0 болуы керек (әйтпесе бұл парабола емес).
              </p>
            )}
          </div>

          {/* mode-specific controls */}
          {usesDistractors ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-1 flex items-center justify-between">
                <Label>Қате нұсқалар</Label>
                <span className="text-xs text-muted-foreground">
                  таңдалды: {distractors.length}/{MAX_DISTRACTORS}
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {mode === "C"
                  ? "Қате формулалар (графиктер) ретінде ұсынылатын нұсқалар (кемінде 1)."
                  : "Оқушыға ұсынылатын қате графиктерді таңдаңыз (кемінде 1)."}
              </p>
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Алдымен дұрыс параболаны орнатыңыз.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {suggestions.map((s) => {
                    const active = selectedKeys.has(keyOf(s));
                    return (
                      <button
                        key={keyOf(s)}
                        type="button"
                        onClick={() => toggleDistractor(s)}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-lg border-2 bg-white transition-all",
                          active
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border opacity-70 hover:opacity-100",
                        )}
                      >
                        {active && (
                          <span className="absolute right-1 top-1 z-10 grid size-4 place-items-center rounded bg-primary text-white">
                            <Check className="size-3" />
                          </span>
                        )}
                        <ParabolaThumb params={s} className="size-full" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : mode === "B" ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <Label>Қандай қасиет сұралады?</Label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {ASK_TABS.map((tab) => (
                  <button
                    key={tab.ask}
                    type="button"
                    onClick={() => setAsk(tab.ask)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                      ask === tab.ask
                        ? "border-primary bg-accent text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Дұрыс жауап пен қате нұсқалар автоматты құрылады.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5">
              <Label>Сүйреп салу</Label>
              <p className="mt-2 text-xs text-muted-foreground">
                Оқушы осы теңдеуге сәйкес параболаны төбесі мен нүктесін
                жылжытып салады. Дұрыс жауап — теңдеудің өзі. Бүтін a, m, n
                мәндерін қолданыңыз (жарты қадаммен a да болады).
              </p>
            </div>
          )}

          <Button
            onClick={addQuestion}
            disabled={!canAdd}
            className="w-full"
            size="lg"
          >
            <Plus className="size-4" />
            Сұрақты қосу
          </Button>
        </div>

        {/* ── PREVIEW + LIST ─────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Оқушы көрінісі (алдын ала)
            </p>
            {equation ? (
              <StudentPreview
                mode={mode}
                ask={ask}
                equation={equation}
                distractors={distractors}
                lang={lang}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Параболаны орнатқанда осы жерде көрінеді.
              </p>
            )}
          </div>

          {/* built questions */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-sm font-bold">
              Сұрақтар ({questions.length})
            </p>
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Әзірге сұрақ жоқ.</p>
            ) : (
              <ul className="space-y-2">
                {questions.map((q, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white">
                      <ParabolaThumb params={q.equation} className="size-full" />
                    </span>
                    <span className="flex-1 text-sm">
                      <span className="mr-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {q.mode}
                      </span>
                      <MathFormula formula={formatFunc(q.equation)} />
                      <span className="ml-2 text-xs text-muted-foreground">
                        {q.mode === "B"
                          ? ASK_TABS.find((a) => a.ask === q.ask)?.label
                          : q.mode === "D"
                            ? "сүйреп салу"
                            : `+${q.distractors.length} қате`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeQuestion(i)}
                      aria-label="Өшіру"
                      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* save / export */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 space-y-1.5">
              <Label htmlFor="topic_id">Тақырып</Label>
              <select
                id="topic_id"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="" disabled>
                  Тақырыпты таңдаңыз
                </option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.grade}-сынып —{" "}
                    {lang === "ru"
                      ? topic.name_ru ?? topic.name_kz
                      : topic.name_kz}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title_kz">Тест атауы (қазақша)</Label>
                <Input
                  id="title_kz"
                  value={titleKz}
                  onChange={(e) => setTitleKz(e.target.value)}
                  placeholder="Графиктік тест"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title_ru">Название (рус)</Label>
                <Input
                  id="title_ru"
                  value={titleRu}
                  onChange={(e) => setTitleRu(e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={saveToQuiz}
                disabled={questions.length === 0 || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Тестке сақтау
              </Button>
              <Button
                variant="outline"
                onClick={downloadPack}
                disabled={questions.length === 0}
              >
                <Download className="size-4" />
                pack.json
              </Button>
              <Button
                variant="outline"
                onClick={copyPack}
                disabled={questions.length === 0}
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? "Көшірілді" : "JSON көшіру"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              «Тестке сақтау» — жаңа тест бірден құрылады. Немесе pack.json
              жүктеп алып, «Жаңа тест» бетінде қолмен жүктеңіз.
            </p>
            {error && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentPreview({
  mode,
  ask,
  equation,
  distractors,
  lang,
}: {
  mode: GraphMode;
  ask: GraphAsk;
  equation: QuadParams;
  distractors: QuadParams[];
  lang: "kz" | "ru";
}) {
  // Mode A: equation stem + graph options.
  if (mode === "A") {
    const choices = [equation, ...distractors];
    return (
      <>
        <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-5 text-center [background-size:18px_18px]">
          <MathFormula
            formula={formatFunc(equation)}
            className="text-2xl font-medium text-blue-950"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {choices.map((p, i) => (
            <OptionTileGraph key={i} params={p} index={i} correct={i === 0} />
          ))}
        </div>
        <PreviewNote />
      </>
    );
  }

  // Mode D: equation stem + the target shape (what a correct build looks like).
  if (mode === "D") {
    return (
      <>
        <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-5 text-center [background-size:18px_18px]">
          <MathFormula
            formula={formatFunc(equation)}
            className="text-2xl font-medium text-blue-950"
          />
        </div>
        <div className="mx-auto mb-3 aspect-square w-full max-w-[220px] overflow-hidden rounded-xl border border-emerald-500 bg-white">
          <ParabolaThumb params={equation} window={7} className="size-full" />
        </div>
        <p className="text-xs text-muted-foreground">
          Оқушы параболаны осы теңдеуге сәйкес сүйреп салады (дұрыс форма —
          жоғарыда).
        </p>
      </>
    );
  }

  // Modes B & C: graph stem + text options.
  const textChoices =
    mode === "C"
      ? [equation, ...distractors].map((p) => formatFunc(p))
      : graphPropertyChoices(equation, ask, lang);

  return (
    <>
      <div className="mx-auto mb-4 aspect-square w-full max-w-[220px] overflow-hidden rounded-xl border border-border bg-white">
        <ParabolaThumb params={equation} window={7} className="size-full" />
      </div>
      <div className="grid gap-2.5">
        {textChoices.map((label, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 text-[15px]",
              i === 0
                ? "border-emerald-500 bg-emerald-50"
                : "border-border bg-background",
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-bold",
                i === 0
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-border bg-card",
              )}
            >
              {OPTION_LABELS[i]}
            </span>
            {mode === "C" ? <MathFormula formula={label} /> : <span>{label}</span>}
          </div>
        ))}
      </div>
      <PreviewNote />
    </>
  );
}

function OptionTileGraph({
  params,
  index,
  correct,
}: {
  params: QuadParams;
  index: number;
  correct: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl border-2 bg-white",
        correct ? "border-emerald-500 ring-4 ring-emerald-500/15" : "border-border",
      )}
    >
      <span
        className={cn(
          "absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-md text-xs font-bold text-white",
          correct ? "bg-emerald-500" : "bg-primary",
        )}
      >
        {OPTION_LABELS[index]}
      </span>
      <ParabolaThumb params={params} className="size-full" />
    </div>
  );
}

function PreviewNote() {
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Жасыл — дұрыс жауап. Оқушыда нұсқалар араласып шығады.
    </p>
  );
}

function NumberField({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-math text-base italic">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        className={cn("text-center", invalid && "border-red-400")}
      />
    </div>
  );
}
