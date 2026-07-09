"use client";

// Hosts one GeoGebra applet for the lesson player. The engine script is
// loaded once per page; the applet initializes lazily when scrolled into
// view, rebuilds when the scene changes, and applies scene steps (with
// smooth value animation when the teacher advances one step forward).
//
// Two content sources drive the same applet: registry scenes (sceneId +
// params → scenes.ts) and uploaded lesson-file programs (`program` — built
// via sceneFromFileProgram, executed against the lesson-runtime toolkit).

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { DraftingCompassIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n/strings";
import {
  clearConstruction,
  createApplet,
  loadGgbEngine,
  nextAppletId,
  type GgbApi,
} from "@/lib/lesson/ggb";
import { loadLessonRuntime } from "@/lib/lesson/file-loader";
import { buildScene, type BuiltScene, type SceneOp } from "@/lib/lesson/scenes";
import { pickText, type Params } from "@/lib/lesson/types";
import { LESSON_FONT_SCALE_EVENT } from "./font-size-control";
import { PenOverlay } from "./pen-overlay";

export type GgbViewHandle = {
  resetView: () => void;
};

type GgbViewProps = {
  // Registry scene…
  sceneId?: string;
  params?: Params;
  // …or an uploaded lesson-file program (with a stable identity key).
  program?: BuiltScene;
  programKey?: string;
  step: number;
  // True when the teacher moved exactly one step forward — value changes
  // then play as smooth animations instead of jumping.
  animate: boolean;
  lang: Lang;
  className?: string;
};

type Status = "idle" | "loading" | "ready" | "error";

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// GeoGebra rasterizes label text on its own canvas, so the --lesson-scale
// CSS variable (A−/A+ control) can't reach it. The same scale is applied
// instead as the GGB app font size, through the lesson runtime.
function ggbFontSize(scale: number): number {
  return Math.round((window.LessonRuntime?.baseFontSize ?? 20) * scale);
}

function lessonScaleOf(node: HTMLElement): number {
  const raw = parseFloat(
    getComputedStyle(node).getPropertyValue("--lesson-scale"),
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

// Ref-counted prototype patch: focus() on elements inside a GGB wrapper is
// forced to preventScroll, because the applet focuses its canvas on load and
// the browser would scroll-jump the page there. Installed while at least one
// GgbView is mounted; the original focus is restored when the last unmounts.
let focusGuardCount = 0;
let originalFocus: ((options?: FocusOptions) => void) | null = null;

function installFocusScrollGuard() {
  focusGuardCount += 1;
  if (focusGuardCount > 1) return;
  originalFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options?: FocusOptions) {
    const guarded = this.closest?.("[data-ggb-focus-guard]");
    originalFocus!.call(
      this,
      guarded ? { ...options, preventScroll: true } : options,
    );
  };
}

function removeFocusScrollGuard() {
  focusGuardCount -= 1;
  if (focusGuardCount === 0 && originalFocus) {
    HTMLElement.prototype.focus = originalFocus;
    originalFocus = null;
  }
}

export const GgbView = forwardRef<GgbViewHandle, GgbViewProps>(function GgbView(
  { sceneId, params, program, programKey, step, animate, lang, className },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GgbApi | null>(null);
  const toolkitRef = useRef<unknown>(null);
  const animCancelsRef = useRef<(() => void)[]>([]);
  const appliedSceneKeyRef = useRef<string>("");
  const prevStepRef = useRef(0);
  const restoreBase64Ref = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [visible, setVisible] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [toolbarOn, setToolbarOn] = useState(false);

  const paramsKey = JSON.stringify(params ?? {});
  const scene: BuiltScene | null = useMemo(
    () => program ?? (sceneId ? buildScene(sceneId, params ?? {}) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneId, paramsKey, program],
  );
  const sceneKey = program ? `program:${programKey}` : `${sceneId}:${paramsKey}`;

  const cancelAnimations = useCallback(() => {
    for (const cancel of animCancelsRef.current) cancel();
    animCancelsRef.current = [];
  }, []);

  const animateValue = useCallback(
    (obj: string, to: number, ms: number, delay: number, controlObj?: string) => {
      const api = apiRef.current;
      if (!api) return;
      let raf = 0;
      let timer = 0;
      const run = () => {
        const from = api.getValue(obj);
        const start = performance.now();
        const frame = (now: number) => {
          const t = Math.min((now - start) / ms, 1);
          const value = from + (to - from) * easeInOut(t);
          try {
            api.setValue(obj, value);
          } catch {
            return;
          }
          if (obj === controlObj) setSliderValue(value);
          if (t < 1) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      };
      if (delay > 0) timer = window.setTimeout(run, delay);
      else run();
      animCancelsRef.current.push(() => {
        window.clearTimeout(timer);
        cancelAnimationFrame(raf);
      });
    },
    [],
  );

  const applyOps = useCallback(
    (ops: SceneOp[], withAnimation: boolean) => {
      const api = apiRef.current;
      if (!api) return;
      const controlObj = scene?.control?.obj;
      for (const op of ops) {
        try {
          if ("cmd" in op) {
            api.evalCommand(op.cmd);
          } else if ("fn" in op) {
            if (toolkitRef.current) op.fn(toolkitRef.current);
          } else if ("show" in op) {
            for (const name of op.show) api.setVisible(name, true);
          } else if ("hide" in op) {
            for (const name of op.hide) api.setVisible(name, false);
          } else if ("set" in op) {
            api.setValue(op.set[0], op.set[1]);
            if (op.set[0] === controlObj) setSliderValue(op.set[1]);
          } else if ("anim" in op) {
            if (withAnimation) {
              animateValue(
                op.anim.obj,
                op.anim.to,
                op.anim.ms ?? 1200,
                op.anim.delay ?? 0,
                controlObj,
              );
            } else {
              api.setValue(op.anim.obj, op.anim.to);
              if (op.anim.obj === controlObj) setSliderValue(op.anim.to);
            }
          } else if ("style" in op) {
            const s = op.style;
            if (s.color) api.setColor(s.obj, s.color[0], s.color[1], s.color[2]);
            if (s.thickness !== undefined) api.setLineThickness(s.obj, s.thickness);
            if (s.filling !== undefined) api.setFilling(s.obj, s.filling);
            if (s.lineStyle !== undefined) {
              api.evalCommand(`SetLineStyle(${s.obj}, ${s.lineStyle})`);
            }
            if (s.caption !== undefined) {
              api.setCaption(s.obj, s.caption);
              api.setLabelStyle(s.obj, 3);
              api.setLabelVisible(s.obj, true);
            }
            if (s.label !== undefined && s.caption === undefined) {
              api.setLabelVisible(s.obj, s.label);
            }
            if (s.fixed) api.setFixed(s.obj, true, false);
          }
        } catch {
          // A failed op must not break the walkthrough.
        }
      }
    },
    [scene, animateValue],
  );

  // Camera: fit the scene's real-coordinate bounding box, then aim.
  const applyViewFit = useCallback(() => {
    const api = apiRef.current;
    if (!api || !scene) return;
    if (scene.fit) {
      const [x0, x1, y0, y1, z0, z1] = scene.fit;
      try {
        api.setCoordSystem(x0, x1, y0, y1, z0, z1);
      } catch {
        try {
          api.evalCommand(`ZoomIn(${x0}, ${y0}, ${z0}, ${x1}, ${y1}, ${z1})`);
        } catch {
          // best effort
        }
      }
    }
    if (scene.viewDirection) {
      try {
        api.evalCommand(scene.viewDirection);
      } catch {
        // best effort
      }
    }
  }, [scene]);

  const applySceneInit = useCallback(() => {
    const api = apiRef.current;
    if (!api || !scene) return;
    applyOps(scene.init, false);
    applyViewFit();
    appliedSceneKeyRef.current = sceneKey;
  }, [scene, sceneKey, applyOps, applyViewFit]);

  // Replay-style scenes (uploaded files): steps only move the model forward,
  // so reaching step k from scratch means running steps 0..k in order.
  const applyStepsUpTo = useCallback(
    (target: number) => {
      if (!scene) return;
      for (let k = 0; k <= Math.min(target, scene.steps.length - 1); k++) {
        applyOps(scene.steps[k]?.ops ?? [], false);
      }
    },
    [scene, applyOps],
  );

  const applyStep = useCallback(
    (withAnimation: boolean) => {
      if (!scene) return;
      const target = scene.steps[Math.min(step, scene.steps.length - 1)];
      if (!target) return;
      cancelAnimations();
      applyOps(target.ops, withAnimation);
    },
    [scene, step, cancelAnimations, applyOps],
  );

  // Full rebuild to the current step (used by replay scenes going backward,
  // and by scene switches on a live applet).
  const rebuildScene = useCallback(() => {
    const api = apiRef.current;
    if (!api || !scene) return;
    cancelAnimations();
    clearConstruction(api);
    try {
      api.setPerspective(scene.perspective ?? "T");
    } catch {
      // best effort
    }
    applySceneInit();
    if (scene.replayBack) applyStepsUpTo(step);
    else applyStep(false);
    prevStepRef.current = step;
  }, [scene, step, cancelAnimations, applySceneInit, applyStepsUpTo, applyStep]);

  // The web3d applet focuses its canvas when it finishes loading, despite
  // preventFocus — and the browser scroll-jumps to the focused element. With
  // several applets loading staggered (theory scroll mode) the page gets
  // dragged to the last one. Guard: while any GgbView is mounted, every
  // programmatic .focus() inside a GGB wrapper gets preventScroll.
  useEffect(() => {
    installFocusScrollGuard();
    return removeFocusScrollGuard;
  }, []);

  // Lazy visibility: only start loading the engine when the view approaches
  // the viewport.
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Inject the applet once visible.
  useEffect(() => {
    if (!visible || status !== "idle") return;
    const wrapper = wrapperRef.current;
    if (!wrapper || !scene) return;
    let cancelled = false;
    setStatus("loading");

    const containerId = nextAppletId();
    const host = document.createElement("div");
    host.id = containerId;
    wrapper.appendChild(host);

    // Set when the rebuild came from the toolbar toggle: restore the exact
    // applet state (construction + camera) instead of re-running the scene,
    // so the teacher's rotated/zoomed view survives.
    const restoreBase64 = restoreBase64Ref.current;
    restoreBase64Ref.current = null;

    // The runtime is required to run lesson-file programs; registry scenes
    // load it too (best-effort) because setFontSize lives there.
    const prerequisites: Promise<unknown>[] = [loadGgbEngine()];
    prerequisites.push(
      scene.needsRuntime
        ? loadLessonRuntime()
        : loadLessonRuntime().catch(() => null),
    );

    Promise.all(prerequisites)
      .then(() => {
        if (cancelled) return;
        createApplet(
          containerId,
          containerId,
          {
            width: wrapper.clientWidth,
            height: wrapper.clientHeight,
            language: lang === "ru" ? "ru" : "kk",
            withToolbar: toolbarOn,
            ggbBase64: restoreBase64 ?? undefined,
          },
          (api) => {
            if (cancelled) {
              try {
                api.remove();
              } catch {
                // already gone
              }
              return;
            }
            apiRef.current = api;
            // Set the font size before the toolkit boots so its own font
            // patch sees the already-correct value (no second XML round-trip).
            window.LessonRuntime?.setFontSize(
              api,
              ggbFontSize(lessonScaleOf(wrapper)),
              scene.needsRuntime === true,
            );
            toolkitRef.current = scene.needsRuntime
              ? window.LessonRuntime?.createToolkit(api) ?? null
              : null;
            // The "3d" app still mounts an algebra sidebar; hide it so the
            // applet is pure graphics (same trick as the legacy template).
            // Skipped on base64 restore — setPerspective would reset the
            // camera we're trying to preserve.
            if (!restoreBase64) {
              try {
                api.setPerspective(scene.perspective ?? "T");
                api.setVisible("algebra", false);
              } catch {
                // best effort
              }
            }
            window.setTimeout(() => {
              wrapper.querySelectorAll("div").forEach((node) => {
                const cls = node.className;
                if (
                  typeof cls === "string" &&
                  (cls.includes("algebra") || cls.includes("inputBar"))
                ) {
                  node.style.display = "none";
                }
              });
              try {
                api.setSize(wrapper.clientWidth, wrapper.clientHeight);
              } catch {
                // applet may already be gone
              }
            }, 1200);
            if (restoreBase64) {
              // The snapshot already contains the scene at the current step.
              appliedSceneKeyRef.current = sceneKey;
              prevStepRef.current = step;
            } else {
              applySceneInit();
              if (scene.replayBack) applyStepsUpTo(step);
              else applyStep(false);
              prevStepRef.current = step;
            }
            try {
              api.setSize(wrapper.clientWidth, wrapper.clientHeight);
            } catch {
              // best effort
            }
            setStatus("ready");
          },
        );
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      cancelAnimations();
      const api = apiRef.current;
      apiRef.current = null;
      toolkitRef.current = null;
      if (api) {
        try {
          api.remove();
        } catch {
          // already gone
        }
      }
      wrapper.innerHTML = "";
      setStatus("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, retryToken]);

  // Scene switch on a live applet: rebuild the construction in place.
  useEffect(() => {
    if (status !== "ready") return;
    if (appliedSceneKeyRef.current === sceneKey) return;
    if (!apiRef.current || !scene) return;
    rebuildScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sceneKey]);

  // Step changes.
  useEffect(() => {
    if (status !== "ready") return;
    if (appliedSceneKeyRef.current !== sceneKey) return;
    const prev = prevStepRef.current;
    prevStepRef.current = step;
    if (scene?.replayBack) {
      if (step > prev) {
        // Forward: run only the newly reached steps, in order.
        cancelAnimations();
        for (let k = prev + 1; k <= step; k++) {
          applyOps(scene.steps[k]?.ops ?? [], false);
        }
      } else if (step < prev) {
        rebuildScene();
      }
    } else {
      applyStep(animate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, step]);

  // Keep the applet sized to its container (fullscreen, window resize,
  // splitter drags…). Slightly debounced — GeoGebra relayouts are expensive
  // and the splitter fires many resizes per second.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const api = apiRef.current;
        if (!api) return;
        try {
          api.setSize(wrapper.clientWidth, wrapper.clientHeight);
        } catch {
          // applet not ready yet
        }
      }, 120);
    });
    observer.observe(wrapper);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Follow the A−/A+ control on a live applet: lesson text rescales via
  // CSS, the GGB label font re-applies through the runtime.
  useEffect(() => {
    const onScale = (event: Event) => {
      const api = apiRef.current;
      const scale = (event as CustomEvent<number>).detail;
      if (!api || typeof scale !== "number") return;
      window.LessonRuntime?.setFontSize(
        api,
        ggbFontSize(scale),
        scene?.needsRuntime === true,
      );
    };
    window.addEventListener(LESSON_FONT_SCALE_EVENT, onScale);
    return () => window.removeEventListener(LESSON_FONT_SCALE_EVENT, onScale);
  }, [scene?.needsRuntime]);

  useImperativeHandle(ref, () => ({
    resetView: applyViewFit,
  }));

  // The toolbar exists only if the applet was created with it, so toggling
  // rebuilds the applet. The current state (construction + camera) is
  // snapshotted first and restored into the new applet — the teacher's
  // rotated/zoomed view must survive the toggle.
  const toggleToolbar = () => {
    if (status !== "ready") return;
    try {
      restoreBase64Ref.current = apiRef.current?.getBase64() ?? null;
    } catch {
      restoreBase64Ref.current = null;
    }
    setToolbarOn((value) => !value);
    setStatus("idle");
    setRetryToken((token) => token + 1);
  };

  const control = scene?.control;
  const showControl =
    control !== undefined &&
    scene !== null &&
    (scene.steps[Math.min(step, scene.steps.length - 1)]?.showControl ?? false);

  return (
    <div className={cn("relative min-h-0 overflow-hidden bg-white", className)}>
      <div ref={wrapperRef} data-ggb-focus-guard className="absolute inset-0" />

      {!toolbarOn && (
        <div className="pointer-events-none absolute top-2.5 left-3 z-[5] rounded bg-white/85 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#6b7280]">
          {lang === "ru" ? "3D модель · можно вращать" : "3D модель · айналдыруға болады"}
        </div>
      )}

      {/* The GeoGebra toolbar occupies the applet's top strip when enabled —
          our floating controls move below it. */}
      <div
        className={cn(
          "absolute right-2.5 z-[5] flex flex-col gap-1.5",
          toolbarOn ? "top-[64px]" : "top-2",
        )}
      >
        <button
          type="button"
          onClick={applyViewFit}
          className="grid size-8 place-items-center rounded-md border-[1.5px] border-[#d8dde5] bg-white/95 text-[#6b7280] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#c5cad3] hover:text-[#1a1a2e]"
          aria-label={lang === "ru" ? "Сбросить вид" : "Көріністі қалпына келтіру"}
        >
          <RotateCcwIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={toggleToolbar}
          aria-pressed={toolbarOn}
          aria-label={
            lang === "ru" ? "Инструменты GeoGebra" : "GeoGebra құралдары"
          }
          className={cn(
            "grid size-8 place-items-center rounded-md border-[1.5px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors",
            toolbarOn
              ? "border-[#2563eb] bg-[#2563eb] text-white"
              : "border-[#d8dde5] bg-white/95 text-[#6b7280] hover:border-[#c5cad3] hover:text-[#1a1a2e]",
          )}
        >
          <DraftingCompassIcon className="size-4" />
        </button>
      </div>

      <PenOverlay
        lang={lang}
        controlsClassName={cn(
          "right-2.5",
          toolbarOn ? "top-[154px]" : "top-[92px]",
        )}
      />

      {showControl && control && (
        <div className="absolute right-3 bottom-3 left-3 z-[5] flex items-center gap-3 rounded-lg border-[1.5px] border-[#d8dde5] bg-white/95 px-3.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <span className="shrink-0 text-[13px] font-bold text-[#1a1a2e]">
            {pickText(control.label, lang)}:
          </span>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={sliderValue ?? control.min}
            onChange={(event) => {
              const value = Number(event.target.value);
              cancelAnimations();
              setSliderValue(value);
              const api = apiRef.current;
              if (api) {
                try {
                  api.setValue(control.obj, value);
                } catch {
                  // applet not ready
                }
              }
            }}
            className="h-1.5 w-full cursor-pointer accent-[#2563eb]"
          />
        </div>
      )}

      {status !== "ready" && (
        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center gap-3 bg-white">
          {status === "error" ? (
            <>
              <span className="px-6 text-center text-[13px] text-[#6b7280]">
                {lang === "ru"
                  ? "Не удалось загрузить GeoGebra. Проверьте интернет."
                  : "GeoGebra жүктелмеді. Интернетті тексеріңіз."}
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setRetryToken((token) => token + 1);
                }}
                className="rounded-md bg-[#2563eb] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              >
                {lang === "ru" ? "Повторить" : "Қайталау"}
              </button>
            </>
          ) : (
            <>
              <div className="size-7 animate-spin rounded-full border-[2.5px] border-[#d8dde5] border-t-[#2563eb]" />
              <span className="text-xs text-[#6b7280]">
                {lang === "ru" ? "Загрузка GeoGebra…" : "GeoGebra жүктелуде…"}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
});
