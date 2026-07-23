/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-cities",
  "number": "27",
  "title": { "kz": "Қалалар", "ru": "Города" },
  "difficulty": "med",
  "tags": [ { "kz": "бірлік кесінді", "ru": "единичный отрезок" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №27 — document-mode: a map-like static figure — three coordinate rays out
// of Astana (unit = 60 km) with the cities at 11, 7 and 10 units. The
// reveal writes the distance calculation onto each city.

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", BLUE = "#2563eb", GREEN = "#16a34a",
    ORANGE = "#ea580c", PURPLE = "#7c3aed", RED = "#dc2626";

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
    "font-size": o.size || 15, "font-weight": o.weight || 500,
    "text-anchor": o.anchor || "middle",
    "font-family": "system-ui, -apple-system, 'Segoe UI', sans-serif"
  }, parent);
  t.textContent = s;
  return t;
}

registerLessonProblem({
  format: 1,
  id: "coord-ray-cities",
  number: "27",
  title: { kz: "Қалалар", ru: "Города" },
  difficulty: "med",
  tags: [{ kz: "бірлік кесінді", ru: "единичный отрезок" }],

  statement: {
    kz: "<p>Суретте санақ басы \\(O\\) нүктесі (Астана) болатын, бірлік кесіндісі \\(60\\) км-ге тең координаталық сәулелер кескінделген. <b class=\"lf-find\">Қостанай, Павлодар, Жезқазған қалаларының Астанадан арақашықтықтарын (жуықтап) табыңдар.</b></p>",
    ru: "<p>На рисунке изображены координатные лучи с началом отсчёта в точке \\(O\\) (Астана) и единичным отрезком \\(60\\) км. <b class=\"lf-find\">Найдите (приближённо) расстояния городов Костанай, Павлодар, Жезказган от Астаны.</b></p>",
  },

  visual(root, ctx) {
    var ru = ctx.lang === "ru";
    var svg = el("svg", { viewBox: "0 0 880 600", style: "width:100%;height:auto;display:block;max-width:820px;margin:0 auto" });
    root.appendChild(svg);

    txt(svg, 30, 34, ru ? "1 единичный отрезок = 60 км" : "1 бірлік кесінді = 60 км",
      { size: 13.5, fill: GRAY, anchor: "start" });

    var cx = 460, cy = 300, unit = 26;
    function pt(angleDeg, u) {
      var a = (angleDeg * Math.PI) / 180;
      return { x: cx + u * unit * Math.cos(a), y: cy - u * unit * Math.sin(a) };
    }

    // One coordinate ray at an angle: axis line, an arrowhead, a tick per
    // unit, the city dot at `units` with a "?" caption. Name and answer get
    // separate offsets so neither sits on the ray.
    function cityRay(angleDeg, units, name, color, nameDx, nameDy, ansDx, ansDy) {
      var a = (angleDeg * Math.PI) / 180;
      var end = pt(angleDeg, units + 1.4);
      el("line", { x1: cx, y1: cy, x2: end.x, y2: end.y, stroke: color, "stroke-width": 2.5, "stroke-linecap": "round" }, svg);
      var tip = pt(angleDeg, units + 1.85);
      el("path", {
        d: "M" + tip.x + " " + tip.y + " l-13 -5 v10 z",
        fill: color,
        transform: "rotate(" + -angleDeg + " " + tip.x + " " + tip.y + ")",
      }, svg);
      for (var k = 1; k <= units + 1; k++) {
        var p = pt(angleDeg, k);
        var nx = Math.sin(a) * 5, ny = Math.cos(a) * 5;
        el("line", { x1: p.x - nx, y1: p.y - ny, x2: p.x + nx, y2: p.y + ny, stroke: color, "stroke-width": 1.8 }, svg);
      }
      var city = pt(angleDeg, units);
      el("circle", { cx: city.x, cy: city.y, r: 6.5, fill: RED }, svg);
      txt(svg, city.x + nameDx, city.y + nameDy, name, { size: 14.5, weight: 700, fill: color });
      return txt(svg, city.x + ansDx, city.y + ansDy, "?", { size: 14.5, weight: 700, fill: RED });
    }

    var capK = cityRay(154, 11, ru ? "Костанай" : "Қостанай", BLUE, -10, -34, -58, 34);
    var capP = cityRay(20, 7, ru ? "Павлодар" : "Павлодар", ORANGE, 46, -24, 56, 32);
    var capJ = cityRay(249, 10, ru ? "Жезказган" : "Жезқазған", PURPLE, 72, 16, 72, 42);

    el("circle", { cx: cx, cy: cy, r: 6.5, fill: DARK }, svg);
    txt(svg, cx + 14, cy + 22, "O (Астана)", { size: 14.5, weight: 700, fill: DARK, anchor: "start" });

    var answered = false;
    return {
      showAnswers: function () {
        if (answered) return;
        answered = true;
        [[capK, "11 · 60 = 660 км"], [capP, "7 · 60 = 420 км"], [capJ, "10 · 60 = 600 км"]].forEach(function (c) {
          c[0].textContent = c[1];
          c[0].setAttribute("fill", GREEN);
        });
      },
    };
  },

  explanation: {
    kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> санақ басы — \\(O\\) (Астана); бірлік кесінді \\(= 60\\) км; әр қала өз сәулесінде белгіленген.</p><p><b>Табу керек:</b> әр қалаға дейінгі қашықтық \\(= \\,?\\) (км)</p></div><div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Қашықтық = бірлік саны × бірлік кесіндінің ұзындығы</div></div><p><b>Қостанай:</b> сәулесінде 11 бірлік — \\(S = 11 \\cdot 60 = 660\\) км.</p><p><b>Павлодар:</b> 7 бірлік — \\(S = 7 \\cdot 60 = 420\\) км.</p><p><b>Жезқазған:</b> 10 бірлік — \\(S = 10 \\cdot 60 = 600\\) км.</p><div class=\"lf-answer\">Астанадан: Қостанай — \\(\\approx 660\\) км, Павлодар — \\(\\approx 420\\) км, Жезқазған — \\(\\approx 600\\) км.</div><div class=\"lf-callout\">Нақты қашықтықтар да осыған жуық: карта бойынша ≈ 660, ≈ 420 және ≈ 600 км.</div>",
    ru: "<div class=\"lf-given\"><p><b>Дано:</b> начало отсчёта — \\(O\\) (Астана); единичный отрезок \\(= 60\\) км; каждый город отмечен на своём луче.</p><p><b>Найти:</b> расстояние до каждого города \\(= \\,?\\) (км)</p></div><div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Расстояние = число единиц × длина единичного отрезка</div></div><p><b>Костанай:</b> на его луче 11 единиц — \\(S = 11 \\cdot 60 = 660\\) км.</p><p><b>Павлодар:</b> 7 единиц — \\(S = 7 \\cdot 60 = 420\\) км.</p><p><b>Жезказган:</b> 10 единиц — \\(S = 10 \\cdot 60 = 600\\) км.</p><div class=\"lf-answer\">От Астаны: Костанай — \\(\\approx 660\\) км, Павлодар — \\(\\approx 420\\) км, Жезказган — \\(\\approx 600\\) км.</div><div class=\"lf-callout\">Реальные расстояния близки к этим: по карте ≈ 660, ≈ 420 и ≈ 600 км.</div>",
  },

  wireExplanation(root, ctx) {
    if (ctx.visual && typeof ctx.visual.showAnswers === "function") ctx.visual.showAnswers();
  },
});
})();
