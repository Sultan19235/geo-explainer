"use client";

// Pannable/zoomable parabola plot for one answer option. Imperative canvas
// core ported from the uploaded student page's GraphView; React only manages
// lifecycle and the zoom controls. The plot stays white in dark mode on
// purpose — it reads as a printed textbook figure.

import { useEffect, useRef } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { evaluate, vertexOf, type QuadParams } from "@/lib/quiz/quadratic";

const CURVE = "#2563eb"; // site primary
const AXIS = "#94a3b8";
const GRID = "#eef1f6";
const LABEL = "#64748b";

class Plot {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private cx = 0;
  private cy = 0;
  private scale = 0.05; // world units per CSS pixel
  private dragging = false;
  private lx = 0;
  private ly = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
    private params: QuadParams,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.container.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private w2s(wx: number, wy: number) {
    return {
      x: this.w / 2 + (wx - this.cx) / this.scale,
      y: this.h / 2 - (wy - this.cy) / this.scale,
    };
  }
  private s2w(sx: number, sy: number) {
    return {
      x: this.cx + (sx - this.w / 2) * this.scale,
      y: this.cy - (sy - this.h / 2) * this.scale,
    };
  }

  zoomIn() {
    this.scale = Math.max(0.01, this.scale * 0.7);
    this.draw();
  }
  zoomOut() {
    this.scale = Math.min(0.5, this.scale * 1.4);
    this.draw();
  }
  // Mouse-wheel zoom: factor > 1 zooms out, < 1 zooms in.
  zoomBy(factor: number) {
    this.scale = Math.min(0.5, Math.max(0.01, this.scale * factor));
    this.draw();
  }
  reset() {
    this.cx = 0;
    this.cy = 0;
    this.scale = 0.05;
    this.draw();
  }

  // Two-finger pinch zoom: scale follows the ratio of the current finger
  // distance to the distance when the pinch started.
  private pinching = false;
  private pinchBaseDist = 0;
  private pinchBaseScale = 0.05;

  pinchStart(dist: number) {
    if (dist <= 0) return;
    this.pinching = true;
    this.pinchBaseDist = dist;
    this.pinchBaseScale = this.scale;
  }
  pinchMove(dist: number) {
    if (!this.pinching || dist <= 0) return;
    this.scale = Math.min(
      0.5,
      Math.max(0.01, (this.pinchBaseScale * this.pinchBaseDist) / dist),
    );
    this.draw();
  }
  pinchEnd() {
    this.pinching = false;
  }

