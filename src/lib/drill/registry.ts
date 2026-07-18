// Drill topic registry — the one place a new topic gets plugged in.
// Adding a topic = write src/lib/drill/topics/<name>.ts, import it here.

import type { DrillTopic } from "./types";
import { radianDegreeTopic } from "./topics/radian-degree";
import { decimalAddTopic } from "./topics/decimal-add";
import { logarithmTopic } from "./topics/logarithm";
import { powersTopic } from "./topics/powers";
import { trigValuesTopic } from "./topics/trig-values";

export const DRILL_TOPICS: DrillTopic[] = [
  radianDegreeTopic,
  decimalAddTopic,
  logarithmTopic,
  powersTopic,
  trigValuesTopic,
];

export function getDrillTopic(id: string): DrillTopic | undefined {
  return DRILL_TOPICS.find((t) => t.id === id);
}
