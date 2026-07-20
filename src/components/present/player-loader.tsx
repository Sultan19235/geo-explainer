"use client";

// Fetches a presentation .js file (uploaded or bundled), runs it through the
// same evaluator the previewer uses, and mounts the fullscreen player. The
// stored file — not the index metadata — is the source of truth: every open
// re-validates it, so a bad upload can only fail loudly, never render junk.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Presentation } from "@/lib/present/types";
import { evaluatePresentationCode } from "@/lib/present/schema";
import { PresentationPlayer } from "./player";

type LoadState =
  | { status: "loading" }
  | { status: "error"; errors: string[] }
  | { status: "ready"; presentation: Presentation };

export function PresentPlayerLoader({
  src,
  backHref,
}: {
  src: string;
  backHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const code = await response.text();
        if (cancelled) return;
        const result = evaluatePresentationCode(code);
        if ("errors" in result) {
          setState({ status: "error", errors: result.errors });
        } else {
          setState({ status: "ready", presentation: result.presentation });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            errors: [e instanceof Error ? e.message : String(e)],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (state.status === "ready") {
    return (
      <PresentationPlayer
        presentation={state.presentation}
        onExit={() => router.push(backHref)}
      />
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#f8f9fb] px-6 text-[#1a1a2e]">
      {state.status === "loading" ? (
        <Loader2 className="size-8 animate-spin text-[#2563eb]" aria-hidden />
      ) : (
        <div className="w-full max-w-lg rounded-xl border-[1.5px] border-red-300 bg-white p-5">
          <p className="font-bold text-red-700">
            Презентацияны ашу мүмкін болмады
          </p>
          <div className="mt-2 space-y-1 font-mono text-xs text-red-700">
            {state.errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
          </div>
          <Link
            href={backHref}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#d8dde5] px-3 py-1.5 text-sm font-semibold text-[#374151] hover:border-[#c5cad3]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Артқа
          </Link>
        </div>
      )}
    </div>
  );
}
