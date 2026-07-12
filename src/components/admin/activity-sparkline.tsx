"use client";

// Tiny inline activity sparkline for the admin analytics pages: one bar per
// day, oldest → newest, with the newest (today) bar in the accent color and
// past days in a de-emphasis hue. Purely presentational — the server buckets
// events into DailyActivityPoint[] (Asia/Almaty days) so SSR and the client
// always agree on day boundaries.

import { formatDayLabel } from "@/lib/analytics/format";
import { useT } from "@/lib/i18n/context";
import type { DailyActivityPoint } from "@/lib/analytics/types";

const BAR_WIDTH = 6;
const BAR_GAP = 2;
const HEIGHT = 26;
// Days with zero events still get a stub so the timeline keeps its rhythm and
// gaps read as "quiet day", not "missing data".
const STUB_HEIGHT = 2;

const PAST_FILL = "#94a3b8"; // slate-400 — visible against white, still quieter than today
const TODAY_FILL = "#2563eb"; // blue-600 — accent, matches admin link color

export function ActivitySparkline({
  points,
  className,
}: {
  points: DailyActivityPoint[];
  className?: string;
}) {
  const { t, lang } = useT();

  if (points.length === 0) return null;

  const max = Math.max(1, ...points.map((p) => p.count));
  const width = points.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
  const total = points.reduce((sum, p) => sum + p.count, 0);

  return (
    <svg
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={t("ua_sparkline_aria")(points.length, total)}
      className={className}
    >
      {points.map((p, i) => {
        const h =
          p.count === 0
            ? STUB_HEIGHT
            : Math.max(STUB_HEIGHT + 1, Math.round((p.count / max) * HEIGHT));
        const isToday = i === points.length - 1;
        return (
          <rect
            key={p.day}
            x={i * (BAR_WIDTH + BAR_GAP)}
            y={HEIGHT - h}
            width={BAR_WIDTH}
            height={h}
            rx={1}
            fill={isToday ? TODAY_FILL : PAST_FILL}
          >
            <title>{`${formatDayLabel(p.day, lang)} · ${p.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
