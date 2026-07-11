"use client";

// Client-side loader for lesson content files. Files register themselves via
// the runtime's global registerLessonProblem/registerLessonTheory, so loads
// are serialized through one queue; resolved definitions are cached by URL —
// switching back to an already-seen problem is instant, and preload() warms
// the next problem while the teacher works on the current one.

import type { LessonProblemDef, LessonTheoryDef } from "./file-format";

type LessonRuntimeGlobal = {
  version: number;
  // Default GGB app font size; the player multiplies it by --lesson-scale.
  baseFontSize: number;
  // Re-applies the app font size on a live applet (see lesson-runtime.js).
  setFontSize(api: unknown, size?: number, hidePlate?: boolean): void;
  createToolkit(api: unknown): Record<string, unknown>;
  capture(
    onProblem: ((def: LessonProblemDef) => void) | null,
    onTheory: ((def: LessonTheoryDef) => void) | null,
  ): void;
};

declare global {
  interface Window {
    LessonRuntime?: LessonRuntimeGlobal;
  }
}

const RUNTIME_URL = "/lesson-runtime.js";

let runtimePromise: Promise<LessonRuntimeGlobal> | null = null;

export function loadLessonRuntime(): Promise<LessonRuntimeGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("lesson runtime is browser-only"));
  }
  if (window.LessonRuntime) return Promise.resolve(window.LessonRuntime);
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RUNTIME_URL;
    script.async = true;
    script.onload = () => {
      if (window.LessonRuntime) resolve(window.LessonRuntime);
      else reject(new Error("lesson runtime failed to initialize"));
    };
    script.onerror = () => {
      runtimePromise = null;
      script.remove();
      reject(new Error("failed to load lesson runtime"));
    };
    document.head.appendChild(script);
  });
  return runtimePromise;
}

export type LoadedLessonFile =
  | { kind: "problem"; def: LessonProblemDef }
  | { kind: "theory"; def: LessonTheoryDef };

const cache = new Map<string, Promise<LoadedLessonFile>>();
// Registration lands on a global, so only one file may be in flight at once.
let queue: Promise<unknown> = Promise.resolve();

export function loadLessonFile(url: string): Promise<LoadedLessonFile> {
  const cached = cache.get(url);
  if (cached) return cached;

  const promise = new Promise<LoadedLessonFile>((resolve, reject) => {
    queue = queue
      .catch(() => {})
      .then(async () => {
        const runtime = await loadLessonRuntime();
        await new Promise<void>((done, fail) => {
          let settled = false;
          const finish = (result?: LoadedLessonFile, error?: Error) => {
            if (settled) return;
            settled = true;
            runtime.capture(null, null);
            window.clearTimeout(timer);
            script.remove();
            if (result) resolve(result);
            else reject(error ?? new Error("lesson file did not register"));
            done();
          };
          runtime.capture(
            (def) => finish({ kind: "problem", def }),
            (def) => finish({ kind: "theory", def }),
          );
          const script = document.createElement("script");
          script.src = url;
          script.async = true;
          script.onerror = () => {
            cache.delete(url);
            finish(undefined, new Error(`failed to load ${url}`));
          };
          // A file that loads but never registers must not wedge the queue.
          const timer = window.setTimeout(() => {
            cache.delete(url);
            finish(undefined, new Error("lesson file did not register in time"));
          }, 15000);
          document.head.appendChild(script);
          void fail;
        });
      });
  });

  cache.set(url, promise);
  return promise;
}

export function preloadLessonFile(url: string): void {
  loadLessonFile(url).catch(() => {
    // Preloads are best-effort; the real load will surface the error.
  });
}
