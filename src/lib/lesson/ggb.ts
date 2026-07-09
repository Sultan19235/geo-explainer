// GeoGebra engine loader + applet API surface used by the lesson player.
// The deployggb.js script is fetched once per page no matter how many
// applets mount; each GgbView then injects its own lightweight applet.
//
// Self-hosting: when NEXT_PUBLIC_GGB_CODEBASE is set (e.g. "/geogebra",
// populated by scripts/fetch-geogebra.sh), the script and the HTML5 codebase
// load from our own host — faster and more reliable on school networks. If
// the self-hosted script fails to load, we fall back to the geogebra.org CDN.

export type GgbApi = {
  evalCommand(cmd: string): boolean;
  setValue(name: string, value: number): void;
  getValue(name: string): number;
  setVisible(name: string, visible: boolean): void;
  setCaption(name: string, caption: string): void;
  setLabelVisible(name: string, visible: boolean): void;
  setLabelStyle(name: string, style: number): void;
  setColor(name: string, r: number, g: number, b: number): void;
  setLineThickness(name: string, thickness: number): void;
  setFilling(name: string, filling: number): void;
  setFixed(name: string, fixed: boolean, selectable?: boolean): void;
  setSize(width: number, height: number): void;
  setPerspective(perspective: string): void;
  // 6-arg form sets the 3D view's visible box.
  setCoordSystem(
    xmin: number,
    xmax: number,
    ymin: number,
    ymax: number,
    zmin: number,
    zmax: number,
  ): void;
  showToolBar(show: boolean): void;
  // Full applet state (construction + camera) as a .ggb base64 string.
  getBase64(): string;
  exists(name: string): boolean;
  deleteObject(name: string): void;
  getAllObjectNames(): string[];
  remove(): void;
};

// Wipes the construction object-by-object. Never use newConstruction() for
// this: on the classic app it also resets the perspective back to 2D.
export function clearConstruction(api: GgbApi): void {
  try {
    for (const name of api.getAllObjectNames()) {
      try {
        api.deleteObject(name);
      } catch {
        // already gone
      }
    }
  } catch {
    // best effort
  }
}

// Window.GGBApplet is declared globally in components/quiz/geogebra-figure.tsx.

const CDN_URL = "https://www.geogebra.org/apps/deployggb.js";
const SELF_HOST_BASE =
  process.env.NEXT_PUBLIC_GGB_CODEBASE?.replace(/\/+$/, "") ?? null;

let enginePromise: Promise<void> | null = null;
// Set while loading: which codebase the applets should use (null = CDN).
let activeCodebase: string | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
}

export function loadGgbEngine(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("GeoGebra can only load in the browser"));
  }
  if (window.GGBApplet) return Promise.resolve();
  if (enginePromise) return enginePromise;

  if (SELF_HOST_BASE) {
    activeCodebase = `${SELF_HOST_BASE}/HTML5/5.0/web3d/`;
    enginePromise = loadScript(`${SELF_HOST_BASE}/deployggb.js`).catch(() => {
      activeCodebase = null;
      return loadScript(CDN_URL);
    });
  } else {
    enginePromise = loadScript(CDN_URL);
  }
  enginePromise = enginePromise.catch((error) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

let appletCounter = 0;

export function nextAppletId(): string {
  appletCounter += 1;
  return `lesson_ggb_${appletCounter}`;
}

export type CreateAppletOptions = {
  width: number;
  height: number;
  language: string;
  // The toolbar can only be built at creation time — api.showToolBar() on a
  // toolbar-less applet is a no-op — so toggling it recreates the applet.
  withToolbar: boolean;
  // Restores a previous applet's full state (construction + camera) instead
  // of starting blank — used by the toolbar toggle so the teacher's rotated/
  // zoomed view survives the rebuild.
  ggbBase64?: string;
};

export function createApplet(
  containerId: string,
  appletId: string,
  options: CreateAppletOptions,
  onReady: (api: GgbApi) => void,
): void {
  const Ctor = window.GGBApplet;
  if (!Ctor) throw new Error("GeoGebra engine is not loaded");
  const { width, height, language, withToolbar, ggbBase64 } = options;
  const applet = new Ctor(
    {
      // "classic" renders the Classic-6-style top toolbar with the 3D tool
      // set; the plain "3d" app never builds a toolbar strip. Both UIs run on
      // the same web3d engine, so the toggle only swaps chrome, not codebase.
      id: appletId,
      appName: withToolbar ? "classic" : "3d",
      width: Math.max(width, 200),
      height: Math.max(height, 200),
      language,
      ...(ggbBase64 ? { ggbBase64 } : {}),
      showToolBar: withToolbar,
      showToolBarHelp: false,
      showAlgebraInput: false,
      showMenuBar: false,
      enableRightClick: false,
      enableShiftDragZoom: true,
      showResetIcon: false,
      enableLabelDrags: false,
      showZoomButtons: false,
      showFullscreenButton: false,
      allowStyleBar: false,
      useBrowserForJS: false,
      preventFocus: true,
      perspective: "T",
      appletOnLoad: (api: GgbApi) => {
        const resolved =
          api ?? (window as unknown as Record<string, GgbApi>)[appletId];
        if (resolved) onReady(resolved);
      },
    },
    true,
  );
  if (activeCodebase) {
    (
      applet as unknown as { setHTML5Codebase?: (url: string) => void }
    ).setHTML5Codebase?.(activeCodebase);
  }
  applet.inject(containerId);
}
