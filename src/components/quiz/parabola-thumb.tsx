// Static, non-interactive parabola thumbnail — the render primitive for the
// quiz builder's small previews and chips. Draws one QuadParams as an SVG
// figure (grid, numbered axes, curve, vertex) in a fixed world window.
//
// Drawn on a 300×300 viewBox so typical render sizes (~100–300 px) stay near
// 1:1 and lines read crisp instead of stretched-soft; axis-aligned grid lines
// use crispEdges to kill anti-alias fuzz. White background on purpose, same
// as GraphCanvas — it reads as a printed textbook figure in light and dark
// mode. For large/student-facing graphs prefer the interactive GraphCanvas.

import { evaluate, vertexOf, type QuadParams } from "@/lib/quiz/quadratic";

const VB = 300;
const CURVE = "#2563eb"; // site primary
const AXIS = "#94a3b8";
const GRID = "#e5e9f0";
const LABEL = "#64748b";

export function ParabolaThumb({
  params,
  window = 6,
  className,
}: {
  params: QuadParams;
  window?: number; // half-width of the visible world, in units, on each axis
  className?: string;
}) {
  const W = window;
  const sx = (wx: number) => ((wx + W) / (2 * W)) * VB;
  const sy = (wy: number) => (1 - (wy + W) / (2 * W)) * VB;

  const ticks: number[] = [];
  for (let i = -W; i <= W; i++) ticks.push(i);
  // Number every unit when the window is small, every 2 when it's dense.
  const labelStep = W > 5 ? 2 : 1;

  const points: string[] = [];
  const step = (2 * W) / 140;
  for (let x = -W; x <= W + step / 2; x += step) {
    points.push(`${sx(x).toFixed(1)},${sy(evaluate(params, x)).toFixed(1)}`);
  }

  const v = vertexOf(params);
  const vertexInside = v.x >= -W && v.x <= W && v.y >= -W && v.y <= W;

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <rect x="0" y="0" width={VB} height={VB} fill="#fff" />
      {ticks.map((t) => (
        <line
          key={`gx${t}`}
          x1={sx(t)}
          y1={0}
          x2={sx(t)}
          y2={VB}
          stroke={GRID}
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
      {ticks.map((t) => (
        <line
          key={`gy${t}`}
          x1={0}
          y1={sy(t)}
          x2={VB}
          y2={sy(t)}
          stroke={GRID}
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
      <line
        x1={0}
        y1={sy(0)}
        x2={VB}
        y2={sy(0)}
        stroke={AXIS}
        strokeWidth={1.5}
        shapeRendering="crispEdges"
      />
      <line
        x1={sx(0)}
        y1={0}
        x2={sx(0)}
        y2={VB}
        stroke={AXIS}
        strokeWidth={1.5}
        shapeRendering="crispEdges"
      />
      {/* axis numbers */}
      {ticks
        .filter((t) => t !== 0 && t % labelStep === 0)
        .map((t) => {
          const x = sx(t);
          if (x < 14 || x > VB - 14) return null;
          return (
            <text
              key={`lx${t}`}
              x={x}
              y={sy(0) + 13}
              fill={LABEL}
              fontSize={11}
              textAnchor="middle"
            >
              {t}
            </text>
          );
        })}
      {ticks
        .filter((t) => t !== 0 && t % labelStep === 0)
        .map((t) => {
          const y = sy(t);
          if (y < 12 || y > VB - 8) return null;
          return (
            <text key={`ly${t}`} x={sx(0) + 5} y={y + 4} fill={LABEL} fontSize={11}>
              {t}
            </text>
          );
        })}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={CURVE}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {vertexInside && (
        <circle
          cx={sx(v.x)}
          cy={sy(v.y)}
          r={4}
          fill={CURVE}
          stroke="#fff"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
