"use client";

// Renderer for the generic "figure" drill brick + the dispatch component for
// all drill visuals. A figure arrives as DATA (shape list in math
// coordinates, y up); this component owns the pencil: brand palette, stroke
// widths, font sizes, aspect ratio — an uploaded file can describe a picture
// but never touch a pixel. `reveal` shapes appear with the answer.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { NumberLineVisual } from "@/components/quiz/number-line";
import type { DrillVisual, FigureColor, FigureShape } from "@/lib/drill/types";

const COLORS: Record<FigureColor, string> = {
  blue: "#2245c3",
  red: "#dc2626",
  green: "#059669",
  orange: "#d97706",
  slate: "#64748b",
};

const FILLS: Record<FigureColor, string> = {
  blue: "rgba(34,69,195,0.12)",
  red: "rgba(220,38,38,0.12)",
  green: "rgba(5,150,105,0.12)",
  orange: "rgba(217,119,6,0.14)",
  slate: "rgba(100,116,139,0.12)",
};

// Figure text lives in a 640-wide viewBox that scales down to phone width, so
// this reads on screen at roughly 0.7× — keep it generous. Single knob for
// every figure label (both `point` captions and `label` shapes).
const LABEL_FONT_SIZE = 21;

type FigureData = Extract<DrillVisual, { type: "figure" }>;

