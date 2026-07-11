// MathSabaq lesson-file runtime — the single canonical implementation of the
// authoring toolkit (`g`) that lesson problem/theory files program against.
// Loaded by BOTH the site player and the standalone previewer, so a file
// behaves identically in local checking and in the classroom.
//
// A lesson file is a plain .js script that calls registerLessonProblem(def)
// or registerLessonTheory(def) — the host captures the definition via
// LessonRuntime.capture(). The toolkit mirrors the author's original HTML
// template helpers (P, SEG, POLY, SECT, DIAG, MID, PT, col, vis, cap, …)
// minus the applet argument, so authored code reads the same as before.

(function () {
  "use strict";

  var COLORS = {
    BLUE: [37, 99, 235],
    RED: [220, 38, 38],
    GREEN: [22, 163, 74],
    ORANGE: [234, 140, 30],
    GRAY: [160, 165, 175],
    PURPLE: [124, 58, 237],
    MAGENTA: [219, 39, 119],
    TEAL: [13, 148, 136],
    DARK: [55, 65, 81],
    LIQUID: [59, 130, 246],
  };

  // GeoGebra's 3D view rasterizes $LaTeX$ captions into low-resolution
  // textures (blurry on hi-dpi screens), while plain-text labels go through
  // the crisp dpr-aware font path. Simple $…$ captions — letters, digits,
  // _ indices, ^2/^3, = / √ ° — are therefore converted to plain unicode
  // text; anything richer stays LaTeX and renders as before.
  var SUB_DIGITS = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
  var SUP_DIGITS = { 2: "²", 3: "³" };
  function crispCaption(s) {
    var m = /^\$(.*)\$$/.exec(String(s));
    if (!m) return s;
    var t = m[1]
      .replace(/_\{(\d+)\}/g, function (_, d) {
        return d.replace(/\d/g, function (c) { return SUB_DIGITS[c]; });
      })
      .replace(/_(\d)/g, function (_, d) { return SUB_DIGITS[d]; })
      .replace(/\^\{?([23])\}?/g, function (_, d) { return SUP_DIGITS[d]; })
      .replace(/\\[,;!]/g, " ");
    if (/[\\{}_^$]/.test(t)) return s; // still complex — keep LaTeX
    return t;
  }

  // Label textures rasterize at the app font size — the default 16 is small
  // and fuzzy, so the runtime patches the settings XML with its current font
  // size (base 20). The site player rescales it live with the classroom
  // A−/A+ control via LessonRuntime.setFontSize; the size sticks, so applets
  // that boot later (lazy theory sections) come up at the chosen size too.
  // hidePlate keeps the xOy plate off for lesson-file applets, which a
  // setXML round-trip would otherwise resurrect; registry scenes keep their
  // own plate state. Idempotent: an unchanged XML skips the round-trip.
  var BASE_FONT_SIZE = 20;
  var appFontSize = BASE_FONT_SIZE;

  function applyFontSize(api, size, hidePlate) {
    if (typeof size === "number" && size > 0) appFontSize = Math.round(size);
    try {
      var xml = api.getXML();
      var patched = xml.replace(
        /<font\s+size="\d+"/,
        '<font size="' + appFontSize + '"'
      );
      if (hidePlate) {
        patched = patched.replace(/<plate\s+show="true"/, '<plate show="false"');
      }
      if (patched !== xml) api.setXML(patched);
    } catch (e) {
      // best effort — a failed patch must not break the applet
    }
  }

  function createToolkit(api) {
    // Every operation is wrapped: a failed command must never break the
    // walkthrough (same policy as the original template's try/catch).
    function safe(fn) {
      try {
        return fn();
      } catch (e) {
        return undefined;
      }
    }

    var g = { api: api };

    // Runs at applet boot; the object-by-object board wipe between steps
    // never resets the font size.
    applyFontSize(api, undefined, true);

    Object.keys(COLORS).forEach(function (name) {
      g[name] = COLORS[name];
    });

    // ----- core -----
    g.cmd = function (s) {
      return safe(function () {
        return api.evalCommand(s);
      });
    };
    g.set = function (n, v) {
      safe(function () {
        api.setValue(n, v);
      });
    };
    g.get = function (n) {
      return safe(function () {
        return api.getValue(n);
      });
    };
    g.exists = function (n) {
      return !!safe(function () {
        return api.exists(n);
      });
    };
    g.del = function (n) {
      safe(function () {
        api.deleteObject(n);
      });
    };

    // ----- styling -----
    g.col = function (n, c) {
      safe(function () {
        api.setColor(n, c[0], c[1], c[2]);
      });
    };
    g.fill = function (n, v) {
      safe(function () {
        api.setFilling(n, v);
      });
    };
    g.vis = function (n, b) {
      safe(function () {
        api.setVisible(n, b);
      });
    };
    g.show = function () {
      flatNames(arguments).forEach(function (n) {
        g.vis(n, true);
      });
    };
    g.hide = function () {
      flatNames(arguments).forEach(function (n) {
        g.vis(n, false);
      });
    };
    g.thick = function (n, w) {
      safe(function () {
        api.setLineThickness(n, w);
      });
    };
    g.dash = function (n) {
      safe(function () {
        api.setLineStyle(n, 1);
      });
    };
    g.lineStyle = function (n, s) {
      safe(function () {
        api.setLineStyle(n, s);
      });
    };
    g.pointSize = function (n, s) {
      safe(function () {
        api.setPointSize(n, s);
      });
    };
    g.cap = function (n, latex) {
      safe(function () {
        api.setCaption(n, crispCaption(latex));
        api.setLabelStyle(n, 3);
        api.setLabelVisible(n, true);
      });
    };
    g.labelOff = function (n) {
      safe(function () {
        api.setLabelVisible(n, false);
      });
    };
    g.lock = function (n) {
      safe(function () {
        api.setFixed(n, true, true);
      });
    };
    g.reveal = function (n, latex, c) {
      if (!g.exists(n)) return;
      g.cap(n, latex);
      if (c) g.col(n, c);
      safe(function () {
        api.setLabelVisible(n, true);
      });
    };
    g.hideValue = function (n) {
      safe(function () {
        api.setLabelVisible(n, false);
      });
    };

    // ----- construction primitives (template-compatible) -----
    g.P = function (n, x, y, z, capt) {
      g.cmd(n + "=(" + x + "," + y + "," + z + ")");
      g.pointSize(n, 3);
      g.col(n, COLORS.BLUE);
      g.cap(n, capt || "$" + n + "$");
      g.lock(n);
    };
    g.SEG = function (n, p, q) {
      g.cmd(n + "=Segment(" + p + "," + q + ")");
      g.col(n, COLORS.BLUE);
      g.thick(n, 3);
      g.labelOff(n);
      g.lock(n);
    };
    g.POLY = function (n, pts) {
      g.cmd(n + "=Polygon(" + pts.join(",") + ")");
      g.col(n, COLORS.BLUE);
      g.fill(n, 0.1);
      g.labelOff(n);
      g.lock(n);
    };
    g.SECT = function (n, pts, c) {
      g.cmd(n + "=Polygon(" + pts.join(",") + ")");
      g.col(n, c || COLORS.ORANGE);
      g.fill(n, 0.3);
      g.labelOff(n);
      g.lock(n);
    };
    g.DIAG = function (n, p, q, c) {
      g.cmd(n + "=Segment(" + p + "," + q + ")");
      g.col(n, c || COLORS.ORANGE);
      g.thick(n, 4);
      g.labelOff(n);
      g.lock(n);
    };
    g.MID = function (n, p, q) {
      g.cmd(n + "=Midpoint(" + p + "," + q + ")");
      g.pointSize(n, 4);
      g.col(n, COLORS.RED);
      g.labelOff(n);
      g.lock(n);
    };
    g.PT = function (n, expr, c) {
      g.cmd(n + "=" + expr);
      g.pointSize(n, 4);
      g.col(n, c || COLORS.RED);
      g.labelOff(n);
      g.lock(n);
    };

    // ----- view -----
    g.view = function (dir) {
      g.cmd("SetViewDirection(" + dir + ")");
    };
    g.hideAxes = function () {
      ["xAxis", "yAxis", "zAxis", "xOyPlane"].forEach(function (o) {
        g.cmd("SetVisibleInView(" + o + ",-1,false)");
      });
      safe(function () {
        api.setGridVisible(false);
      });
    };
    g.showAxes = function () {
      safe(function () {
        api.setAxesVisible(true, true);
      });
    };

    return g;
  }

  // ----- registration plumbing -----
  // The host (player or previewer) installs capture callbacks, then injects
  // the lesson file script; the file's register call lands here.
  var problemCallback = null;
  var theoryCallback = null;

  window.registerLessonProblem = function (def) {
    if (problemCallback) problemCallback(def);
  };
  window.registerLessonTheory = function (def) {
    if (theoryCallback) theoryCallback(def);
  };

  window.LessonRuntime = {
    version: 1,
    COLORS: COLORS,
    baseFontSize: BASE_FONT_SIZE,
    setFontSize: applyFontSize,
    createToolkit: createToolkit,
    capture: function (onProblem, onTheory) {
      problemCallback = onProblem || null;
      theoryCallback = onTheory || null;
    },
  };

  function flatNames(args) {
    var out = [];
    Array.prototype.forEach.call(args, function (a) {
      if (Array.isArray(a)) out = out.concat(a);
      else out.push(a);
    });
    return out;
  }
})();