  panStart(x: number, y: number) {
    this.dragging = true;
    this.lx = x;
    this.ly = y;
  }
  panMove(x: number, y: number) {
    if (!this.dragging) return;
    this.cx -= (x - this.lx) * this.scale;
    this.cy += (y - this.ly) * this.scale;
    this.lx = x;
    this.ly = y;
    this.draw();
  }
  panEnd() {
    this.dragging = false;
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    const hw = (w / 2) * this.scale;
    const hh = (h / 2) * this.scale;
    const b = {
      minX: this.cx - hw,
      maxX: this.cx + hw,
      minY: this.cy - hh,
      maxY: this.cy + hh,
    };
    const ww = b.maxX - b.minX;
    let gs = 1;
    if (ww > 20) gs = 5;
    if (ww > 50) gs = 10;
    if (ww < 5) gs = 0.5;

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (let x = Math.floor(b.minX / gs) * gs; x <= b.maxX; x += gs) {
      const p = this.w2s(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, h);
      ctx.stroke();
    }
    for (let y = Math.floor(b.minY / gs) * gs; y <= b.maxY; y += gs) {
      const p = this.w2s(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(w, p.y);
      ctx.stroke();
    }

    ctx.strokeStyle = AXIS;
    ctx.lineWidth = 1.5;
    const o = this.w2s(0, 0);
    if (o.y >= 0 && o.y <= h) {
      ctx.beginPath();
      ctx.moveTo(0, o.y);
      ctx.lineTo(w, o.y);
      ctx.stroke();
    }
    if (o.x >= 0 && o.x <= w) {
      ctx.beginPath();
      ctx.moveTo(o.x, 0);
      ctx.lineTo(o.x, h);
      ctx.stroke();
    }

    ctx.fillStyle = LABEL;
    ctx.font = "500 9px var(--font-sans), sans-serif";
    ctx.textAlign = "center";
    for (let x = Math.floor(b.minX / gs) * gs; x <= b.maxX; x += gs) {
      if (Math.abs(x) < 0.001) continue;
      const p = this.w2s(x, 0);
      if (p.x > 12 && p.x < w - 12) {
        ctx.fillText(
          Number.isInteger(x) ? String(x) : x.toFixed(1),
          p.x,
          Math.min(Math.max(o.y + 13, 13), h - 3),
        );
      }
    }
    ctx.textAlign = "left";
    for (let y = Math.floor(b.minY / gs) * gs; y <= b.maxY; y += gs) {
      if (Math.abs(y) < 0.001) continue;
      const p = this.w2s(0, y);
      if (p.y > 10 && p.y < h - 6) {
        ctx.fillText(
          Number.isInteger(y) ? String(y) : y.toFixed(1),
          Math.min(Math.max(o.x + 3, 3), w - 18),
          p.y + 4,
        );
      }
    }
    ctx.font = "700 10px var(--font-sans), sans-serif";
    ctx.fillText("x", w - 10, Math.min(Math.max(o.y - 4, 12), h - 3));
    ctx.fillText("y", Math.min(Math.max(o.x + 4, 4), w - 10), 10);

    ctx.beginPath();
    ctx.strokeStyle = CURVE;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let started = false;
    for (let px = -10; px <= w + 10; px += 2) {
      const wld = this.s2w(px, 0);
      const wy = evaluate(this.params, wld.x);
      const p = this.w2s(wld.x, wy);
      if (p.y >= -50 && p.y <= h + 50) {
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();

    const v = vertexOf(this.params);
    const vs = this.w2s(v.x, v.y);
    if (vs.x >= -10 && vs.x <= w + 10 && vs.y >= -10 && vs.y <= h + 10) {
      ctx.beginPath();
      ctx.arc(vs.x, vs.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = CURVE;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

export function GraphCanvas({ params }: { params: QuadParams }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<Plot | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const plot = new Plot(canvas, container, params);
    plotRef.current = plot;

    const onMouseDown = (e: MouseEvent) => {
      plot.panStart(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => plot.panMove(e.clientX, e.clientY);
    const onMouseUp = () => plot.panEnd();
    const touchDist = (e: TouchEvent) =>
      Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        plot.panEnd();
        plot.pinchStart(touchDist(e));
      } else if (e.touches.length === 1) {
        plot.panStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        plot.pinchMove(touchDist(e));
      } else if (e.touches.length === 1) {
        plot.panMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) plot.pinchEnd();
      if (e.touches.length === 1) {
        // Pinch → one finger left: continue as a pan from that finger.
        plot.panStart(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 0) {
        plot.panEnd();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      plot.zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const ro = new ResizeObserver(() => plot.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("wheel", onWheel);
      plotRef.current = null;
    };
  }, [params]);

  const control = (
    action: "in" | "out" | "reset",
    icon: React.ReactNode,
    label: string,
  ) => (
    <button
      type="button"
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md border border-border bg-white/95 text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-ring"
      onClick={(e) => {
        e.stopPropagation();
        const p = plotRef.current;
        if (!p) return;
        if (action === "in") p.zoomIn();
        else if (action === "out") p.zoomOut();
        else p.reset();
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-white"
    >
      <canvas ref={canvasRef} className="absolute top-0 left-0" />
      <div className="absolute right-1.5 bottom-1.5 flex gap-1">
        {control("out", <Minus className="size-3.5" />, "Кішірейту")}
        {control("in", <Plus className="size-3.5" />, "Үлкейту")}
        {control("reset", <RotateCcw className="size-3.5" />, "Қалпына келтіру")}
      </div>
    </div>
  );
}
