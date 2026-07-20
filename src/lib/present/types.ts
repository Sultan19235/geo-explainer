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
