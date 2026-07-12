"use client";

// Full-size daily-activity bar chart for the admin teacher-detail page (the
// tiny ActivitySparkline stays for table rows). One bar per Almaty day,
// oldest → today, with quiet gridlines, date labels, a hover tooltip and the
// peak day direct-labeled — sized to be read, not squinted at.

import { useMemo, useRef, useState } from "react";
import { formatDayLabel, formatDayShort } from "@/lib/analytics/format";
import { useT } from "@/lib/i18n/context";
import type { DailyActivityPoint } from "@/lib/analytics/types";

const PLOT_HEIGHT = 120;
const LABEL_HEIGHT = 20;
const BAR_GAP = 3;
const STUB_HEIGHT = 2; // zero days keep a stub so gaps read as "quiet", not "missing"

const BAR_FILL = "#3b82f6"; // blue-500 — the one series hue
const BAR_FILL_HOVER = "#1d4ed8"; // blue-700
const STUB_FILL = "#cbd5e1"; // slate-300 — neutral, clearly "no data that day"
const GRID_STROKE = "#e2e8f0"; // slate-200 — recessive

export function ActivityBarChart({
  points,
  className,
}: {
  points: DailyActivityPoint[];
  className?: string;
}) {
  const { t, lang } = useT();
  const [hovered, setHovered] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = useMemo(
    () => points.reduce((sum, p) => sum + p.count, 0),
    [points],
  );

  if (points.length === 0) return null;

  const max = Math.max(1, ...points.map((p) => p.count));
  const peakIndex = points.findIndex((p) => p.count === max);

  const barWidth = 13;
  const width = points.length * (barWidth + BAR_GAP) - BAR_GAP;
  const height = PLOT_HEIGHT + LABEL_HEIGHT;

  const barHeight = (count: number) =>
    count === 0
      ? STUB_HEIGHT
      : Math.max(STUB_HEIGHT + 2, Math.round((count / max) * (PLOT_HEIGHT - 16)));

  // Ticks every 7 days ending on today, so "today" always carries a label.
  const tickEvery = 7;
  const hasTick = (i: number) => (points.length - 1 - i) % tickEvery === 0;

  const gridLevels = max >= 4 ? [0.5, 1] : [1];

  const hoveredPoint = hovered === null ? null : points[hovered];

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("ua_activity_30d")}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("ua_chart_total")(total)}
        </div>
      </div>
      <div ref={containerRef} className="relative overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("ua_sparkline_aria")(points.length, total)}
          className="block"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Recessive gridlines with their value hugging the top line */}
          {gridLevels.map((level) => {
            const y = PLOT_HEIGHT - Math.round(level * (PLOT_HEIGHT - 16));
            return (
              <g key={level}>
                <line
                  x1={0}
                  x2={width}
                  y1={y}
                  y2={y}
                  stroke={GRID_STROKE}
                  strokeWidth={1}
                />
                <text
                  x={width}
                  y={y - 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={9}
                >
                  {Math.round(level * max)}
                </text>
              </g>
            );
          })}
          <line
            x1={0}
            x2={width}
            y1={PLOT_HEIGHT}
            y2={PLOT_HEIGHT}
            stroke={GRID_STROKE}
            strokeWidth={1}
          />

          {points.map((p, i) => {
            const h = barHeight(p.count);
            const x = i * (barWidth + BAR_GAP);
            return (
              <g key={p.day}>
                {/* Hit target wider than the bar itself */}
                <rect
                  x={x - BAR_GAP / 2}
                  y={0}
                  width={barWidth + BAR_GAP}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                />
                <rect
                  x={x}
                  y={PLOT_HEIGHT - h}
                  width={barWidth}
                  height={h}
                  rx={2}
                  className="pointer-events-none"
                  fill={
                    p.count === 0
                      ? STUB_FILL
                      : hovered === i
                        ? BAR_FILL_HOVER
                        : BAR_FILL
                  }
                />
                {/* Direct label on the peak day only */}
                {i === peakIndex && p.count > 0 && hovered !== i && (
                  <text
                    x={x + barWidth / 2}
                    y={PLOT_HEIGHT - h - 4}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground"
                    fontSize={10}
                    fontWeight={600}
                  >
                    {p.count}
                  </text>
                )}
                {hasTick(i) && (
                  <text
                    // Edge ticks anchor inward so their labels never clip.
                    x={
                      i === points.length - 1
                        ? x + barWidth
                        : Math.max(x + barWidth / 2, 14)
                    }
                    y={height - 6}
                    textAnchor={i === points.length - 1 ? "end" : "middle"}
                    className="pointer-events-none fill-muted-foreground"
                    fontSize={9}
                  >
                    {formatDayShort(p.day, lang)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hoveredPoint && hovered !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: Math.min(
                Math.max(hovered * (barWidth + BAR_GAP) + barWidth / 2, 56),
                width - 56,
              ),
              top: Math.max(
                0,
                PLOT_HEIGHT - barHeight(hoveredPoint.count) - 44,
              ),
            }}
          >
            <div className="text-muted-foreground">
              {hovered === points.length - 1
                ? t("ua_today")
                : formatDayLabel(hoveredPoint.day, lang)}
            </div>
            <div className="font-semibold tabular-nums">
              {t("ua_chart_total")(hoveredPoint.count)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
