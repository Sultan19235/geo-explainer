// Static, non-interactive parabola thumbnail — the render primitive for
// "pick the graph" answer options and the quiz builder preview. Draws one
// QuadParams as a small SVG figure (grid, axes, curve, vertex) in a fixed
// world window. The outer <svg> clips overflow, so a steep parabola simply
// runs off the top edge like a textbook cutout. White background on purpose,
// same as GraphCanvas — it reads as a printed figure in light and dark mode.

import { evaluate, vertexOf, type QuadParams } from "@/lib/quiz/quadratic";

const CURVE = "#2563eb"; // site primary
const AXIS = "#94a3b8";
const GRID = "#e5e9f0";

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
  const sx = (wx: number) => ((wx + W) / (2 * W)) * 100;
  const sy = (wy: number) => (1 - (wy + W) / (2 * W)) * 100;

  const ticks: number[] = [];
  for (let i = -W; i <= W; i++) ticks.push(i);

  const points: string[] = [];
  const step = (2 * W) / 120;
  for (let x = -W; x <= W + step / 2; x += step) {
    points.push(`${sx(x).toFixed(2)},${sy(evaluate(params, x)).toFixed(2)}`);
  }

  const v = vertexOf(params);
  const vertexInside = v.x >= -W && v.x <= W && v.y >= -W && v.y <= W;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <rect x="0" y="0" width="100" height="100" fill="#fff" />
      {ticks.map((t) => (
        <line
          key={`gx${t}`}
          x1={sx(t)}
          y1={0}
          x2={sx(t)}
          y2={100}
          stroke={GRID}
          strokeWidth={0.6}
        />
      ))}
      {ticks.map((t) => (
        <line
          key={`gy${t}`}
          x1={0}
          y1={sy(t)}
          x2={100}
          y2={sy(t)}
          stroke={GRID}
          strokeWidth={0.6}
        />
      ))}
      <line x1={0} y1={sy(0)} x2={100} y2={sy(0)} stroke={AXIS} strokeWidth={1} />
      <line x1={sx(0)} y1={0} x2={sx(0)} y2={100} stroke={AXIS} strokeWidth={1} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={CURVE}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {vertexInside && (
        <circle
          cx={sx(v.x)}
          cy={sy(v.y)}
          r={2}
          fill={CURVE}
          stroke="#fff"
          strokeWidth={0.8}
        />
      )}
    </svg>
  );
}
