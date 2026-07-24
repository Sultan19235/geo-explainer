"use client";

// Registry-topic drill page: thin binding of the shared DrillLoop to a
// built-in topic — problems come from the topic's sync seeded generator.

import { DrillLoop } from "../drill-loop";
import { getDrillTopic } from "@/lib/drill/registry";
import { mulberry32 } from "@/lib/drill/rng";

export function DrillClient({ topicId }: { topicId: string }) {
  const topic = getDrillTopic(topicId);
  if (!topic) return null;

  return (
    <DrillLoop
      title={topic.title}
      subtitle={topic.subtitle}
      options={topic.options}
      levels={topic.levels}
      backHref="/labs/drill"
      makeProblem={(seq, config, seed) =>
        topic.generate(mulberry32((seed + seq * 2654435761) >>> 0), config)
      }
    />
  );
}
