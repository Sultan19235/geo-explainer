"use client";

// Coordinate-ray widgets (1.2 Координаталық сәуле).
//
// RaySvg is the one drawing surface — a ray with ticks 0…max, numbers under
// the ticks and markers (letter + optional emoji) standing on it. It is shared
// by the coord-ray slide and by the word-problem scene, so every ray in the
// deck looks the same.
//
// CoordRaySlide adds the classroom interaction on top of it, one per mode:
// show / build (→ presses) / reveal (click a point) / mark (click a tick) /
// jump (one hop per click).

import { useState } from "react";
import { Eye, Footprints, RotateCcw } from "lucide-react";
import type { Lang } from "@/lib/i18n/strings";
import type { PresentRay, PresentSlide } from "@/lib/present/types";
import { pickPresentText } from "@/lib/present/types";
import { MathText } from "@/components/quiz/math-text";
import { SlideHeading } from "./slide-view";

const RAY_INK = "#1a1a2e";
const POINT_BLUE = "#2563eb";
const POINT_GREEN = "#059669";
const POINT_RED = "#dc2626";

const VIEW_W = 1000;
const X_START = 55;
const X_END = 945;

export type RayMarker = {
  value: number;
  name?: string;
  icon?: string;
  /** Print the coordinate under the tick, in the marker's color. */
  showValue?: boolean;
  /** Print "?" instead of the coordinate. */
  unknown?: boolean;
  color?: string;
  /** Hollow dot — a spot already passed through. */
  faded?: boolean;
};

/**
 * The ray itself. Pure drawing: everything interactive is driven by the
 * callbacks (onTick) and by whatever markers the caller hands in.
 */
