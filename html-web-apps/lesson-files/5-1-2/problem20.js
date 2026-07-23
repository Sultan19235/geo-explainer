/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-mark-points",
  "number": "20",
  "title": { "kz": "Нүктелерді белгілеу", "ru": "Отметить точки" },
  "difficulty": "easy",
  "tags": [ { "kz": "нүктені белгілеу", "ru": "отметить точку" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №20 — document-mode: the figure starts as an EMPTY ray (the task is to
// mark the points yourself); the explanation reveal draws A, B, C, D and
// the OA…OD length spans.

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", BLUE = "#2563eb",
    PURPLE = "#7c3aed", TEAL = "#0d9488", MAGENTA = "#c026d3", ORANGE = "#ea580c";

function el(tag, attrs, parent) {
  var node = document.createElementNS(NS, tag);
  for (var key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.appendChild(node);
  return node;
}
function txt(parent, x, y, s, o) {
  o = o || {};
  var t = el("text", {
    x: x, y: y, fill: o.fill || DARK,
    "font-size": o.size || 16, "font-weight": o.weight || 500,
    "text-anchor": o.anchor || "middle",
    "font-family": "system-ui, -apple-system, 'Segoe UI', sans-serif"
  }, parent);
  t.textContent = s;
  return t;
}
function ray(svg, o) {
  var X = function (v) { return o.x0 + v * o.unit; };
  var end = X(o.maxV) + (o.over || 30);
  el("line", { x1: X(0), y1: o.y, x2: end, y2: o.y, stroke: DARK, "stroke-width": 3, "stroke-linecap": "round" }, svg);
  el("path", { d: "M" + (end + 12) + " " + o.y + " l-14 -6 v12 z", fill: DARK }, svg);
  for (var v = 0; v <= o.maxV; v += (o.step || 1)) {
    var h = o.big && v % o.big === 0 ? (o.tick || 7) * 1.7 : (o.tick || 7);
    el("line", { x1: X(v), y1: o.y - h, x2: X(v), y2: o.y + h, stroke: DARK, "stroke-width": 2 }, svg);
  }
  (o.labels || []).forEach(function (v) {
    txt(svg, X(v), o.y + (o.labelDy || 30), String(v), { size: 15, weight: 600 });
  });
  txt(svg, X(0) - 10, o.y - 12, "O", { size: 16, weight: 600, anchor: "end" });
  return X;
}

registerLessonProblem({
  format: 1,
  id: "coord-ray-mark-points",
  number: "20",
  title: { kz: "Нүктелерді белгілеу", ru: "Отметить точки" },
  difficulty: "easy",
  tags: [{ kz: "нүктені белгілеу", ru: "отметить точку" }],

  statement: {
    kz: "<p>Бірлік кесінді ретінде ұзындығы \\(1\\) см кесіндіні алып, координаталық сәуле сызыңдар. Оның бойында \\(2\\), \\(6\\), \\(8\\) және \\(9\\) сандарын кескіндейтін \\(A\\), \\(B\\), \\(C\\) және \\(D\\) нүктелерін белгілеңдер. <b class=\"lf-find\">\\(OA\\), \\(OB\\), \\(OC\\) және \\(OD\\) кесінділерінің ұзындықтарын сантиметр есебімен табыңдар.</b></p>",
    ru: "<p>Приняв за единичный отрезок отрезок длиной \\(1\\) см, начертите координатный луч. Отметьте на нём точки \\(A\\), \\(B\\), \\(C\\) и \\(D\\), изображающие числа \\(2\\), \\(6\\), \\(8\\) и \\(9\\). <b class=\"lf-find\">Найдите длины отрезков \\(OA\\), \\(OB\\), \\(OC\\) и \\(OD\\) в сантиметрах.</b></p>",
  },

  visual(root, ctx) {
    var ru = ctx.lang === "ru";
    var svg = el("svg", { viewBox: "0 0 880 330", style: "width:100%;height:auto;display:block" });
    root.appendChild(svg);

    txt(svg, 80, 32, ru ? "1 единичный отрезок = 1 см" : "1 бірлік кесінді = 1 см",
      { size: 13.5, fill: GRAY, anchor: "start" });

    var X = ray(svg, { x0: 80, y: 90, unit: 58, maxV: 12, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });

    // Answers, drawn on reveal: the points and the length spans below.
    var hidden = el("g", {}, svg);
    [["A", 2], ["B", 6], ["C", 8], ["D", 9]].forEach(function (p, i) {
      el("circle", { cx: X(p[1]), cy: 90, r: 6, fill: BLUE }, hidden);
      // C(8) and D(9) are adjacent — stagger their labels.
      var dy = p[0] === "D" ? -46 : -22;
      txt(hidden, X(p[1]), 90 + dy, p[0] + "(" + p[1] + ")", { size: 15, weight: 700, fill: BLUE });
      void i;
    });
    [["OA = 2", 2, 160, PURPLE], ["OB = 6", 6, 205, TEAL], ["OC = 8", 8, 250, MAGENTA], ["OD = 9", 9, 295, ORANGE]].forEach(function (s) {
      el("line", { x1: X(0), y1: s[2], x2: X(s[1]), y2: s[2], stroke: s[3], "stroke-width": 4, "stroke-linecap": "round" }, hidden);
      el("line", { x1: X(0), y1: s[2] - 7, x2: X(0), y2: s[2] + 7, stroke: s[3], "stroke-width": 2 }, hidden);
      el("line", { x1: X(s[1]), y1: s[2] - 7, x2: X(s[1]), y2: s[2] + 7, stroke: s[3], "stroke-width": 2 }, hidden);
      txt(hidden, X(s[1]) + 18, s[2] + 5, s[0] + " см", { size: 13.5, weight: 700, fill: s[3], anchor: "start" });
    });
    hidden.style.display = "none";

    var answered = false;
    return {
      showAnswers: function () {
        if (answered) return;
        answered = true;
        hidden.style.display = "";
      },
    };
  },

  explanation: {
    kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> бірлік кесінді \\(= 1\\) см; \\(A(2),\\; B(6),\\; C(8),\\; D(9)\\).</p><p><b>Табу керек:</b> \\(OA,\\; OB,\\; OC,\\; OD = \\,?\\) (см)</p></div><p>Әр нүктені өз санының тұсына қоямыз: \\(A\\) — 2-ге, \\(B\\) — 6-ға, \\(C\\) — 8-ге, \\(D\\) — 9-ға (суретте пайда болды).</p><p>Бірлік кесінді \\(1\\) см болғандықтан, кесіндінің ұзындығы нүктенің координатасына тең:</p><p>\\(OA = 2 \\cdot 1 = 2\\) см; &nbsp; \\(OB = 6 \\cdot 1 = 6\\) см; &nbsp; \\(OC = 8 \\cdot 1 = 8\\) см; &nbsp; \\(OD = 9 \\cdot 1 = 9\\) см.</p><div class=\"lf-answer\">\\(OA = 2\\) см, \\(OB = 6\\) см, \\(OC = 8\\) см, \\(OD = 9\\) см.</div><div class=\"lf-callout\">Бірлік кесінді 1 см болғанда координата мен ұзындық сан жағынан бірдей.</div>",
    ru: "<div class=\"lf-given\"><p><b>Дано:</b> единичный отрезок \\(= 1\\) см; \\(A(2),\\; B(6),\\; C(8),\\; D(9)\\).</p><p><b>Найти:</b> \\(OA,\\; OB,\\; OC,\\; OD = \\,?\\) (см)</p></div><p>Ставим каждую точку над своим числом: \\(A\\) — на 2, \\(B\\) — на 6, \\(C\\) — на 8, \\(D\\) — на 9 (появились на рисунке).</p><p>Так как единичный отрезок равен \\(1\\) см, длина отрезка равна координате точки:</p><p>\\(OA = 2 \\cdot 1 = 2\\) см; &nbsp; \\(OB = 6 \\cdot 1 = 6\\) см; &nbsp; \\(OC = 8 \\cdot 1 = 8\\) см; &nbsp; \\(OD = 9 \\cdot 1 = 9\\) см.</p><div class=\"lf-answer\">\\(OA = 2\\) см, \\(OB = 6\\) см, \\(OC = 8\\) см, \\(OD = 9\\) см.</div><div class=\"lf-callout\">Когда единичный отрезок равен 1 см, координата и длина численно совпадают.</div>",
  },

  wireExplanation(root, ctx) {
    if (ctx.visual && typeof ctx.visual.showAnswers === "function") ctx.visual.showAnswers();
  },
});
})();
