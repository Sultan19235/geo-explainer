"use client";

// Board mode's whiteboard: the walkthrough pane becomes a tall, scrollable
// drawing surface (squared like an exercise book) the teacher writes the
// solution on. Reuses the pen-overlay stroke model — vector strokes replayed
// on redraw — but through a virtual window: the canvas bitmap is only
// pane-sized and strokes render at the scroll offset, so a board many
// screens tall costs no bitmap memory. Boards live in a module store keyed
// by problem: switching problems or modes keeps each board until the page
// reloads — like a real classroom board, nothing is saved to the server.
//
// Input rules: with a tool active one pointer draws, two pointers pan and
// the wheel scrolls; with no tool the underlying scroller handles native
// one-finger/wheel scrolling. The squared background is CSS on the canvas
// element, shifted in the same scroll handler that redraws the ink, so grid
// and ink never drift apart (and the eraser's destination-out can't punch
// holes in the grid).

import { useCallback, useEffect, useRef, useState } from "react";
import { EraserIcon, PenLineIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";

const PEN_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#1a1a2e"] as const;
const PEN_WIDTH = 3;
const ERASER_SIZES = [
  { width: 14, dot: 5 },
  { width: 32, dot: 9 },
  { width: 64, dot: 14 },
] as const;
const GRID = 26; // css px, one exercise-book cell

type Tool = { kind: "pen"; color: string } | { kind: "erase" };

type Stroke = {
  erase: boolean;
  color: string;
  width: number; // css px
  // Board space, x AND y normalized by board width, so ink scales uniformly
  // when the pane is resized and handwriting keeps its shape.
  points: [number, number][];
};

type BoardState = { strokes: Stroke[]; heightUnits: number };

// Per-problem boards survive problem/mode switches, die with the page.
const boards = new Map<string, BoardState>();

const MIN_HEIGHT_UNITS = 2; // board height ≥ 2 × its width
const MAX_HEIGHT_UNITS = 14;

const HINT = {
  kz: "Тақта · екі саусақпен жылжиды",
  ru: "Доска · листается двумя пальцами",
} as const;

const LABELS = {
  pen: { kz: "Қалам", ru: "Ручка" },
  erase: { kz: "Өшіргіш", ru: "Ластик" },
  eraseSize: { kz: "Өшіргіш өлшемі", ru: "Размер ластика" },
  undo: { kz: "Болдырмау", ru: "Отменить" },
  clear: { kz: "Барлығын өшіру", ru: "Стереть всё" },
} as const;

export function BoardCanvas({
  storeKey,
  lang,
  className,
}: {
  storeKey: string;
  lang: Lang;
  className?: string;
}) {
  const boardRef = useRef<BoardState | null>(null);
  if (boardRef.current === null) {
    boardRef.current = boards.get(storeKey) ?? {
      strokes: [],
      heightUnits: MIN_HEIGHT_UNITS,
    };
    boards.set(storeKey, boardRef.current);
  }
  const board = boardRef.current;

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveStrokeRef = useRef<Stroke | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panLastYRef = useRef<number | null>(null);
  const scrollRafRef = useRef(0);

  // Board mode exists to write on — a pen is ready from the first touch.
  const [tool, setTool] = useState<Tool | null>({
    kind: "pen",
    color: PEN_COLORS[0],
  });
  const [eraserWidth, setEraserWidth] = useState<number>(ERASER_SIZES[1].width);
  const [hasStrokes, setHasStrokes] = useState(board.strokes.length > 0);
  const [heightUnits, setHeightUnits] = useState(board.heightUnits);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    board.heightUnits = heightUnits;
  }, [board, heightUnits]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !scroller || !ctx) return;
    const w = canvas.clientWidth;
    const top = scroller.scrollTop;
    ctx.clearRect(0, 0, w, canvas.clientHeight);
    const paint = (stroke: Stroke) => {
      if (stroke.points.length < 2) return;
      ctx.globalCompositeOperation = stroke.erase
        ? "destination-out"
        : "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * w - top);
      for (const [x, y] of stroke.points.slice(1)) {
        ctx.lineTo(x * w, y * w - top);
      }
      ctx.stroke();
    };
    for (const stroke of board.strokes) paint(stroke);
    if (liveStrokeRef.current) paint(liveStrokeRef.current);
  }, [board]);

  // One handler moves both layers on scroll: the CSS grid shifts and the ink
  // repaints at the new offset within the same frame.
  const syncScroll = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    if (!canvas || !scroller) return;
    canvas.style.backgroundPositionY = `${-(scroller.scrollTop % GRID)}px`;
    redraw();
  }, [redraw]);

  const onScroll = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      syncScroll();
    });
  };

  useEffect(() => () => cancelAnimationFrame(scrollRafRef.current), []);

  // Keep the bitmap matched to the pane (and crisp on retina); make sure the
  // board stays scrollably taller than the pane, even after fullscreen.
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = root.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      setBoardWidth(width);
      if (width > 0 && height > 0) {
        const minUnits = Math.max(MIN_HEIGHT_UNITS, (height * 1.8) / width);
        setHeightUnits((units) =>
          units < minUnits ? Math.min(MAX_HEIGHT_UNITS, minUnits) : units,
        );
      }
      syncScroll();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, [syncScroll]);

  const pointFromEvent = (event: React.PointerEvent): [number, number] => {
    const canvas = canvasRef.current!;
    const scroller = scrollerRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top + scroller.scrollTop) / rect.width,
    ];
  };

  const avgClientY = () => {
    let sum = 0;
    for (const point of pointersRef.current.values()) sum += point.y;
    return sum / Math.max(1, pointersRef.current.size);
  };

  // Writing near the bottom edge earns more board below — the "scroll down"
  // room the teacher asked for, without an infinite canvas.
  const growForStroke = (stroke: Stroke) => {
    const root = rootRef.current;
    if (!root) return;
    const width = root.clientWidth;
    const viewH = root.clientHeight;
    if (!width || !viewH) return;
    let maxY = 0;
    for (const [, y] of stroke.points) maxY = Math.max(maxY, y);
    setHeightUnits((units) => {
      if (maxY * width < units * width - viewH * 0.5) return units;
      return Math.min(MAX_HEIGHT_UNITS, units + viewH / width);
    });
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointersRef.current.size >= 2) {
      // Second finger down: this is a pan, not a stroke.
      liveStrokeRef.current = null;
      panLastYRef.current = avgClientY();
      redraw();
      return;
    }
    if (!tool) return;
    liveStrokeRef.current = {
      erase: tool.kind === "erase",
      color: tool.kind === "pen" ? tool.color : "#000",
      width: tool.kind === "erase" ? eraserWidth : PEN_WIDTH,
      points: [pointFromEvent(event)],
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointersRef.current.size >= 2) {
      const scroller = scrollerRef.current;
      if (scroller && panLastYRef.current !== null) {
        const y = avgClientY();
        scroller.scrollTop -= y - panLastYRef.current; // onScroll repaints
        panLastYRef.current = y;
      }
      return;
    }
    const stroke = liveStrokeRef.current;
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stroke || !canvas || !scroller || !ctx) return;
    const point = pointFromEvent(event);
    const prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);
    // Draw just the new segment; full redraws happen on scroll/resize/undo.
    const w = canvas.clientWidth;
    const top = scroller.scrollTop;
    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev[0] * w, prev[1] * w - top);
    ctx.lineTo(point[0] * w, point[1] * w - top);
    ctx.stroke();
  };

  const endPointer = (event: React.PointerEvent) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) panLastYRef.current = null;
    const stroke = liveStrokeRef.current;
    liveStrokeRef.current = null;
    if (stroke && stroke.points.length > 1) {
      board.strokes.push(stroke);
      setHasStrokes(true);
      growForStroke(stroke);
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop += event.deltaY;
  };

  const undo = () => {
    board.strokes.pop();
    liveStrokeRef.current = null;
    if (board.strokes.length === 0) setHasStrokes(false);
    redraw();
  };

  const clearAll = () => {
    board.strokes.length = 0;
    liveStrokeRef.current = null;
    setHasStrokes(false);
    redraw();
  };

  const buttonBase =
    "grid size-8 place-items-center rounded-md border-[1.5px] border-[#d8dde5] bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors";

  return (
    <div
      ref={rootRef}
      className={cn("relative min-h-0 flex-1 overflow-hidden bg-white", className)}
    >
      {/* Native scroll machinery: scrollbar, wheel and one-finger scroll
          whenever no tool is active. The spacer is the board's true height. */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="absolute inset-0 z-[2] overflow-y-auto"
      >
        <div
          style={{
            height: Math.max(1, Math.round(heightUnits * Math.max(boardWidth, 1))),
          }}
        />
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
        className={cn(
          "absolute inset-0 h-full w-full touch-none",
          tool ? "z-[3] cursor-crosshair" : "z-[1] pointer-events-none",
        )}
        style={{
          backgroundImage:
            "linear-gradient(#edf1f7 1px, transparent 1px), linear-gradient(90deg, #edf1f7 1px, transparent 1px)",
          backgroundSize: `${GRID}px ${GRID}px`,
        }}
      />

      {!hasStrokes && (
        <div className="pointer-events-none absolute top-2.5 left-3 z-[4] rounded bg-white/85 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#9aa3af]">
          {HINT[lang] ?? HINT.kz}
        </div>
      )}

      <div className="absolute top-2 right-2.5 z-[4] flex flex-col gap-1.5">
        {PEN_COLORS.map((color) => {
          const active = tool?.kind === "pen" && tool.color === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() =>
                setTool((current) =>
                  current?.kind === "pen" && current.color === color
                    ? null
                    : { kind: "pen", color },
                )
              }
              aria-pressed={active}
              aria-label={LABELS.pen[lang] ?? LABELS.pen.kz}
              className={cn(buttonBase, "hover:border-[#c5cad3]")}
              style={
                active ? { backgroundColor: color, borderColor: color } : undefined
              }
            >
              <PenLineIcon
                className="size-4"
                style={{ color: active ? "#fff" : color }}
              />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() =>
            setTool((current) =>
              current?.kind === "erase" ? null : { kind: "erase" },
            )
          }
          aria-pressed={tool?.kind === "erase"}
          aria-label={LABELS.erase[lang] ?? LABELS.erase.kz}
          className={cn(
            buttonBase,
            tool?.kind === "erase"
              ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
              : "text-[#6b7280] hover:border-[#c5cad3] hover:text-[#1a1a2e]",
          )}
        >
          <EraserIcon className="size-4" />
        </button>
        {tool?.kind === "erase" &&
          ERASER_SIZES.map(({ width, dot }) => (
            <button
              key={width}
              type="button"
              onClick={() => setEraserWidth(width)}
              aria-pressed={eraserWidth === width}
              aria-label={LABELS.eraseSize[lang] ?? LABELS.eraseSize.kz}
              className={cn(
                buttonBase,
                eraserWidth === width
                  ? "border-[#1a1a2e] bg-[#1a1a2e]"
                  : "hover:border-[#c5cad3]",
              )}
            >
              <span
                className={cn(
                  "rounded-full",
                  eraserWidth === width ? "bg-white" : "bg-[#6b7280]",
                )}
                style={{ width: dot, height: dot }}
              />
            </button>
          ))}
        {hasStrokes && (
          <>
            <button
              type="button"
              onClick={undo}
              aria-label={LABELS.undo[lang] ?? LABELS.undo.kz}
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
              aria-label={LABELS.clear[lang] ?? LABELS.clear.kz}
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
