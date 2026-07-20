"use client";

// Presentation-file previewer — the author's test bench, mirroring the drill
// previewer at /labs/drill/file. Paste (or pick) a presentation .js file:
// it is evaluated + validated on the spot; errors come back as readable
// English lines to paste into an AI chat, success drops straight into the
// fullscreen classroom player. Nothing is uploaded from here.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenText, FileCode2, Loader2, Play } from "lucide-react";
import type { Presentation } from "@/lib/present/types";
import { evaluatePresentationCode } from "@/lib/present/schema";
import { PresentationPlayer } from "@/components/present/player";

const DEMO_URL = "/present/demo-5-1-1.js";

export function PresentClient() {
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [presentation, setPresentation] = useState<Presentation | null>(null);

  const check = (source: string) => {
    setErrors([]);
    const result = evaluatePresentationCode(source);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setPresentation(result.presentation);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCode(await file.text());
  };

  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      const response = await fetch(DEMO_URL);
      const text = await response.text();
      setCode(text);
      check(text);
    } finally {
      setLoadingDemo(false);
    }
  };

  if (presentation) {
    return (
      <PresentationPlayer
        presentation={presentation}
        onExit={() => setPresentation(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] px-6 py-10 text-[#1a1a2e]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/labs/present"
            className="grid size-8 place-items-center rounded-lg border border-[#d8dde5] bg-white text-[#6b7280]"
            aria-label="←"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Презентация previewer</h1>
            <p className="text-sm text-[#6b7280]">
              Презентация .js файлын тексеру және көрсету (labs) · формат:
              docs/PRESENTATION_FORMAT.md
            </p>
          </div>
        </div>

        <div className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-[#d8dde5] px-3 py-1.5 text-sm font-semibold text-[#2245c3] hover:bg-blue-50">
              <FileCode2 className="size-4" aria-hidden />
              .js файл таңдау
              <input
                type="file"
                accept=".js,text/javascript"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              onClick={() => void loadDemo()}
              disabled={loadingDemo}
              className="flex items-center gap-2 rounded-lg border border-[#d8dde5] px-3 py-1.5 text-sm font-semibold text-[#059669] hover:bg-emerald-50 disabled:opacity-50"
            >
              {loadingDemo ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <BookOpenText className="size-4" aria-hidden />
              )}
              Демо: 1.1 Натурал сандар және нөл
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            placeholder={`registerPresentation({\n  apiVersion: 1,\n  id: "5.1.1-natural-sandar",\n  title: { kz: "...", ru: "..." },\n  slides: [ ... ],\n});`}
            className="h-72 w-full resize-y rounded-lg border border-[#d8dde5] bg-[#f8f9fb] p-3 font-mono text-xs leading-relaxed outline-none focus:border-[#2563eb]"
          />

          {errors.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700">
              <p className="font-bold">Validation failed:</p>
              {errors.map((e, i) => (
                <p key={i} className="font-mono">
                  {e}
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => check(code)}
            disabled={code.trim().length === 0}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2245c3] text-sm font-bold text-white disabled:opacity-50"
          >
            <Play className="size-4" aria-hidden />
            Тексеру және көрсету
          </button>
        </div>
      </div>
    </div>
  );
}
