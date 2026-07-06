"use client";

// Interactive parabola the student drags to match a target equation (quiz
// mode D). Two handles: the vertex (drag anywhere, snaps to integer grid) and
// a shape point one unit to the right of the vertex (drag vertically to set
// the leading coefficient a = y − n, snapped to halves). Controlled: the
// current parabola is a vertex-form triple, changes flow through onChange.
// Pointer events cover mouse and touch alike; touch-action:none stops the page
// scrolling under a drag.

import { useRef, useState } from "react";
import {
  evaluate,
  toVertexForm,
  type QuadParams,
  type VertexTriple,
} from "@/lib/quiz/quadratic";

const VB = 340; // square viewBox side
const CURVE = "#2563eb";
const AXIS = "#94a3b8";
const GRID = "#e5e9f0";
const LABEL = "#94a3b8";
const REF = "#f59e0b"; // dashed target shown after a wrong answer

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function DragParabola({
  value,
  onChange,
  disabled = false,
  reference,
  window = 8,
}: {
  value: VertexTriple;
  onChange?: (v: VertexTriple) => void;
  disabled?: boolean;
  reference?: QuadParams; // faint dashed target curve
  window?: number; // half-window in world units on each axis
}) {
  const W = window;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<null | "vertex" | "shape">(null);

  const sx = (wx: number) => ((wx + W) / (2 * W)) * VB;
  const sy = (wy: number) => (1 - (wy + W) / (2 * W)) * VB;

  const sampleCurve = (a: number, m: number, n: number): string => {
    const p: QuadParams = { mode: "vertex", a, m, n };
    const pts: string[] = [];
    const step = (2 * W) / 160;
    for (let x = -W; x <= W + step / 2; x += step) {
      pts.push(`${sx(x).toFixed(1)},${sy(evaluate(p, x)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const ticks: number[] = [];
  for (let i = -W + 1; i <= W - 1; i++) if (i !== 0) ticks.push(i);

  const vertexPt = { x: value.m, y: value.n };
  const shapePt = { x: value.m + 1, y: value.n + value.a };
  const ref = reference ? toVertexForm(reference) : null;

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const gx = ((clientX - rect.left) / rect.width) * VB;
    const gy = ((clientY - rect.top) / rect.height) * VB;
    return {
      x: (gx / VB) * 2 * W - W,
      y: (1 - gy / VB) * 2 * W - W,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || disabled || !onChange) return;
    const w = toWorld(e.clientX, e.clientY);
    if (drag === "vertex") {
      const m = clamp(Math.round(w.x), -(W - 1), W - 1);
      const n = clamp(Math.round(w.y), -(W - 1), W - 1);
      onChange({ ...value, m, n });
    } else {
      // Shape point: x is locked to m+1, so a = (snapped y) − n.
      let a = Math.round((w.y - value.n) * 2) / 2;
      if (a === 0) a = w.y - value.n >= 0 ? 0.5 : -0.5; // a = 0 isn't a parabola
      onChange({ ...value, a: clamp(a, -6, 6) });
    }
  };

  const startDrag = (mode: "vertex" | "shape") => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag(mode);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB} ${VB}`}
      className="aspect-square w-full touch-none select-none rounded-xl border border-border bg-white"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* grid */}
      {ticks.concat(0).map((t) => (
        <line key={`gx${t}`} x1={sx(t)} y1={0} x2={sx(t)} y2={VB} stroke={GRID} strokeWidth={1} />
      ))}
      {ticks.concat(0).map((t) => (
        <line key={`gy${t}`} x1={0} y1={sy(t)} x2={VB} y2={sy(t)} stroke={GRID} strokeWidth={1} />
      ))}
      {/* axes */}
      <line x1={0} y1={sy(0)} x2={VB} y2={sy(0)} stroke={AXIS} strokeWidth={1.5} />
      <line x1={sx(0)} y1={0} x2={sx(0)} y2={VB} stroke={AXIS} strokeWidth={1.5} />
      {/* tick labels */}
      {ticks.map((t) => (
        <text
          key={`lx${t}`}
          x={sx(t)}
          y={sy(0) + 12}
          fill={LABEL}
          fontSize={9}
          textAnchor="middle"
        >
          {t}
        </text>
      ))}
      {ticks.map((t) => (
        <text
          key={`ly${t}`}
          x={sx(0) + 4}
          y={sy(t) + 3}
          fill={LABEL}
          fontSize={9}
        >
          {t}
        </text>
      ))}

      {/* reference (target) curve, drawn faintly behind */}
      {ref && (
        <polyline
          points={sampleCurve(ref.a, ref.m, ref.n)}
          fill="none"
          stroke={REF}
          strokeWidth={2}
          strokeDasharray="5 5"
          strokeLinecap="round"
        />
      )}

      {/* the student's parabola */}
      <polyline
        points={sampleCurve(value.a, value.m, value.n)}
        fill="none"
        stroke={CURVE}
        strokeWidth={2.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* guide from vertex to shape point */}
      <line
        x1={sx(vertexPt.x)}
        y1={sy(vertexPt.y)}
        x2={sx(shapePt.x)}
        y2={sy(shapePt.y)}
        stroke={CURVE}
        strokeOpacity={0.35}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />

      {/* shape handle (hollow) */}
      <g style={{ cursor: disabled ? "default" : "ns-resize" }}>
        <circle
          cx={sx(shapePt.x)}
          cy={sy(shapePt.y)}
          r={16}
          fill="transparent"
          onPointerDown={startDrag("shape")}
        />
        <circle
          cx={sx(shapePt.x)}
          cy={sy(shapePt.y)}
          r={7}
          fill="#fff"
          stroke={CURVE}
          strokeWidth={2.5}
        />
      </g>

      {/* vertex handle (filled) */}
      <g style={{ cursor: disabled ? "default" : "move" }}>
        <circle
          cx={sx(vertexPt.x)}
          cy={sy(vertexPt.y)}
          r={16}
          fill="transparent"
          onPointerDown={startDrag("vertex")}
        />
        <circle
          cx={sx(vertexPt.x)}
          cy={sy(vertexPt.y)}
          r={7.5}
          fill={CURVE}
          stroke="#fff"
          strokeWidth={2}
        />
      </g>
    </svg>
  );
}
