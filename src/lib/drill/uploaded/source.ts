"use client";

// Page-side handle on an uploaded drill generator running in the sandbox
// worker. Everything is promise-based with hard timeouts: a hung or crashed
// file surfaces as readable errors, never as a stuck screen.

import type { DrillConfig, DrillProblem } from "../types";
import type { UploadedTopicMeta } from "../topic-schema";

const INIT_TIMEOUT_MS = 20_000; // validation harness runs hundreds of generates
const GENERATE_TIMEOUT_MS = 10_000;

export type UploadedDrillLoad =
  | { ok: true; source: UploadedDrillSource; meta: UploadedTopicMeta }
  | { ok: false; errors: string[] };

export class UploadedDrillSource {
  private worker: Worker;
  private nextId = 1;
  readonly meta: UploadedTopicMeta;

  private constructor(worker: Worker, meta: UploadedTopicMeta) {
    this.worker = worker;
    this.meta = meta;
  }

  /** Evaluate `code` in a fresh sandbox worker. `validate: true` also runs
   * the full harness (previewer/admin); the player skips it for speed —
   * the file was validated at upload. */
  static load(code: string, opts: { validate: boolean }): Promise<UploadedDrillLoad> {
    const worker = new Worker(new URL("./drill-worker.ts", import.meta.url), {
      type: "module",
    });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate();
        resolve({
          ok: false,
          errors: ["The file took too long to load — an infinite loop in generate()?"],
        });
      }, INIT_TIMEOUT_MS);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        // One-shot: later "problems" replies belong to generate()'s listeners.
        worker.onmessage = null;
        if (e.data.type === "ready") {
          resolve({
            ok: true,
            source: new UploadedDrillSource(worker, e.data.meta as UploadedTopicMeta),
            meta: e.data.meta as UploadedTopicMeta,
          });
        } else {
          worker.terminate();
          resolve({ ok: false, errors: e.data.errors ?? ["unknown load error"] });
        }
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        worker.terminate();
        resolve({ ok: false, errors: [`The file failed to run: ${e.message}`] });
      };
      worker.postMessage({ type: "init", code, validate: opts.validate });
    });
  }

  /** Problems for sequence numbers [from, from+count) under one seed —
   * plain data, safe to keep and serve synchronously. */
  generate(
    seed: number,
    config: DrillConfig | undefined,
    from: number,
    count: number,
  ): Promise<{ ok: true; problems: DrillProblem[] } | { ok: false; errors: string[] }> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ ok: false, errors: ["generate() timed out"] });
      }, GENERATE_TIMEOUT_MS);
      const onMessage = (e: MessageEvent) => {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        this.worker.removeEventListener("message", onMessage);
        if (e.data.type === "problems") {
          resolve({ ok: true, problems: e.data.problems as DrillProblem[] });
        } else {
          resolve({ ok: false, errors: e.data.errors ?? ["unknown generate error"] });
        }
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.postMessage({ type: "generate", id, seed, from, count, config });
    });
  }

  dispose() {
    this.worker.terminate();
  }
}
