/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "TEMPLATE-problem-figure",
  "number": "1",
  "title": { "kz": "Есептің аты", "ru": "Название задачи" },
  "difficulty": "easy",
  "tags": [ { "kz": "тег", "ru": "тег" } ]
}
__LESSON_META__*/

// ─────────────────────────────────────────────────────────────────────────
// PROBLEM TEMPLATE (WITH a JS figure). Copy, rename, change every id + text.
// A problem with `explanation` (and NO `steps`) is a document-mode mini page:
//   statement (top)  →  JS figure  →  explanation HIDDEN until the teacher
//   clicks «Түсіндіруді көрсету» (re-hidden every time the problem is opened).
//
// Pattern for a "reveal annotates the figure" problem:
//   • `visual` returns a handle with a showAnswers() method.
//   • `wireExplanation` runs when the explanation opens and calls it.
// For animated problems: put a ▶ button inside `visual`, expose play() on the
// handle, and add a replay <button class="lf-replay"> inside `explanation`.
// A visual that starts a timer/requestAnimationFrame MUST return destroy().
// ─────────────────────────────────────────────────────────────────────────

(function () {

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", BLUE = "#2563eb", GREEN = "#16a34a", RED = "#dc2626";
function el(tag, attrs, parent) {
  var n = document.createElementNS(NS, tag);
  for (var k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function txt(parent, x, y, s, o) {
  o = o || {};
  var t = el("text", { x: x, y: y, fill: o.fill || DARK, "font-size": o.size || 16,
    "font-weight": o.weight || 500, "text-anchor": o.anchor || "middle",
    "font-family": "system-ui, -apple-system, 'Segoe UI', sans-serif" }, parent);
  t.textContent = s;
  return t;
}
function ray(svg, o) {
  var X = function (v) { return o.x0 + v * o.unit; };
  var end = X(o.maxV) + 30;
  el("line", { x1: X(0), y1: o.y, x2: end, y2: o.y, stroke: DARK, "stroke-width": 3, "stroke-linecap": "round" }, svg);
  el("path", { d: "M" + (end + 12) + " " + o.y + " l-14 -6 v12 z", fill: DARK }, svg);
  for (var v = 0; v <= o.maxV; v++) el("line", { x1: X(v), y1: o.y - 7, x2: X(v), y2: o.y + 7, stroke: DARK, "stroke-width": 2 }, svg);
  (o.labels || []).forEach(function (v) { txt(svg, X(v), o.y + 30, String(v), { size: 15, weight: 600 }); });
  txt(svg, X(0) - 10, o.y - 12, "O", { size: 16, weight: 600, anchor: "end" });
  return X;
}

registerLessonProblem({
  format: 1,
  id: "TEMPLATE-problem-figure",
  number: "1",
  title: { kz: "Есептің аты", ru: "Название задачи" },
  difficulty: "easy",           // easy | med | hard
  tags: [{ kz: "тег", ru: "тег" }],

  statement: {
    kz: "<p>Есептің шарты. Табу керегін белгілеңіз: <b class=\"lf-find\">A нүктесінің координатасын табыңдар</b>.</p>",
    ru: "<p>Условие задачи. Отметьте искомое: <b class=\"lf-find\">найдите координату точки A</b>.</p>",
  },

  // The figure. Draw with plain SVG/HTML. Return a handle for the reveal.
  visual: function (root /*, ctx */) {
    var svg = el("svg", { viewBox: "0 0 760 130", style: "width:100%;height:auto;display:block" });
    root.appendChild(svg);
    var X = ray(svg, { x0: 70, y: 70, unit: 60, maxV: 10, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    el("circle", { cx: X(6), cy: 70, r: 6, fill: RED }, svg);
    var cap = txt(svg, X(6), 46, "A = ?", { size: 16, weight: 700, fill: RED });

    var done = false;
    return {
      showAnswers: function () {           // called from wireExplanation
        if (done) return;
        done = true;
        cap.textContent = "A(6)";
        cap.setAttribute("fill", GREEN);
      },
    };
  },

  explanation: {
    kz: "<p>Санақ басынан (\\(O\\)) бастап штрихтарды санаймыз: \\(A\\) — 6-шы штрихта.</p><div class=\"lf-answer\">\\( A(6) \\)</div>",
    ru: "<p>Считаем штрихи от начала отсчёта (\\(O\\)): \\(A\\) — на 6-м штрихе.</p><div class=\"lf-answer\">\\( A(6) \\)</div>",
  },

  // Runs when the explanation opens; ctx.visual = the handle `visual` returned.
  wireExplanation: function (root, ctx) {
    if (ctx.visual && ctx.visual.showAnswers) ctx.visual.showAnswers();
  },
});
})();
