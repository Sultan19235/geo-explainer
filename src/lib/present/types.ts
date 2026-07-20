// Presentation file format — declarative slides for teacher-led classroom
// presentations (ordinary arithmetic topics, no GeoGebra). A file describes
// WHAT is on each slide; the engine owns every pixel, exactly like drill
// generators. Files are uploaded as .js calling registerPresentation({...}).
//
// Format reference for authors: docs/PRESENTATION_FORMAT.md.

import type { Lang } from "@/lib/i18n/strings";

/** Bare string means Kazakh; ru falls back to kz (same as lesson files). */
export type PresentText = string | { kz: string; ru?: string };

export type PresentTextVariant = "normal" | "rule" | "fact" | "example";

export type PresentTextStep = {
  /** MathText format: plain text with inline $...$ KaTeX segments. */
  text: PresentText;
  variant?: PresentTextVariant;
};

export type PresentFlashcard = {
  /** Big text on the card (a number, a question…). */
  front: PresentText;
  /** yes/no verdict revealed on click — the class answers by raising hands. */
  verdict?: "yes" | "no";
  /** Short explanation shown under the verdict. */
  answer?: PresentText;
};

export type PresentOralItem = {
  q: string;
  a: string;
};

/** One marker sitting on a coordinate ray. */
export type PresentRayPoint = {
  /** Letter drawn above the dot (A, B, O). Omit for icon-only actors. */
  name?: string;
  /** Coordinate — a whole number between 0 and the ray's max. */
  value: number;
  /** Emoji drawn above the point (🏠 🐕 🦗) — the textbook's picture. */
  icon?: string;
  /** Coordinate printed from the start (it is given, not asked). */
  given?: boolean;
  /** Draw "?" instead of the coordinate — the unknown of the problem. */
  unknown?: boolean;
};

/** Which numbers are printed under the ticks. */
export type PresentRayLabels = "auto" | "all" | "none" | number[];

/** A coordinate ray: ticks 0…max plus the points standing on it. */
export type PresentRay = {
  /** Rightmost whole number on the ray (2–40). */
  max: number;
  points: PresentRayPoint[];
  labels?: PresentRayLabels;
  /** Caption under the ray: "1 бірлік кесінді = 40 м". */
  unit?: PresentText;
};

/**
 * show   — every point drawn with its coordinate (the textbook figure);
 * build  — points appear one per → press (the ray being constructed);
 * reveal — letters visible, coordinates hidden until a point is clicked;
 * mark   — empty ray, the class clicks the tick where each point belongs;
 * jump   — one marker hops along the ray, one click per jump.
 */
export type PresentRayMode = "show" | "build" | "reveal" | "mark" | "jump";

export type PresentSlide =
  | {
      type: "title";
      title: PresentText;
      subtitle?: PresentText;
    }
  | {
      /** Theory text revealed step by step (→ advances within the slide). */
      type: "text";
      heading?: PresentText;
      steps: PresentTextStep[];
    }
  | {
      /** Hands-up cards: teacher flips through, class votes, click reveals. */
      type: "flashcards";
      heading?: PresentText;
      prompt?: PresentText;
      cards: PresentFlashcard[];
    }
  | {
      /** One big number; clicking a digit names its place and its value. */
      type: "place-value";
      heading?: PresentText;
      number: number | string;
      note?: PresentText;
    }
  | {
      /** Number decomposes into разрядтық қосылғыштар (two forms, stepped). */
      type: "expand";
      heading?: PresentText;
      number: number | string;
    }
  | {
      /** Same digit in several numbers → its value depends on position. */
      type: "digit-meaning";
      heading?: PresentText;
      digit: number;
      numbers: (number | string)[];
      note?: PresentText;
    }
  | {
      /** Кластар/разрядтар table; teacher drops numbers in, adds their own. */
      type: "class-table";
      heading?: PresentText;
      numbers: (number | string)[];
    }
  | {
      /** Oral-arithmetic grid: click a card to reveal its answer. */
      type: "oral";
      heading?: PresentText;
      items: PresentOralItem[];
    }
  | ({
      /** Coordinate ray — read, mark or hop along it (see PresentRayMode). */
      type: "coord-ray";
      heading?: PresentText;
      prompt?: PresentText;
      mode?: PresentRayMode;
      /** mode "jump" only: the signed hops, in order (−2 = two units left). */
      jumps?: number[];
      note?: PresentText;
    } & PresentRay)
  | {
      /**
       * Word problem the class solves together: story, a ray picture of it,
       * a voted answer, then the solution unfolded line by line.
       */
      type: "word-problem";
      heading?: PresentText;
      statement: PresentText;
      ray?: PresentRay;
      question: PresentText;
      /** Answer options — the class votes, a click checks the pick. */
      choices?: { text: PresentText; correct?: boolean }[];
      /** Solution lines, revealed one per click. */
      steps?: PresentTextStep[];
      answer: PresentText;
    };

export type Presentation = {
  apiVersion: 1;
  id: string;
  title: PresentText;
  subtitle?: PresentText;
  slides: PresentSlide[];
};

export function pickPresentText(
  value: PresentText | undefined,
  lang: Lang,
): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return lang === "ru" && value.ru ? value.ru : value.kz;
}
