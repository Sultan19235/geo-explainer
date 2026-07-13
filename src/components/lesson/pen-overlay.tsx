"use client";

// Freehand annotation layer over the GeoGebra view: two pens, an eraser and
// a clear button. GeoGebra's own pen doesn't work in the 3D view, so this is
// a plain canvas on top. Strokes are stored in normalized coordinates, so
// they survive resizes/fullscreen; they persist across solution steps and
// disappear only when the view unmounts (teacher switches problems) or the
// teacher clears them. While a tool is active the canvas captures the
// pointer, so rotating the model requires toggling the tool off — that's the
// expected trade-off.

import { useCallback, useEffect, useRef, useState } from "react";
import { EraserIcon, PenLineIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";

type Tool = "pen-red" | "pen-blue" | "erase";

type Stroke = {
  erase: boolean;
  color: string;
  width: number; // css px
  points: [number, number][]; // normalized 0..1
};

const PEN_COLORS: Record<"pen-red" | "pen-blue", string> = {
  "pen-red": "#dc2626",
  "pen-blue": "#2563eb",
};
const PEN_WIDTH = 3;
const ERASER_WIDTH = 28;

export function PenOverlay({
  lang,
  controlsClassName,
}: {
  lang: Lang;
  controlsClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const liveStrokeRef = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  const drawStroke = useCallback((stroke: Stroke) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || stroke.points.length < 2) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
    for (const [x, y] of stroke.points.slice(1)) {
      ctx.lineTo(x * w, y * h);
    }
    ctx.stroke();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    for (const stroke of strokesRef.current) drawStroke(stroke);
    if (liveStrokeRef.current) drawStroke(liveStrokeRef.current);
  }, [drawStroke]);

  // Keep the bitmap matched to the element size (and crisp on retina).
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = root.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (event: React.PointerEvent): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    ];
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!tool || event.button !== 0) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    liveStrokeRef.current = {
      erase: tool === "erase",
      color: tool === "erase" ? "#000" : PEN_COLORS[tool],
      width: tool === "erase" ? ERASER_WIDTH : PEN_WIDTH,
      points: [pointFromEvent(event)],
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const stroke = liveStrokeRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stroke || !canvas || !ctx) return;
    const point = pointFromEvent(event);
    const prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);
    // Draw just the new segment; full redraws only happen on resize/erase-end.
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev[0] * w, prev[1] * h);
    ctx.lineTo(point[0] * w, point[1] * h);
    ctx.stroke();
  };

  const onPointerUp = () => {
    const stroke = liveStrokeRef.current;
    liveStrokeRef.current = null;
    if (stroke && stroke.points.length > 1) {
      strokesRef.current.push(stroke);
      setHasStrokes(true);
    }
  };

  const undo = () => {
    strokesRef.current.pop();
    liveStrokeRef.current = null;
    if (strokesRef.current.length === 0) setHasStrokes(false);
    redraw();
  };

  const clearAll = () => {
    strokesRef.current = [];
    liveStrokeRef.current = null;
    setHasStrokes(false);
    redraw();
  };

  const buttonBase =
    "grid size-8 place-items-center rounded-md border-[1.5px] border-[#d8dde5] bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors";

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[4]">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "absolute inset-0 h-full w-full touch-none",
          tool ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
        )}
      />

      <div
        className={cn(
          "pointer-events-auto absolute flex flex-col gap-1.5",
          controlsClassName,
        )}
      >
        {(["pen-red", "pen-blue"] as const).map((pen) => (
          <button
            key={pen}
            type="button"
            onClick={() => setTool((current) => (current === pen ? null : pen))}
            aria-pressed={tool === pen}
            aria-label={lang === "ru" ? "Карандаш" : "Қалам"}
            className={cn(buttonBase, "hover:border-[#c5cad3]")}
            style={
              tool === pen
                ? { backgroundColor: PEN_COLORS[pen], borderColor: PEN_COLORS[pen] }
                : undefined
            }
          >
            <PenLineIcon
              className="size-4"
              style={{ color: tool === pen ? "#fff" : PEN_COLORS[pen] }}
            />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTool((current) => (current === "erase" ? null : "erase"))}
          aria-pressed={tool === "erase"}
          aria-label={lang === "ru" ? "Ластик" : "Өшіргіш"}
          className={cn(
            buttonBase,
            tool === "erase"
              ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
              : "text-[#6b7280] hover:border-[#c5cad3] hover:text-[#1a1a2e]",
          )}
        >
          <EraserIcon className="size-4" />
        </button>
        {hasStrokes && (
          <>
            <button
              type="button"
              onClick={undo}
              aria-label={lang === "ru" ? "Отменить" : "Болдырмау"}
              className={cn(
                buttonBase,
                "text-[#6b7280] hover:border-[#c5cad3] hover:text-[#1a1a2e]",
              )}
            >
              <Undo2Icon className="size-4" />
            </button>
            <button
              type="button"
              onClick={clearAll}
              aria-label={lang === "ru" ? "Стереть всё" : "Барлығын өшіру"}
              className={cn(
                buttonBase,
                "text-[#6b7280] hover:border-[#dc2626] hover:text-[#dc2626]",
              )}
            >
              <Trash2Icon className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