export function RaySvg({
  max,
  markers,
  labels = "auto",
  arc,
  onTick,
  hotTicks,
  wrongTick,
  maxHeight = "42vh",
}: {
  max: number;
  markers: RayMarker[];
  labels?: "auto" | "all" | "none" | number[];
  /** Dashed hop drawn over the ray (jump mode). */
  arc?: { from: number; to: number } | null;
  /** Makes ticks clickable (mark mode: all of them; reveal mode: hotTicks). */
  onTick?: (value: number) => void;
  /** Restricts the click targets to these coordinates. */
  hotTicks?: number[];
  /** Tick to flash red — a wrong guess. */
  wrongTick?: number | null;
  maxHeight?: string;
}) {
  const step = (X_END - X_START) / (max + 1);
  const xOf = (value: number) => X_START + value * step;

  const hasIcons = markers.some((marker) => marker.icon);
  const baseY = hasIcons || arc ? 128 : 62;
  const height = baseY + 66;

  // Coordinates printed by markers win over the plain tick numbers.
  const takenLabels = new Set(
    markers.filter((m) => m.showValue || m.unknown).map((m) => m.value),
  );
  const isLabelled = (value: number): boolean => {
    if (takenLabels.has(value)) return false;
    if (labels === "none") return false;
    if (labels === "all") return true;
    if (Array.isArray(labels)) return labels.includes(value);
    return step >= 38 || value % 5 === 0;
  };

  const ticks = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      className="w-full"
      style={{ maxHeight }}
      role="img"
    >
      <defs>
        <marker
          id="ray-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={RAY_INK} />
        </marker>
        <marker
          id="ray-hop"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={POINT_BLUE} />
        </marker>
      </defs>

      <line
        x1={X_START - 18}
        y1={baseY}
        x2={X_END + 36}
        y2={baseY}
        stroke={RAY_INK}
        strokeWidth={3}
        markerEnd="url(#ray-arrow)"
      />

      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={xOf(value)}
            y1={baseY - (value === 0 ? 13 : 9)}
            x2={xOf(value)}
            y2={baseY + (value === 0 ? 13 : 9)}
            stroke={value === 0 ? RAY_INK : "#9ca3af"}
            strokeWidth={value === 0 ? 3 : 2}
          />
          {isLabelled(value) && (
            <text
              x={xOf(value)}
              y={baseY + 44}
              textAnchor="middle"
              fontSize={27}
              fill="#6b7280"
            >
              {value}
            </text>
          )}
          {onTick && (!hotTicks || hotTicks.includes(value)) && (
            <rect
              x={xOf(value) - step / 2}
              y={baseY - 34}
              width={step}
              height={78}
              rx={6}
              onClick={() => onTick(value)}
              className="cursor-pointer fill-transparent hover:fill-[#dbeafe]"
            />
          )}
          {wrongTick === value && (
            <circle
              cx={xOf(value)}
              cy={baseY}
              r={16}
              fill="none"
              stroke={POINT_RED}
              strokeWidth={4}
            />
          )}
        </g>
      ))}

      {arc && (
        <path
          d={`M ${xOf(arc.from)} ${baseY - 12} C ${xOf(arc.from)} ${baseY - 90}, ${xOf(arc.to)} ${baseY - 90}, ${xOf(arc.to)} ${baseY - 14}`}
          fill="none"
          stroke={POINT_BLUE}
          strokeWidth={3}
          strokeDasharray="8 7"
          markerEnd="url(#ray-hop)"
        />
      )}

      {markers.map((marker, i) => {
        const color = marker.color ?? POINT_BLUE;
        const x = xOf(marker.value);
        return (
          <g
            key={`${marker.name ?? "m"}-${marker.value}-${i}`}
            className="animate-in fade-in duration-300"
          >
            {marker.icon && (
              <text x={x} y={baseY - 66} textAnchor="middle" fontSize={52}>
                {marker.icon}
              </text>
            )}
            {marker.name && (
              <text
                x={x}
                y={baseY - 22}
                textAnchor="middle"
                fontSize={34}
                fontWeight={700}
                fontStyle="italic"
                fill={color}
              >
                {marker.name}
              </text>
            )}
            <circle
              cx={x}
              cy={baseY}
              r={marker.faded ? 7 : 10}
              fill={marker.faded ? "#ffffff" : color}
              stroke={color}
              strokeWidth={marker.faded ? 3 : 0}
              opacity={marker.faded ? 0.55 : 1}
            />
            {(marker.showValue || marker.unknown) && (
              <text
                x={x}
                y={baseY + 46}
                textAnchor="middle"
                fontSize={31}
                fontWeight={700}
                fill={color}
              >
                {marker.unknown ? "?" : marker.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The ray plus its unit caption — the shape used inside word problems too. */
export function RayScene({
  ray,
  lang,
  markers,
  maxHeight,
  ...rest
}: {
  ray: PresentRay;
  lang: Lang;
  markers?: RayMarker[];
  maxHeight?: string;
  arc?: { from: number; to: number } | null;
  onTick?: (value: number) => void;
  hotTicks?: number[];
  wrongTick?: number | null;
}) {
  return (
    <div className="w-full">
      <RaySvg
        max={ray.max}
        labels={ray.labels}
        markers={markers ?? ray.points.map((p) => ({ ...p, showValue: !p.unknown }))}
        maxHeight={maxHeight}
        {...rest}
      />
      {ray.unit && (
        <p className="mt-[0.6em] text-center text-[clamp(15px,1.4vw,23px)] text-[#6b7280]">
          <MathText text={pickPresentText(ray.unit, lang)} />
        </p>
      )}
    </div>
  );
}

export function CoordRaySlide({
  slide,
  step,
  lang,
}: {
  slide: Extract<PresentSlide, { type: "coord-ray" }>;
  step: number;
  lang: Lang;
}) {
  const mode = slide.mode ?? "show";
  const ray: PresentRay = {
    max: slide.max,
    points: slide.points,
    labels: slide.labels,
    unit: slide.unit,
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1250px] flex-col px-[3vw] py-[3vh]">
      <SlideHeading text={pickPresentText(slide.heading, lang)} />
      {slide.prompt && (
        <p className="text-center text-[clamp(19px,1.9vw,30px)] font-semibold text-[#1a1a2e]">
          <MathText text={pickPresentText(slide.prompt, lang)} />
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[2vh]">
        {mode === "reveal" ? (
          <RevealRay ray={ray} lang={lang} />
        ) : mode === "mark" ? (
          <MarkRay ray={ray} lang={lang} />
        ) : mode === "jump" ? (
          <JumpRay ray={ray} jumps={slide.jumps ?? []} lang={lang} />
        ) : (
          <RayScene
            ray={ray}
            lang={lang}
            markers={visibleMarkers(ray, mode === "build" ? step : undefined)}
          />
        )}
      </div>

      {slide.note && (
        <div className="mx-auto max-w-[34em] rounded-r-xl border-l-[6px] border-[#2563eb] bg-[#eaf2fe] px-[1em] py-[0.6em] text-[clamp(16px,1.6vw,26px)] font-semibold text-[#1e3a8a]">
          <MathText text={pickPresentText(slide.note, lang)} />
        </div>
      )}
    </div>
  );
}

/** show/build: the first `step + 1` points (all of them when step is undefined). */
function visibleMarkers(ray: PresentRay, step?: number): RayMarker[] {
  const points = step === undefined ? ray.points : ray.points.slice(0, step + 1);
  return points.map((p) => ({ ...p, showValue: !p.unknown }));
}

function RevealRay({ ray, lang }: { ray: PresentRay; lang: Lang }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const hidden = ray.points.filter((p) => !p.given).length;
  const allOpen = revealed.size === hidden;

  const markers: RayMarker[] = ray.points.map((point, i) => ({
    ...point,
    showValue: Boolean(point.given) || revealed.has(i),
    color: point.given ? "#6b7280" : POINT_BLUE,
  }));

  return (
    <>
      <p className="text-[clamp(15px,1.4vw,22px)] text-[#9ca3af]">
        {lang === "ru" ? "Нажми на точку" : "Нүктені бас"}
      </p>
      <RayScene
        ray={ray}
        lang={lang}
        markers={markers}
        hotTicks={ray.points.filter((p) => !p.given).map((p) => p.value)}
        onTick={(value) => {
          const index = ray.points.findIndex(
            (p) => !p.given && p.value === value,
          );
          if (index >= 0) setRevealed((prev) => new Set(prev).add(index));
        }}
      />
      <div className="flex min-h-[clamp(44px,7vh,64px)] flex-wrap items-center justify-center gap-[1.2em] text-[clamp(24px,2.6vw,40px)] font-bold text-[#2563eb]">
        {ray.points.map((point, i) =>
          revealed.has(i) || point.given ? (
            <span key={i} className="animate-in fade-in zoom-in-95 duration-200">
              {point.name}({point.value})
            </span>
          ) : null,
        )}
      </div>
      {!allOpen && (
        <button
          type="button"
          onClick={() =>
            setRevealed(new Set(ray.points.map((_, i) => i)))
          }
          className="flex items-center gap-2 rounded-lg border-[1.5px] border-[#d8dde5] bg-white px-3 py-1.5 text-[clamp(13px,1.1vw,17px)] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
        >
          <Eye className="size-[1em]" aria-hidden />
          {lang === "ru" ? "Показать все" : "Барлығын ашу"}
        </button>
      )}
    </>
  );
}

function MarkRay({ ray, lang }: { ray: PresentRay; lang: Lang }) {
  const targets = ray.points
    .map((point, i) => ({ point, i }))
    .filter(({ point }) => !point.given);
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number | null>(null);
  const done = placed.size === targets.length;

  const onTick = (value: number) => {
    const hit = targets.find(
      ({ point, i }) => point.value === value && !placed.has(i),
    );
    if (!hit) {
      // A tick that is already occupied is not a mistake — just ignore it.
      const occupied = ray.points.some((point) => point.value === value);
      if (!occupied) setWrong(value);
      return;
    }
    setWrong(null);
    setPlaced((prev) => new Set(prev).add(hit.i));
  };

  const markers: RayMarker[] = ray.points
    .map((point, i) => ({ point, i }))
    .filter(({ point, i }) => point.given || placed.has(i))
    .map(({ point, i }) => ({
      ...point,
      showValue: true,
      color: point.given ? "#6b7280" : placed.has(i) ? POINT_GREEN : POINT_BLUE,
    }));

  const remaining = targets.filter(({ i }) => !placed.has(i));

  return (
    <>
      <p className="text-[clamp(15px,1.4vw,22px)] text-[#9ca3af]">
        {lang === "ru"
          ? "Нажми на нужный штрих"
          : "Керекті штрихты бас"}
      </p>
      <RayScene
        ray={ray}
        lang={lang}
        markers={markers}
        onTick={done ? undefined : onTick}
        wrongTick={wrong}
      />
      <div className="flex min-h-[clamp(50px,8vh,74px)] flex-wrap items-center justify-center gap-[0.7em]">
        {remaining.map(({ point, i }) => (
          <span
            key={i}
            className="rounded-xl border-[2.5px] border-dashed border-[#d8dde5] px-[0.6em] py-[0.15em] text-[clamp(24px,2.6vw,40px)] font-bold text-[#6b7280]"
          >
            {point.name}({point.value})
          </span>
        ))}
        {done && (
          <span className="text-[clamp(24px,2.6vw,40px)] font-bold text-[#059669] animate-in fade-in zoom-in-95 duration-200">
            {lang === "ru" ? "Все точки на месте! ✓" : "Барлық нүкте орнында! ✓"}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {!done && (
          <button
            type="button"
            onClick={() => {
              setWrong(null);
              setPlaced(new Set(targets.map(({ i }) => i)));
            }}
            className="flex items-center gap-2 rounded-lg border-[1.5px] border-[#d8dde5] bg-white px-3 py-1.5 text-[clamp(13px,1.1vw,17px)] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
          >
            <Eye className="size-[1em]" aria-hidden />
            {lang === "ru" ? "Показать ответ" : "Жауабын көрсету"}
          </button>
        )}
        {placed.size > 0 && (
          <button
            type="button"
            onClick={() => {
              setPlaced(new Set());
              setWrong(null);
            }}
            className="flex items-center gap-2 rounded-lg border-[1.5px] border-[#d8dde5] bg-white px-3 py-1.5 text-[clamp(13px,1.1vw,17px)] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
          >
            <RotateCcw className="size-[1em]" aria-hidden />
            {lang === "ru" ? "Заново" : "Қайтадан"}
          </button>
        )}
      </div>
    </>
  );
}

function JumpRay({
  ray,
  jumps,
  lang,
}: {
  ray: PresentRay;
  jumps: number[];
  lang: Lang;
}) {
  const [count, setCount] = useState(0);
  const start = ray.points[0];

  // Every position the traveller has stood on, start included.
  const path = [start.value];
  for (let i = 0; i < count; i++) path.push(path[i] + jumps[i]);
  const current = path[path.length - 1];

  // The letter names the starting point, so it stays behind once the
  // traveller (the icon) hops away.
  const markers: RayMarker[] = [
    ...path.slice(0, -1).map((value) => ({
      value,
      faded: true,
      name: count > 0 && value === start.value ? start.name : undefined,
      color: "#9ca3af",
    })),
    {
      ...start,
      name: count === 0 ? start.name : undefined,
      value: current,
      showValue: true,
      color: POINT_BLUE,
    },
  ];

  return (
    <>
      <RayScene
        ray={ray}
        lang={lang}
        markers={markers}
        arc={count > 0 ? { from: path[count - 1], to: current } : null}
      />
      <p className="min-h-[1.4em] text-center text-[clamp(20px,2.1vw,32px)] font-bold text-[#1a1a2e]">
        {path.map((value, i) => (
          <span key={i}>
            {i > 0 && <span className="text-[#9ca3af]"> → </span>}
            <span className={i === path.length - 1 ? "text-[#2563eb]" : ""}>
              {value}
            </span>
          </span>
        ))}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCount((c) => Math.min(c + 1, jumps.length))}
          disabled={count >= jumps.length}
          className="flex items-center gap-2 rounded-xl border-[2px] border-[#2563eb] bg-[#2563eb] px-4 py-2 text-[clamp(15px,1.4vw,22px)] font-bold text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-30"
        >
          <Footprints className="size-[1em]" aria-hidden />
          {lang === "ru" ? "Прыжок" : "Секіру"}
          {count < jumps.length && (
            <span className="font-normal opacity-80">
              ({jumps[count] > 0 ? `+${jumps[count]}` : jumps[count]})
            </span>
          )}
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={() => setCount(0)}
            className="flex items-center gap-2 rounded-xl border-[1.5px] border-[#d8dde5] bg-white px-3 py-2 text-[clamp(13px,1.1vw,17px)] font-semibold text-[#6b7280] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
          >
            <RotateCcw className="size-[1em]" aria-hidden />
            {lang === "ru" ? "Заново" : "Қайтадан"}
          </button>
        )}
      </div>
    </>
  );
}
