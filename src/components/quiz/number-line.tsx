"use client";

// Number-line visual brick for drill problems. Declarative: the generator
// names it and sets knobs ({min, max, points, arrows}); this component owns
// every pixel. Points are visible from the start (the given numbers); hop
// arrows appear only when `revealed` — they're the "why" picture of the
// answer, textbook-style arcs above the line.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { DrillVisual } from "@/lib/drill/types";

const ARROW_COLORS = ["#2245c3", "#dc2626", "#059669", "#d97706"];

type NumberLineData = Extract<DrillVisual, { type: "number-line" }>;

export function NumberLineVisual({
  visual,
  revealed,
  className,
}: {
  visual: NumberLineData;
  revealed: boolean;
  className?: string;
}) {
  const { min, max } = visual;
  const span = max - min;

  const layout = useMemo(() => {
    const width = 640;
    const padX = 26;
    const baseY = 66;
    const x = (v: number) => padX + ((v - min) / span) * (width - 2 * padX);
    // Tick every integer while readable, else a coarser step; label a subset
    // so numbers never collide on a phone.
    const tickStep = span <= 30 ? 1 : span <= 60 ? 2 : span <= 150 ? 5 : 10;
    const labelStep = span <= 20 ? tickStep : tickStep * (span <= 40 ? 2 : 5);
    const ticks: number[] = [];
    const start = Math.ceil(min / tickStep) * tickStep;
    for (let v = start; v <= max; v += tickStep) ticks.push(v);
    return { width, padX, baseY, x, ticks, labelStep };
  }, [min, max, span]);

  const { width, padX, baseY, x, ticks, labelStep } = layout;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${width} 96`}
        className="h-auto w-full min-w-[320px] select-none"
        role="img"
        aria-label={`${min}…${max}`}
      >
        {/* axis with arrowhead */}
        <line
          x1={padX - 14}
          y1={baseY}
          x2={width - padX + 14}
          y2={baseY}
          stroke="#334155"
          strokeWidth={1.6}
        />
        <path
          d={`M ${width - padX + 14} ${baseY} l -7 -4 v 8 z`}
          fill="#334155"
        />

        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={x(v)}
              y1={baseY - (v === 0 ? 7 : 5)}
              x2={x(v)}
              y2={baseY + (v === 0 ? 7 : 5)}
              stroke="#334155"
              strokeWidth={v === 0 ? 1.6 : 1}
            />
            {(v % labelStep === 0 || v === 0) && (
              <text
                x={x(v)}
                y={baseY + 22}
                textAnchor="middle"
                fontSize={13}
                fontWeight={v === 0 ? 700 : 500}
                fill="#334155"
              >
                {v}
              </text>
            )}
          </g>
        ))}

        {/* hop arrows (revealed with the answer): arcs above the line */}
        {revealed &&
          visual.arrows?.map((arrow, i) => {
            const x1 = x(arrow.from);
            const x2 = x(arrow.to);
            const h = Math.min(34, 14 + Math.abs(x2 - x1) * 0.12);
            const color = ARROW_COLORS[i % ARROW_COLORS.length];
            const dir = x2 > x1 ? 1 : -1;
            return (
              <g key={i} className="quiz-pop">
                <path
                  d={`M ${x1} ${baseY - 8} Q ${(x1 + x2) / 2} ${baseY - 8 - h * 2} ${x2} ${baseY - 8}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
                <path
                  d={`M ${x2} ${baseY - 8} l ${-7 * dir} -6 l ${2 * dir} 6 z`}
                  fill={color}
                />
              </g>
            );
          })}

        {/* marked points */}
        {visual.points?.map((v, i) => (
          <circle
            key={i}
            cx={x(v)}
            cy={baseY}
            r={4.5}
            fill="#2245c3"
            stroke="#fff"
            strokeWidth={1.5}
          />
        ))}
      </svg>
    </div>
  );
}
