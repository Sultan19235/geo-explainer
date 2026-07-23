"use client";

// Bridges the shell's fullscreen + font-size controls into the theory slot,
// which the shell renders opaquely (it can't reach into the theory header to
// place a button). The doc-layout theory player reads this to draw its own
// fullscreen toggle and — while fullscreen, when the global header is
// covered — an A−/A+ control.

import { createContext, useContext } from "react";
import type { Lang } from "@/lib/i18n/strings";

export type TheoryChrome = {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  fontIndex: number;
  onFontChange: (index: number) => void;
  lang: Lang;
};

const TheoryChromeContext = createContext<TheoryChrome | null>(null);

export const TheoryChromeProvider = TheoryChromeContext.Provider;

export function useTheoryChrome(): TheoryChrome | null {
  return useContext(TheoryChromeContext);
}
