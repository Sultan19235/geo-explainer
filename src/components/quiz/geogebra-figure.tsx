"use client";

// GeoGebra applet for pack questions: loads deployggb.js once, injects an
// applet and replays the pack's command list. Same parameters as the legacy
// uploaded quizzes (toolbars off, zoom on).

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PackGeoGebra } from "@/lib/quiz/pack";

type GgbApi = { evalCommand: (cmd: string) => void };

declare global {
  interface Window {
    GGBApplet?: new (
      params: Record<string, unknown>,
      standalone: boolean,
    ) => { inject: (elementId: string) => void };
  }
}

let deployScript: Promise<void> | null = null;

function loadDeployScript(): Promise<void> {
  if (window.GGBApplet) return Promise.resolve();
  if (!deployScript) {
    deployScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.geogebra.org/apps/deployggb.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        deployScript = null; // allow a retry on the next question
        reject(new Error("deployggb.js failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return deployScript;
}

export function GeoGebraFigure({
  figure,
  extraCommands,
  className,
}: {
  figure: PackGeoGebra;
  // Replayed once on the live applet after it's ready (solution highlights).
  // Changing the list later does nothing — the card remounts per question.
  extraCommands?: string[];
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GgbApi | null>(null);
  const extraApplied = useRef(false);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const height = figure.height ?? 360;

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    apiRef.current = null;
    extraApplied.current = false;
    setState("loading");

    loadDeployScript()
      .then(() => {
        if (cancelled || !window.GGBApplet) return;
        host.innerHTML = "";
        const inner = document.createElement("div");
        inner.id = "ggb-" + Math.random().toString(36).slice(2, 10);
        inner.style.width = "100%";
        inner.style.height = "100%";
        host.appendChild(inner);
        try {
          new window.GGBApplet(
            {
              appName: figure.view === "3d" ? "3d" : "classic",
              width: host.clientWidth || 320,
              height,
              showToolBar: false,
              showAlgebraInput: false,
              showMenuBar: false,
              showResetIcon: false,
              enableShiftDragZoom: true,
              enableRightClick: false,
              enableLabelDrags: false,
              showZoomButtons: true,
              capturingThreshold: null,
              language: "en",
              appletOnLoad: (api: GgbApi) => {
                for (const cmd of figure.commands) {
                  try {
                    api.evalCommand(cmd);
                  } catch {
                    // one bad command shouldn't blank the figure
                  }
                }
                apiRef.current = api;
                if (!cancelled) setState("ready");
              },
            },
            true,
          ).inject(inner.id);
        } catch {
          if (!cancelled) setState("failed");
        }
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
      host.innerHTML = "";
    };
  }, [figure, height]);

  // Solution highlights: run on the already-built figure the moment both are
  // there (applet ready + commands provided), whichever comes second — the
  // student may answer before the applet finished loading, or the figure may
  // first mount at reveal time (auto-open when it was never toggled open).
  useEffect(() => {
    if (state !== "ready" || !extraCommands || extraCommands.length === 0) return;
    if (extraApplied.current) return;
    extraApplied.current = true;
    const api = apiRef.current;
    if (!api) return;
    for (const cmd of extraCommands) {
      try {
        api.evalCommand(cmd);
      } catch {
        // one bad highlight shouldn't break the rest
      }
    }
  }, [state, extraCommands]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-white",
        className,
      )}
      style={{ height }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {state !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white">
          {state === "loading" ? (
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
          ) : (
            <span className="text-sm text-muted-foreground">⚠︎</span>
          )}
        </div>
      )}
    </div>
  );
}
