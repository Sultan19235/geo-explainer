// Sandbox Web Worker for uploaded drill-generator files.
//
// Uploaded code runs HERE, never on the page: no DOM, no network access from
// its scope (reach-out globals are shadowed at evaluation), and problems
// leave as plain JSON via postMessage. If a generator hangs or crashes, the
// page-side wrapper times out and kills the worker — a bad file can't take a
// student's quiz down with it.

import {
  evaluateDrillTopicCode,
  validateDrillTopic,
  validateProblem,
  type EvaluatedTopic,
} from "../topic-schema";
import { mulberry32 } from "../rng";
import type { DrillConfig, DrillProblem } from "../types";

type InMessage =
  | { type: "init"; code: string; validate: boolean }
  | {
      type: "generate";
      id: number;
      seed: number;
      from: number;
      count: number;
      config: DrillConfig | undefined;
    };

let topic: EvaluatedTopic | null = null;

self.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    const evaluated = evaluateDrillTopicCode(msg.code);
    if ("errors" in evaluated) {
      self.postMessage({ type: "init-error", errors: evaluated.errors });
      return;
    }
    if (msg.validate) {
      const errors = validateDrillTopic(evaluated.topic);
      if (errors.length > 0) {
        self.postMessage({ type: "init-error", errors });
        return;
      }
    }
    topic = evaluated.topic;
    self.postMessage({ type: "ready", meta: evaluated.topic.meta });
    return;
  }

  if (msg.type === "generate") {
    if (!topic) {
      self.postMessage({ type: "generate-error", id: msg.id, errors: ["not initialized"] });
      return;
    }
    const problems: DrillProblem[] = [];
    const count = Math.min(Math.max(1, msg.count), 500);
    try {
      for (let i = 0; i < count; i++) {
        const seq = msg.from + i;
        const rng = mulberry32((msg.seed + seq * 2654435761) >>> 0);
        const problem = topic.generate(rng, msg.config ?? defaultsOf(topic));
        // Even a validated file gets each live problem spot-checked — a rare
        // config edge must fail as one skipped problem, not a wrong grade.
        const errs = validateProblem(problem, `problem ${seq}`);
        if (errs.length > 0) throw new Error(errs[0]);
        problems.push(problem);
      }
      self.postMessage({ type: "problems", id: msg.id, problems });
    } catch (e) {
      self.postMessage({
        type: "generate-error",
        id: msg.id,
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }
};

function defaultsOf(t: EvaluatedTopic): DrillConfig {
  const config: DrillConfig = {};
  for (const g of t.meta.options) config[g.id] = [...g.defaults];
  return config;
}
