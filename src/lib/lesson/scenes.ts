// Parametrized GeoGebra scene library. A scene is pure data: commands that
// build the construction once (`init`) plus a list of named states (`steps`)
// the player applies as the teacher walks through a problem. Every dimension
// is computed from the pack's params, so the model always matches the text.

import { formatNumber, type Params } from "./types";

export type StyleProps = {
  color?: [number, number, number];
  thickness?: number;
  filling?: number;
  caption?: string;
  label?: boolean;
  lineStyle?: number;
  fixed?: boolean;
};

export type SceneOp =
  | { cmd: string }
  | { show: string[] }
  | { hide: string[] }
  | { set: [obj: string, value: number] }
  | { anim: { obj: string; to: number; ms?: number; delay?: number } }
  | { style: { obj: string } & StyleProps };

export type SceneControl = {
  obj: string;
  label: { kz: string; ru?: string };
  min: number;
  max: number;
  step: number;
};

export type SceneStep = {
  ops: SceneOp[];
  showControl?: boolean;
};

// 3D view bounding box: [xmin, xmax, ymin, ymax, zmin, zmax]. Scenes build at
// the problem's real coordinates (length 2 in the text is length 2 in the
// model) and the camera fits this box, so any size frames well on screen.
export type FitBox = [number, number, number, number, number, number];

export type BuiltScene = {
  init: SceneOp[];
  steps: SceneStep[];
  control?: SceneControl;
  viewDirection: string;
  fit?: FitBox;
};

export type SceneBuilder = (params: Params) => BuiltScene;

const BLUE: [number, number, number] = [37, 99, 235];
const ORANGE: [number, number, number] = [234, 88, 12];
const SLATE: [number, number, number] = [100, 116, 139];
const DARK: [number, number, number] = [55, 65, 81];
const LIQUID: [number, number, number] = [59, 130, 246];

