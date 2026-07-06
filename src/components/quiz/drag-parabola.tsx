"use client";

// Interactive parabola the student drags to match a target equation (quiz
// mode D). Two handles: the vertex (snaps to the integer grid) and a shape
// point one unit to the right of the vertex (drag vertically to set the
// leading coefficient a = y − n, snapped to halves).
//
// Grabbing is forgiving: pointer-down anywhere near a handle "magnets" to the
// nearest one (no precise tap needed). One finger away from the handles pans
// the view; two fingers pinch-zoom; the mouse wheel zooms on desktop; +/− and
// reset buttons match GraphCanvas. Grid and axis numbers follow the view.
// Controlled: the parabola is a vertex-form triple, changes flow via onChange.

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  evaluate,
  toVertexForm,
  type QuadParams,
  type VertexTriple,
} from "@/lib/quiz/quadratic";

const VB = 340; // square viewBox side
const GRAB = 40; // magnet radius around a handle, in viewBox units
const CURVE = "#2563eb";
const AXIS = "#94a3b8";
const GRID = "#e5e9f0";
const LABEL = "#64748b";
const REF = "#f59e0b"; // dashed target shown after a wrong answer

type View = { cx: number; cy: number; half: number };

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
  window?: number; // initial half-window in world units on each axis
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ cx: 0, cy: 0, half: window });

  // Live pointer bookkeeping (never triggers renders on its own).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const modeRef = useRef<null | "vertex" | "shape" | "pan">(null);
  const pinchRef = useRef<null | { baseDist: number; baseHalf: number }>(null);
  const lastPanRef = useRef({ x: 0, y: 0 });

  const { cx, cy, half } = view;
  const sx = (wx: number) => ((wx - cx + half) / (2 * half)) * VB;
  const sy = (wy: number) => (1 - (wy - cy + half) / (2 * half)) * VB;

  const svgPointFromClient = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VB,
      y: ((clientY - rect.top) / rect.height) * VB,
    };
  };
  const worldFromClient = (clientX: number, clientY: number) => {
    const p = svgPointFromClient(clientX, clientY);
    return {
      x: cx + (p.x / VB) * 2 * half - half,
      y: cy - ((p.y / VB) * 2 * half - half),
    };
  };

  const vertexPt = { x: value.m, y: value.n };
  const shapePt = { x: value.m + 1, y: value.n + value.a };
  const ref = reference ? toVertexForm(reference) : null;

  // The handle within magnet range of an svg point — the closer one wins.
  const nearestHandle = (p: { x: number; y: number }) => {
    if (disabled || !onChange) return null;
    const dv = Math.hypot(p.x - sx(vertexPt.x), p.y - sy(vertexPt.y));
    const ds = Math.hypot(p.x - sx(shapePt.x), p.y - sy(shapePt.y));
    if (Math.min(dv, ds) > GRAB) return null;
    return dv <= ds ? ("vertex" as const) : ("shape" as const);
  };

  const pinchDist = () => {
    const pts = [...pointers.current.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      // Second finger: whatever was happening becomes a pinch.
      modeRef.current = null;
      pinchRef.current = { baseDist: pinchDist(), baseHalf: half };
      return;
    }
    const handle = nearestHandle(svgPointFromClient(e.clientX, e.clientY));
    if (handle) {
      modeRef.current = handle;
    } else {
      modeRef.current = "pan";
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchRef.current && pointers.current.size >= 2) {
      const { baseDist, baseHalf } = pinchRef.current;
      const dist = pinchDist();
      if (dist > 0 && baseDist > 0) {
        setView((v) => ({ ...v, half: clamp((baseHalf * baseDist) / dist, 2, 24) }));
      }
      return;
    }

    const mode = modeRef.current;
    if (mode === "vertex" || mode === "shape") {
      if (!onChange) return;
      const w = worldFromClient(e.clientX, e.clientY);
      if (mode === "vertex") {
        const m = clamp(Math.round(w.x), -20, 20);
        const n = clamp(Math.round(w.y), -20, 20);
        onChange({ ...value, m, n });
      } else {
        // Shape point: x is locked to m+1, so a = (snapped y) − n.
        let a = Math.round((w.y - value.n) * 2) / 2;
        if (a === 0) a = w.y - value.n >= 0 ? 0.5 : -0.5; // a = 0 isn't a parabola
        onChange({ ...value, a: clamp(a, -6, 6) });
      }
    } else if (mode === "pan") {
      const rect = svgRef.current!.getBoundingClientRect();
      const worldPerPx = (2 * half) / rect.width;
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, cx: v.cx - dx * worldPerPx, cy: v.cy + dy * worldPerPx }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 1) {
      // Pinch → one finger left: continue as a pan from that finger.
      const [rest] = [...pointers.current.values()];
      modeRef.current = "pan";
      lastPanRef.current = { x: rest.x, y: rest.y };
    } else if (pointers.current.size === 0) {
      modeRef.current = null;
    }
  };

  // Mouse-wheel zoom needs a non-passive native listener to preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setView((v) => ({ ...v, half: clamp(v.half * f, 2, 24) }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // ── grid geometry for the current view ──────────────────────────────────
  const gridStep = half > 6 ? 2 : 1;
  const gridLines: number[] = [];
  for (
    let t = Math.floor((cx - half) / gridStep) * gridStep;
    t <= cx + half + 1e-9;
    t += gridStep
  ) {
    gridLines.push(Math.round(t * 2) / 2);
  }
  const gridLinesY: number[] = [];
  for (
    let t = Math.floor((cy - half) / gridStep) * gridStep;
    t <= cy + half + 1e-9;
    t += gridStep
  ) {
    gridLinesY.push(Math.round(t * 2) / 2);
  }
  // Axis numbers sit along the axes, clamped to stay visible when an axis
  // scrolls out of view (same behavior as GraphCanvas).
  const xLabelY = clamp(sy(0) + 14, 14, VB - 6);
  const yLabelX = clamp(sx(0) + 5, 5, VB - 26);

  const sampleCurve = (a: number, m: number, n: number): string => {
    const p: QuadParams = { mode: "vertex", a, m, n };
    const pts: string[] = [];
    const step = (2 * half) / 160;
    for (let x = cx - half; x <= cx + half + step / 2; x += step) {
      pts.push(`${sx(x).toFixed(1)},${sy(evaluate(p, x)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const control = (
    action: () => void,
    icon: React.ReactNode,
    label: string,
  ) => (
    <button
      type="button"
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md border border-border bg-white/95 text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-ring"
      onClick={action}
    >
      {icon}
    </button>
  );

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB} ${VB}`}
        className="aspect-square w-full touch-none select-none rounded-xl border border-border bg-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* grid */}
        {gridLines.map((t) => (
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
        {gridLinesY.map((t) => (
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
        {/* axes */}
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
        {gridLines
          .filter((t) => Math.abs(t) > 1e-9)
          .map((t) => {
            const x = sx(t);
            if (x < 12 || x > VB - 12) return null;
            return (
              <text
                key={`lx${t}`}
                x={x}
                y={xLabelY}
                fill={LABEL}
                fontSize={11}
                textAnchor="middle"
              >
                {t}
              </text>
            );
          })}
        {gridLinesY
          .filter((t) => Math.abs(t) > 1e-9)
          .map((t) => {
            const y = sy(t);
            if (y < 12 || y > VB - 8) return null;
            return (
              <text key={`ly${t}`} x={yLabelX} y={y + 4} fill={LABEL} fontSize={11}>
                {t}
              </text>
            );
          })}

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
        <circle
          cx={sx(shapePt.x)}
          cy={sy(shapePt.y)}
          r={8}
          fill="#fff"
          stroke={CURVE}
          strokeWidth={2.5}
          style={{ cursor: disabled ? "default" : "ns-resize" }}
        />

        {/* vertex handle (filled) */}
        <circle
          cx={sx(vertexPt.x)}
          cy={sy(vertexPt.y)}
          r={8.5}
          fill={CURVE}
          stroke="#fff"
          strokeWidth={2}
          style={{ cursor: disabled ? "default" : "move" }}
        />
      </svg>
      <div className="absolute right-2 bottom-2 flex gap-1">
        {control(
          () => setView((v) => ({ ...v, half: clamp(v.half * 1.4, 2, 24) })),
          <Minus className="size-4" />,
          "Кішірейту",
        )}
        {control(
          () => setView((v) => ({ ...v, half: clamp(v.half * 0.7, 2, 24) })),
          <Plus className="size-4" />,
          "Үлкейту",
        )}
        {control(
          () => setView({ cx: 0, cy: 0, half: window }),
          <RotateCcw className="size-4" />,
          "Қалпына келтіру",
        )}
      </div>
    </div>
  );
}