export function FigureVisual({
  visual,
  revealed,
  className,
}: {
  visual: FigureData;
  revealed: boolean;
  className?: string;
}) {
  const { view } = visual;

  const layout = useMemo(() => {
    const spanX = view.xMax - view.xMin;
    const spanY = view.yMax - view.yMin;
    const width = 640;
    const pad = 30;
    // Same scale on both axes (circles must be round); height follows the
    // view's aspect, capped so tall figures never eat a phone screen.
    const scale = (width - 2 * pad) / spanX;
    const height = Math.min(460, Math.max(140, spanY * scale + 2 * pad));
    const usableScale = Math.min(scale, (height - 2 * pad) / spanY);
    const cx = (view.xMin + view.xMax) / 2;
    const cy = (view.yMin + view.yMax) / 2;
    const x = (vx: number) => width / 2 + (vx - cx) * usableScale;
    const y = (vy: number) => height / 2 - (vy - cy) * usableScale;
    return { width, height, x, y, s: usableScale };
  }, [view]);

  const { width, height, x, y, s } = layout;

  const renderShape = (shape: FigureShape, i: number, pop: boolean) => {
    const color = COLORS[shape.color ?? "blue"];
    const cls = pop ? "quiz-pop" : undefined;
    switch (shape.kind) {
      case "segment":
        return (
          <line
            key={i}
            className={cls}
            x1={x(shape.from[0])}
            y1={y(shape.from[1])}
            x2={x(shape.to[0])}
            y2={y(shape.to[1])}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={shape.dash ? "5 4" : undefined}
          />
        );
      case "arrow": {
        const x1 = x(shape.from[0]);
        const y1 = y(shape.from[1]);
        const x2 = x(shape.to[0]);
        const y2 = y(shape.to[1]);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const ah = 9;
        return (
          <g key={i} className={cls}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} />
            <path
              d={`M ${x2} ${y2} L ${x2 - ah * Math.cos(angle - 0.44)} ${y2 - ah * Math.sin(angle - 0.44)} L ${x2 - ah * Math.cos(angle + 0.44)} ${y2 - ah * Math.sin(angle + 0.44)} Z`}
              fill={color}
            />
          </g>
        );
      }
      case "circle":
        return (
          <circle
            key={i}
            className={cls}
            cx={x(shape.center[0])}
            cy={y(shape.center[1])}
            r={shape.radius * s}
            stroke={color}
            strokeWidth={2}
            fill={shape.fill ? FILLS[shape.color ?? "blue"] : "none"}
          />
        );
      case "arc": {
        const r = shape.radius * s;
        const a1 = (shape.startDeg * Math.PI) / 180;
        const a2 = (shape.endDeg * Math.PI) / 180;
        const cx0 = x(shape.center[0]);
        const cy0 = y(shape.center[1]);
        const p1x = cx0 + r * Math.cos(a1);
        const p1y = cy0 - r * Math.sin(a1);
        const p2x = cx0 + r * Math.cos(a2);
        const p2y = cy0 - r * Math.sin(a2);
        const sweep = shape.endDeg - shape.startDeg;
        const large = Math.abs(sweep % 360) > 180 ? 1 : 0;
        const flip = sweep > 0 ? 0 : 1;
        const tangent = a2 + ((sweep > 0 ? 1 : -1) * Math.PI) / 2;
        const ah = 8;
        return (
          <g key={i} className={cls}>
            <path
              d={`M ${p1x} ${p1y} A ${r} ${r} 0 ${large} ${flip} ${p2x} ${p2y}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
            {shape.arrow && (
              <path
                d={`M ${p2x} ${p2y} l ${ah * Math.cos(tangent - 0.5)} ${-ah * Math.sin(tangent - 0.5)} l ${-ah * 0.35 * Math.cos(tangent + 0.6)} ${ah * 0.35 * Math.sin(tangent + 0.6)} z`}
                fill={color}
              />
            )}
          </g>
        );
      }
      case "point":
        return (
          <g key={i} className={cls}>
            <circle
              cx={x(shape.at[0])}
              cy={y(shape.at[1])}
              r={4.5}
              fill={color}
              stroke="#fff"
              strokeWidth={1.5}
            />
            {shape.label && (
              <text
                x={x(shape.at[0]) + 8}
                y={y(shape.at[1]) - 8}
                fontSize={LABEL_FONT_SIZE}
                fontWeight={600}
                fill={color}
              >
                {shape.label}
              </text>
            )}
          </g>
        );
      case "label":
        return (
          <text
            key={i}
            className={cls}
            x={x(shape.at[0])}
            y={y(shape.at[1])}
            textAnchor="middle"
            fontSize={LABEL_FONT_SIZE}
            fontWeight={600}
            fill={COLORS[shape.color ?? "slate"]}
          >
            {shape.text}
          </text>
        );
      case "polygon":
        return (
          <polygon
            key={i}
            className={cls}
            points={shape.points.map((p) => `${x(p[0])},${y(p[1])}`).join(" ")}
            stroke={color}
            strokeWidth={2}
            fill={shape.fill ? FILLS[shape.color ?? "blue"] : "none"}
          />
        );
    }
  };

  // Light grid + axes behind everything, clipped to the view window.
  const gridLines = useMemo(() => {
    if (!visual.grid && !visual.axes) return null;
    const lines: React.ReactNode[] = [];
    if (visual.grid) {
      const step = niceStep(view.xMax - view.xMin);
      for (let vx = Math.ceil(view.xMin / step) * step; vx <= view.xMax; vx += step) {
        lines.push(
          <line key={`gx${vx}`} x1={x(vx)} y1={y(view.yMin)} x2={x(vx)} y2={y(view.yMax)} stroke="#e2e8f0" strokeWidth={1} />,
        );
      }
      for (let vy = Math.ceil(view.yMin / step) * step; vy <= view.yMax; vy += step) {
        lines.push(
          <line key={`gy${vy}`} x1={x(view.xMin)} y1={y(vy)} x2={x(view.xMax)} y2={y(vy)} stroke="#e2e8f0" strokeWidth={1} />,
        );
      }
    }
    if (visual.axes) {
      if (view.yMin <= 0 && view.yMax >= 0) {
        lines.push(
          <line key="ax" x1={x(view.xMin)} y1={y(0)} x2={x(view.xMax)} y2={y(0)} stroke="#94a3b8" strokeWidth={1.4} />,
        );
      }
      if (view.xMin <= 0 && view.xMax >= 0) {
        lines.push(
          <line key="ay" x1={x(0)} y1={y(view.yMin)} x2={x(0)} y2={y(view.yMax)} stroke="#94a3b8" strokeWidth={1.4} />,
        );
      }
    }
    return lines;
  }, [visual.grid, visual.axes, view, x, y]);

  return (
    <div className={cn("overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto h-auto w-full max-w-md select-none"
        role="img"
      >
        {gridLines}
        {visual.shapes.map((shape, i) => renderShape(shape, i, false))}
        {revealed && visual.reveal?.map((shape, i) => renderShape(shape, i, true))}
      </svg>
    </div>
  );
}

function niceStep(span: number): number {
  if (span <= 12) return 1;
  if (span <= 30) return 2;
  if (span <= 80) return 5;
  return 10;
}

/** Dispatch: render whichever brick the problem asked for. */
export function DrillVisualView({
  visual,
  revealed,
  className,
}: {
  visual: DrillVisual;
  revealed: boolean;
  className?: string;
}) {
  if (visual.type === "number-line") {
    return (
      <NumberLineVisual visual={visual} revealed={revealed} className={className} />
    );
  }
  return <FigureVisual visual={visual} revealed={revealed} className={className} />;
}