function num(params: Params, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function fmt(value: number): string {
  // GeoGebra command literal with enough precision.
  return String(Math.round(value * 10000) / 10000);
}

const PROLOGUE: SceneOp[] = [
  { cmd: "ShowAxes(false)" },
  { cmd: "ShowGrid(false)" },
];

function segment(
  name: string,
  from: string,
  to: string,
  style: StyleProps,
): SceneOp[] {
  return [
    { cmd: `${name} = Segment(${from}, ${to})` },
    { style: { obj: name, label: false, fixed: true, ...style } },
  ];
}

// ─── Scene: cylinder with labeled elements ──────────────────────────────────
// Used by the theory sections and by plain "given R and H" problems.
// params: R, H; labels: "symbolic" shows R/H letters, otherwise real values.
function cylinderElements(params: Params): BuiltScene {
  const R = num(params, "R", 2);
  const H = num(params, "H", 4);
  const symbolic = params.labels === "symbolic";
  const capR = symbolic ? "R" : `R = ${formatNumber(R)}`;
  const capH = symbolic ? "H" : `H = ${formatNumber(H)}`;
  const capD = symbolic ? "d = 2R" : `d = ${formatNumber(2 * R)}`;

  // Real coordinates — the camera fit box does the framing.
  const r = fmt(R);
  const h = fmt(H);
  const pad = Math.max(R, H) * 0.18;

  const init: SceneOp[] = [
    ...PROLOGUE,
    { cmd: "O = (0, 0, 0)" },
    { cmd: `T = (0, 0, ${h})` },
    { style: { obj: "O", label: false, fixed: true } },
    { style: { obj: "T", label: false, fixed: true } },
    { hide: ["O", "T"] },
    { cmd: `cyl = Cylinder(O, T, ${r})` },
    { style: { obj: "cyl", color: SLATE, filling: 0.28, label: false, fixed: true } },
    { cmd: `baseBottom = Circle(O, ${r}, zAxis)` },
    { cmd: `baseTop = Circle(T, ${r}, zAxis)` },
    { style: { obj: "baseBottom", color: DARK, thickness: 3, label: false, fixed: true } },
    { style: { obj: "baseTop", color: DARK, thickness: 3, label: false, fixed: true } },
    ...segment("axis", "O", "T", {
      color: ORANGE,
      thickness: 4,
      lineStyle: 2,
      caption: capH,
    }),
    { cmd: `A = (${r}, 0, 0)` },
    { cmd: `B = (${r}, 0, ${h})` },
    { style: { obj: "A", label: false, fixed: true } },
    { style: { obj: "B", label: false, fixed: true } },
    { hide: ["A", "B"] },
    ...segment("radSeg", "O", "A", {
      color: BLUE,
      thickness: 5,
      caption: capR,
    }),
    ...segment("heightSeg", "A", "B", {
      color: BLUE,
      thickness: 5,
      caption: capH,
    }),
    ...segment("diamSeg", `(-${r}, 0, 0)`, "A", {
      color: DARK,
      thickness: 4,
      lineStyle: 2,
      caption: capD,
    }),
    {
      cmd: `rect = Polygon((-${r}, 0, 0), (${r}, 0, 0), (${r}, 0, ${h}), (-${r}, 0, ${h}))`,
    },
    { style: { obj: "rect", color: ORANGE, filling: 0.35, label: false, fixed: true } },
  ];

  const varying = ["axis", "radSeg", "heightSeg", "diamSeg", "rect"];
  const state = (visible: string[]): SceneStep => ({
    ops: [
      { hide: varying.filter((name) => !visible.includes(name)) },
      ...(visible.length > 0 ? [{ show: visible } as SceneOp] : []),
    ],
  });

  return {
    init,
    viewDirection: "SetViewDirection((1.2, -1.6, 0.55))",
    fit: [-R - pad, R + pad, -R - pad, R + pad, -pad, H + pad],
    steps: [
      state([]), // 0 body only
      state(["axis"]), // 1 axis (height along the axis)
      state(["axis", "radSeg"]), // 2 + radius
      state(["axis", "radSeg", "diamSeg"]), // 3 + diameter
      state(["rect"]), // 4 axial section
      state(["radSeg", "heightSeg"]), // 5 R and H labeled (formulas state)
    ],
  };
}

// ─── Scene: lateral surface unrolling into a rectangle ──────────────────────
// params: R, H. Control `w`: 1 = rolled cylinder, →0 = flat 2πR × H sheet.
function cylinderUnfold(params: Params): BuiltScene {
  const R = num(params, "R", 2);
  const H = num(params, "H", 4);
  const r = fmt(R);
  const h = fmt(H);
  const C = 2 * Math.PI * R;
  const halfC = fmt(C / 2);

  const init: SceneOp[] = [
    ...PROLOGUE,
    { cmd: "w = 1" },
    // Unroll morph: at w=1 a full cylinder of radius R, as w→0 a flat sheet
    // of width 2πR. Point at arc length s sits at angle w·s/R on a circle of
    // radius R/w, tangent to the sheet plane. The (1-w) shift keeps the flat
    // sheet centered instead of running off to one side.
    {
      cmd: `side = Surface((${r}/w) sin(w s / ${r}) - ${halfC} (1 - w), (${r}/w) (1 - cos(w s / ${r})), v, s, 0, ${fmt(C)}, v, 0, ${h})`,
    },
    { style: { obj: "side", color: BLUE, filling: 0.4, label: false, fixed: true } },
    // Ghost of the original cylinder so the unroll reads as "the same shape".
    { cmd: `ghostBottom = Circle((0, ${r}, 0), ${r}, zAxis)` },
    { cmd: `ghostTop = Circle((0, ${r}, ${h}), ${r}, zAxis)` },
    { style: { obj: "ghostBottom", color: SLATE, thickness: 2, lineStyle: 2, label: false, fixed: true } },
    { style: { obj: "ghostTop", color: SLATE, thickness: 2, lineStyle: 2, label: false, fixed: true } },
    // Flat-state dimension labels (shown on the last step).
    ...segment("widthSeg", `(-${halfC}, 0, 0)`, `(${halfC}, 0, 0)`, {
      color: ORANGE,
      thickness: 5,
      caption: "2πR",
    }),
    ...segment("heightSeg2", `(${halfC}, 0, 0)`, `(${halfC}, 0, ${h})`, {
      color: ORANGE,
      thickness: 5,
      caption: "H",
    }),
  ];

  const pad = Math.max(C / 2, H) * 0.14;
  return {
    init,
    viewDirection: "SetViewDirection((0.4, -1.7, 0.5))",
    // Covers both states: the flat 2πR-wide sheet and the rolled cylinder.
    fit: [-C / 2 - pad, C / 2 + pad, -pad, 2 * R + pad, -pad, H + pad],
    control: {
      obj: "w",
      label: { kz: "Жазу", ru: "Развернуть" },
      min: 0.02,
      max: 1,
      step: 0.01,
    },
    steps: [
      {
        ops: [
          { hide: ["widthSeg", "heightSeg2", "ghostBottom", "ghostTop"] },
          { set: ["w", 1] },
        ],
      },
      {
        ops: [
          { hide: ["widthSeg", "heightSeg2"] },
          { show: ["ghostBottom", "ghostTop"] },
          { anim: { obj: "w", to: 0.02, ms: 1800 } },
        ],
        showControl: true,
      },
      {
        ops: [
          { show: ["ghostBottom", "ghostTop", "widthSeg", "heightSeg2"] },
          { set: ["w", 0.02] },
        ],
        showControl: true,
      },
    ],
  };
}

// ─── Scene: square wrapped into a cylinder (problem №23) ────────────────────
// params: a — square side. Control `w`: 0 = flat square, 1 = fully wrapped
// cylinder whose base circumference equals a, so r = a/(2π) exactly.
function squareWrap(params: Params): BuiltScene {
  const a = num(params, "a", 2);
  // Real coordinates: the square is drawn at its true side length, so the
  // wrapped cylinder's radius is exactly a/(2π).
  const aD = fmt(a);
  const rWrap = a / (2 * Math.PI);
  const r = fmt(rWrap);

  const x = `(${aD}/(2 pi w)) sin(2 pi w s / ${aD})`;
  const y = `(${aD}/(2 pi w)) (1 - cos(2 pi w s / ${aD}))`;

  const init: SceneOp[] = [
    ...PROLOGUE,
    { cmd: "w = 0.02" },
    { cmd: `sheet = Surface(${x}, ${y}, v, s, 0, ${aD}, v, 0, ${aD})` },
    { style: { obj: "sheet", color: BLUE, filling: 0.42, label: false, fixed: true } },
    // Sheet borders so the square reads as a square while flat.
    { cmd: `edgeBottom = Curve(${x}, ${y}, 0, s, 0, ${aD})` },
    { cmd: `edgeTop = Curve(${x}, ${y}, ${aD}, s, 0, ${aD})` },
    { style: { obj: "edgeBottom", color: BLUE, thickness: 4, label: false, fixed: true, caption: `a = ${formatNumber(a)}` } },
    { style: { obj: "edgeTop", color: BLUE, thickness: 4, label: false, fixed: true } },
    { cmd: "edgeLeft = Segment((0, 0, 0), (0, 0, " + aD + "))" },
    { style: { obj: "edgeLeft", color: BLUE, thickness: 4, label: false, fixed: true } },
    { cmd: `ex = (${aD}/(2 pi w)) sin(2 pi w)` },
    { cmd: `ey = (${aD}/(2 pi w)) (1 - cos(2 pi w))` },
    { cmd: `edgeRight = Segment((ex, ey, 0), (ex, ey, ${aD}))` },
    { style: { obj: "edgeRight", color: BLUE, thickness: 4, label: false, fixed: true } },
    // Wrapped-state annotations: base circle, radius, filled base disc.
    { cmd: `baseC = Circle((0, ${r}, 0), ${r}, zAxis)` },
    { style: { obj: "baseC", color: ORANGE, thickness: 4, label: false, fixed: true } },
    ...segment("rSeg", `(0, ${r}, 0)`, "(0, 0, 0)", {
      color: ORANGE,
      thickness: 5,
      caption: `r = a/(2π) ≈ ${formatNumber(rWrap)}`,
    }),
    { cmd: `disc = Circle((0, ${r}, 0.001), ${r}, zAxis)` },
    {
      style: {
        obj: "disc",
        color: ORANGE,
        filling: 0.5,
        label: false,
        fixed: true,
        caption: `S = πr² ≈ ${formatNumber(Math.PI * rWrap * rWrap)}`,
      },
    },
  ];

  const annotations = ["baseC", "rSeg", "disc"];

  const pad = a * 0.14;
  return {
    init,
    viewDirection: "SetViewDirection((1.4, -1.5, 0.6))",
    // Covers the flat square (x ∈ [0, a]) and the wrapped cylinder
    // (a circle of radius r tangent to the origin).
    fit: [-rWrap - pad, a + pad, -pad, 2 * rWrap + pad, -pad, a + pad],
    control: {
      obj: "w",
      label: { kz: "Орау", ru: "Свернуть" },
      min: 0.02,
      max: 1,
      step: 0.01,
    },
    steps: [
      { ops: [{ hide: annotations }, { set: ["w", 0.02] }] }, // 0 flat square
      {
        ops: [{ hide: annotations }, { anim: { obj: "w", to: 1, ms: 2000 } }],
        showControl: true,
      }, // 1 wrap (or let the teacher drag)
      {
        ops: [{ hide: ["disc"] }, { show: ["baseC", "rSeg"] }, { set: ["w", 1] }],
        showControl: true,
      }, // 2 base circle + radius
      {
        ops: [{ show: ["baseC", "rSeg", "disc"] }, { set: ["w", 1] }],
      }, // 3 base area highlighted
    ],
  };
}

// ─── Scene: vessel + rising liquid (Archimedes, problem №25.11) ─────────────
// params: d — vessel diameter, dh — how much the level rises.
function cylinderLiquid(params: Params): BuiltScene {
  const d = num(params, "d", 9);
  const dh = num(params, "dh", 12);
  // Real coordinates: the vessel's diameter and the Δh rise are the problem's
  // true values. The initial level is display-only — the physics uses Δh.
  const R = d / 2;
  const L0 = dh * 0.4;
  const L1 = L0 + dh;
  const hv = L1 * 1.25;

  const r = fmt(R);
  const l0 = fmt(L0);
  const l1 = fmt(L1);
  const top = fmt(hv);
  const bodyA = fmt(R * 0.62); // stone half-width, safely inside the vessel
  const bodyC = fmt(dh * 0.35); // stone half-height
  const bodyRest = fmt(L0 * 0.9); // stone center once dropped
  const bzStart = hv + dh * 0.45; // stone hovering above the rim

  const init: SceneOp[] = [
    ...PROLOGUE,
    { cmd: `lvl = ${l0}` },
    { cmd: `bz = ${fmt(bzStart)}` },
    // Vessel: transparent side + bottom + rim.
    { cmd: `vessel = Surface(${r} cos(u), ${r} sin(u), v, u, 0, 2 pi, v, 0, ${top})` },
    { style: { obj: "vessel", color: SLATE, filling: 0.12, label: false, fixed: true } },
    { cmd: `vesselBase = Circle((0, 0, 0), ${r}, zAxis)` },
    { cmd: `vesselRim = Circle((0, 0, ${top}), ${r}, zAxis)` },
    { style: { obj: "vesselBase", color: SLATE, thickness: 3, label: false, fixed: true } },
    { style: { obj: "vesselRim", color: SLATE, thickness: 2, label: false, fixed: true } },
    // Liquid follows the dynamic level `lvl`.
    { cmd: "liquid = Cylinder((0, 0, 0), (0, 0, lvl), " + r + ")" },
    { style: { obj: "liquid", color: LIQUID, filling: 0.45, label: false, fixed: true } },
    // The dropped body (schematic stone — an ellipsoid at dynamic height bz).
    {
      cmd: `stone = Surface(${bodyA} sin(v) cos(u), ${bodyA} sin(v) sin(u), ${bodyC} cos(v) + bz, u, 0, 2 pi, v, 0, pi)`,
    },
    { style: { obj: "stone", color: DARK, filling: 0.85, label: false, fixed: true } },
    // Diameter across the rim, dashed — like the printed figure.
    ...segment("diamSeg", `(-${r}, 0, ${top})`, `(${r}, 0, ${top})`, {
      color: DARK,
      thickness: 3,
      lineStyle: 2,
      caption: `d = ${formatNumber(d)}`,
    }),
    // The risen band between the two levels = the body's volume.
    {
      cmd: `band = Surface(${r} cos(u), ${r} sin(u), v, u, 0, 2 pi, v, ${l0}, ${l1})`,
    },
    { style: { obj: "band", color: ORANGE, filling: 0.4, label: false, fixed: true } },
    ...segment("dhSeg", `(${r}, 0, ${l0})`, `(${r}, 0, ${l1})`, {
      color: ORANGE,
      thickness: 6,
      caption: `Δh = ${formatNumber(dh)}`,
    }),
    ...segment("l0Seg", `(-${r}, 0, ${l0})`, `(${r}, 0, ${l0})`, {
      color: LIQUID,
      thickness: 3,
      lineStyle: 2,
    }),
  ];

  const pad = hv * 0.12;
  return {
    init,
    viewDirection: "SetViewDirection((1.5, -1.3, 0.35))",
    // Frames the vessel itself; the waiting stone starts above the frame and
    // drops into view on step 1.
    fit: [-R - pad, R + pad, -R - pad, R + pad, -pad, hv + pad],
    steps: [
      {
        // 0 vessel with initial liquid, stone waiting above
        ops: [
          { hide: ["band", "dhSeg", "l0Seg", "stone"] },
          { set: ["lvl", L0] },
          { set: ["bz", bzStart] },
        ],
      },
      {
        // 1 stone drops in, level rises by exactly Δh
        ops: [
          { hide: ["band", "dhSeg"] },
          { show: ["stone", "l0Seg"] },
          { anim: { obj: "bz", to: Number(bodyRest), ms: 1200 } },
          { anim: { obj: "lvl", to: L1, ms: 1200, delay: 900 } },
        ],
      },
      {
        // 2 the risen band is marked: its height is Δh
        ops: [
          { show: ["stone", "l0Seg", "band", "dhSeg"] },
          { set: ["lvl", L1] },
          { set: ["bz", Number(bodyRest)] },
        ],
      },
    ],
  };
}

export const SCENES: Record<string, SceneBuilder> = {
  "cylinder-elements": cylinderElements,
  "cylinder-unfold": cylinderUnfold,
  "square-wrap": squareWrap,
  "cylinder-liquid": cylinderLiquid,
};

export function buildScene(id: string, params: Params): BuiltScene | null {
  const builder = SCENES[id];
  if (!builder) return null;
  return builder(params);
}
