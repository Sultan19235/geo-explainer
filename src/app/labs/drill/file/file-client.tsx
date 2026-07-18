"use client";

// Generator-file previewer — the author's test bench. Paste (or pick) a
// drill .js file: the sandbox worker evaluates it and runs the full
// validation harness; errors come back as readable English lines to paste
// into an AI chat, success drops straight into the standard drill loop
// powered by worker-generated problem batches. Nothing is uploaded from
// here — publishing happens in /admin/quizzes.

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileCode2, Loader2, Play } from "lucide-react";
import { DrillLoop } from "../drill-loop";
import type { DrillConfig, DrillProblem } from "@/lib/drill/types";
import type { UploadedTopicMeta } from "@/lib/drill/topic-schema";
import { UploadedDrillSource } from "@/lib/drill/uploaded/source";

const BATCH_SIZE = 200;

export function FileDrillClient() {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<{
    source: UploadedDrillSource;
    meta: UploadedTopicMeta;
  } | null>(null);
  const batchRef = useRef<DrillProblem[]>([]);

  const check = async () => {
    setChecking(true);
    setErrors([]);
    loaded?.source.dispose();
    setLoaded(null);
    const result = await UploadedDrillSource.load(code, { validate: true });
    setChecking(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setLoaded({ source: result.source, meta: result.meta });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCode(await file.text());
  };

  if (loaded) {
    return (
      <DrillLoop
        title={loaded.meta.title}
        subtitle={loaded.meta.subtitle}
        options={loaded.meta.options}
        backHref="/labs/drill/file"
        prepare={async (config: DrillConfig, seed: number) => {
          const result = await loaded.source.generate(seed, config, 1, BATCH_SIZE);
          if (!result.ok) return result.errors;
          batchRef.current = result.problems;
          return null;
        }}
        makeProblem={(seq) =>
          batchRef.current[(seq - 1) % batchRef.current.length]
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] px-6 py-10 text-[#1a1a2e]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/labs/drill"
            className="grid size-8 place-items-center rounded-lg border border-[#d8dde5] bg-white text-[#6b7280]"
            aria-label="←"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Generator file previewer</h1>
            <p className="text-sm text-[#6b7280]">
              Drill .js файлын тексеру және ойнату (labs) · формат:
              docs/DRILL_GENERATOR_FORMAT.md
            </p>
          </div>
        </div>

        <div className="rounded-xl border-[1.5px] border-[#d8dde5] bg-white p-4">
          <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-[#d8dde5] px-3 py-1.5 text-sm font-semibold text-[#2245c3] hover:bg-blue-50">
            <FileCode2 className="size-4" aria-hidden />
            .js файл таңдау
            <input
              type="file"
              accept=".js,text/javascript"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            placeholder={`registerDrillTopic({\n  apiVersion: 1,\n  id: "my-topic",\n  ...\n});`}
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
            onClick={() => void check()}
            disabled={checking || code.trim().length === 0}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2245c3] text-sm font-bold text-white disabled:opacity-50"
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            Тексеру және іске қосу
          </button>
        </div>
      </div>
    </div>
  );
}
