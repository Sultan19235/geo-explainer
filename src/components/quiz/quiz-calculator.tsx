"use client";

// Built-in calculator for the student quiz page — so needing to multiply
// doesn't mean leaving the quiz tab (which the anti-cheat telemetry counts).
// Deliberately basic for grades 5–12: digits, + − × ÷, brackets, √ and x²;
// no scientific keyboard. The panel stays mounted while the quiz runs so the
// expression survives open/close and question changes.
//
// Expressions are evaluated by the tiny recursive-descent parser below —
// never eval(). Decimal comma is displayed (KZ convention) and mapped to a
// dot internally.

import { useState } from "react";
import { Delete, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Safe expression evaluation ─────────────────────────────────────────────

type Tok = { t: "num"; v: number } | { t: "+" | "-" | "*" | "/" | "(" | ")" | "√" | "²" };

function tokenize(source: string): Tok[] | null {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j++;
      const raw = source.slice(i, j);
      if ((raw.match(/\./g) ?? []).length > 1) return null; // "1.2.3"
      const v = Number(raw);
      if (!Number.isFinite(v)) return null;
      tokens.push({ t: "num", v });
      i = j;
      continue;
    }
    if (
      ch === "+" || ch === "-" || ch === "*" || ch === "/" ||
      ch === "(" || ch === ")" || ch === "√" || ch === "²"
    ) {
      tokens.push({ t: ch });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

// expr := term (± term)* · term := unary (×÷ unary | implicit-multiply)* ·
// unary := -unary | postfix · postfix := primary ²* · primary := num | (expr) | √unary
// Exported for tests; the component is the only runtime caller.
export function evaluate(display: string): number | null {
  const source = display
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/,/g, ".");
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  const fail = (): never => {
    throw new Error("bad expression");
  };
  const peek = () => tokens[pos];

  function expr(): number {
    let v = term();
    for (;;) {
      const p = peek();
      if (p?.t === "+") {
        pos++;
        v += term();
      } else if (p?.t === "-") {
        pos++;
        v -= term();
      } else break;
    }
    return v;
  }

  function term(): number {
    let v = unary();
    for (;;) {
      const p = peek();
      if (p?.t === "*") {
        pos++;
        v *= unary();
      } else if (p?.t === "/") {
        pos++;
        v /= unary();
      } else if (p && (p.t === "num" || p.t === "(" || p.t === "√")) {
        v *= unary(); // implicit multiplication: 2(3+1), 3√4
      } else break;
    }
    return v;
  }

  function unary(): number {
    if (peek()?.t === "-") {
      pos++;
      return -unary();
    }
    return postfix();
  }

  function postfix(): number {
    let v = primary();
    while (peek()?.t === "²") {
      pos++;
      v = v * v;
    }
    return v;
  }

  function primary(): number {
    const p = peek();
    if (!p) fail();
    if (p.t === "num") {
      pos++;
      return p.v;
    }
    if (p.t === "(") {
      pos++;
      const v = expr();
      if (peek()?.t !== ")") fail();
      pos++;
      return v;
    }
    if (p.t === "√") {
      pos++;
      const v = unary();
      if (v < 0) fail();
      return Math.sqrt(v);
    }
    return fail();
  }

  try {
    const v = expr();
    if (pos !== tokens.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

// 0.30000000000000004 → "0,3"; huge/tiny values fall back to e-notation.
function formatResult(n: number): string {
  return Number(n.toPrecision(12)).toString().replace(".", ",");
}

// ─── Panel ──────────────────────────────────────────────────────────────────

const MAX_EXPR_LENGTH = 60;

type Key =
  | { label: string; insert: string; kind?: "digit" }
  | { label: string; action: "clear" | "backspace" | "equals" };

const KEYS: Key[] = [
  { label: "C", action: "clear" },
  { label: "( )", insert: "" }, // replaced in render — smart bracket
  { label: "√", insert: "√" },
  { label: "÷", insert: "÷" },
  { label: "7", insert: "7", kind: "digit" },
  { label: "8", insert: "8", kind: "digit" },
  { label: "9", insert: "9", kind: "digit" },
  { label: "×", insert: "×" },
  { label: "4", insert: "4", kind: "digit" },
  { label: "5", insert: "5", kind: "digit" },
  { label: "6", insert: "6", kind: "digit" },
  { label: "−", insert: "−" },
  { label: "1", insert: "1", kind: "digit" },
  { label: "2", insert: "2", kind: "digit" },
  { label: "3", insert: "3", kind: "digit" },
  { label: "+", insert: "+" },
  { label: "x²", insert: "²" },
  { label: "0", insert: "0", kind: "digit" },
  { label: ",", insert: "," },
  { label: "=", action: "equals" },
];

export function CalculatorPanel({
  open,
  title,
  closeLabel,
  onClose,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // A digit after "=" starts a fresh calculation; an operator continues from
  // the result — the way every pocket calculator behaves.
  const insert = (glyph: string, isDigit: boolean) => {
    setError(false);
    if (result !== null) {
      const continued = isDigit || glyph === "√" ? "" : result;
      setResult(null);
      setExpr((continued + glyph).slice(0, MAX_EXPR_LENGTH));
      return;
    }
    setExpr((cur) => (cur + glyph).slice(0, MAX_EXPR_LENGTH));
  };

  // Smart bracket: opens until the brackets balance, then closes.
  const insertBracket = () => {
    const opens = (expr.match(/\(/g) ?? []).length;
    const closes = (expr.match(/\)/g) ?? []).length;
    const last = expr[expr.length - 1];
    const shouldClose =
      opens > closes && last !== undefined && /[0-9),²]/.test(last);
    insert(shouldClose ? ")" : "(", false);
  };

  const equals = () => {
    if (!expr.trim() || result !== null) return;
    const v = evaluate(expr);
    if (v === null) {
      setError(true);
      return;
    }
    setResult(formatResult(v));
  };

  const backspace = () => {
    setError(false);
    if (result !== null) {
      setResult(null);
      return;
    }
    setExpr((cur) => cur.slice(0, -1));
  };

  const clear = () => {
    setExpr("");
    setResult(null);
    setError(false);
  };

  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-blue-950/30 p-4 sm:items-center",
        !open && "hidden",
      )}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={backspace}
              aria-label="⌫"
              className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent"
            >
              <Delete className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* display */}
        <div
          className={cn(
            "mb-3 rounded-xl border border-border bg-background px-3.5 py-2.5 text-right",
            error && "border-red-400 bg-red-50",
          )}
        >
          <div className="min-h-6 break-all font-mono text-base text-muted-foreground">
            {expr || "0"}
          </div>
          <div
            className={cn(
              "min-h-8 break-all font-mono text-2xl font-bold tabular-nums",
              error ? "text-red-600" : "text-foreground",
            )}
          >
            {error ? "⚠︎" : (result ?? "")}
          </div>
        </div>

        {/* keys */}
        <div className="grid grid-cols-4 gap-1.5">
          {KEYS.map((key) => {
            if ("action" in key) {
              return (
                <button
                  key={key.label}
                  type="button"
                  onClick={
                    key.action === "clear"
                      ? clear
                      : key.action === "backspace"
                        ? backspace
                        : equals
                  }
                  className={cn(
                    "h-12 rounded-xl text-lg font-semibold transition-colors",
                    key.action === "equals"
                      ? "bg-primary text-white active:bg-primary/85"
                      : "border-[1.5px] border-border bg-background text-red-600 active:bg-accent",
                  )}
                >
                  {key.label}
                </button>
              );
            }
            const isDigit = key.kind === "digit";
            const isBracket = key.label === "( )";
            return (
              <button
                key={key.label}
                type="button"
                onClick={() =>
                  isBracket ? insertBracket() : insert(key.insert, isDigit)
                }
                className={cn(
                  "h-12 rounded-xl border-[1.5px] border-border text-lg font-semibold transition-colors active:bg-accent",
                  isDigit ? "bg-card text-foreground" : "bg-background text-primary",
                )}
              >
                {key.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
