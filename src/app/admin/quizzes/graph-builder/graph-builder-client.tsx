"use client";

// Graph-quiz authoring widget (interaction mode A: "pick the graph").
// Set a parabola in vertex or standard form, pick which wrong graphs to offer,
// stack up questions, then download a pack.json — no JSON typed by hand. The
// file goes through the ordinary New Quiz upload, so authored graph questions
// flow through the same engine as MCQ packs.

import { useEffect, useMemo, useState } from "react";
import { Check, Download, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MathFormula } from "@/components/quiz/math-formula";
import { ParabolaThumb } from "@/components/quiz/parabola-thumb";
import { cn } from "@/lib/utils";
import {
  formatFunc,
  suggestDistractors,
  type QuadParams,
} from "@/lib/quiz/quadratic";
import { validatePack } from "@/lib/quiz/pack";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const MAX_DISTRACTORS = 5;

type BuiltQuestion = { equation: QuadParams; distractors: QuadParams[] };

// Parse a school-style number: accepts a decimal comma and a unicode minus.
function num(s: string): number {
  return Number(s.replace(",", ".").replace(/−/g, "-").trim());
}

function keyOf(p: QuadParams): string {
  return JSON.stringify(p);
}

export function GraphBuilderClient() {
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

  // All plausible wrong graphs for this parabola (used as toggle chips).
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

  const canAdd = equation !== null && distractors.length >= 1;

  function addQuestion() {
    if (!equation || distractors.length < 1) return;
    setQuestions((qs) => [...qs, { equation, distractors }]);
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
        graph: {
          mode: "A" as const,
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

  const previewChoices = equation ? [equation, ...distractors] : [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        График тестін құрастыру
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        &quot;Графикті таңдаңыз&quot; түріндегі сұрақтар. Параболаны орнатыңыз,
        қате нұсқаларды таңдаңыз, сұрақ қосыңыз — соңында pack.json жүктеп
        алып, жаңа тест ретінде жүктеңіз.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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

          {/* distractor picker */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-1 flex items-center justify-between">
              <Label>Қате нұсқалар</Label>
              <span className="text-xs text-muted-foreground">
                таңдалды: {distractors.length}/{MAX_DISTRACTORS}
              </span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Оқушыға ұсынылатын қате графиктерді таңдаңыз (кемінде 1).
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
              <>
                <div className="quiz-grid-paper mb-4 rounded-xl border border-primary/15 px-4 py-5 text-center [background-size:18px_18px]">
                  <MathFormula
                    formula={formatFunc(equation)}
                    className="text-2xl font-medium text-blue-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {previewChoices.map((p, i) => (
                    <div
                      key={i}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-xl border-2 bg-white",
                        i === 0
                          ? "border-emerald-500 ring-4 ring-emerald-500/15"
                          : "border-border",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-md text-xs font-bold text-white",
                          i === 0 ? "bg-emerald-500" : "bg-primary",
                        )}
                      >
                        {OPTION_LABELS[i]}
                      </span>
                      <ParabolaThumb params={p} className="size-full" />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Жасыл — дұрыс жауап. Оқушыда нұсқалар араласып шығады.
                </p>
              </>
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
              <p className="text-sm text-muted-foreground">
                Әзірге сұрақ жоқ.
              </p>
            ) : (
              <ul className="space-y-2">
                {questions.map((q, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-white">
                      <ParabolaThumb
                        params={q.equation}
                        className="size-full"
                      />
                    </span>
                    <span className="flex-1 text-sm">
                      <span className="mr-1 font-bold tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <MathFormula formula={formatFunc(q.equation)} />
                      <span className="ml-2 text-xs text-muted-foreground">
                        +{q.distractors.length} қате
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

          {/* export */}
          <div className="rounded-2xl border border-border bg-card p-5">
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
              <Button onClick={downloadPack} disabled={questions.length === 0}>
                <Download className="size-4" />
                pack.json жүктеу
              </Button>
              <Button
                variant="outline"
                onClick={copyPack}
                disabled={questions.length === 0}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Көшірілді" : "JSON көшіру"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Жүктеп алған pack.json файлын «Жаңа тест» бетінде тест дестесі
              (pack) ретінде жүктеңіз.
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
