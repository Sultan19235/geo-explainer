/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-midpoint",
  "number": "21",
  "title": { "kz": "Кесіндінің қақ ортасы", "ru": "Середина отрезка" },
  "difficulty": "med",
  "tags": [ { "kz": "кесіндінің ортасы", "ru": "середина отрезка" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №21 — document-mode: two rays (the two cases), A and B marked; the reveal
// draws each midpoint C with the equal green half-spans.

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", BLUE = "#2563eb", GREEN = "#16a34a", RED = "#dc2626";

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

// One case: A and B marked immediately; the hidden group carries C and the
// equal half-span markers.
function midCase(svg, y, a, b, half) {
  var X = ray(svg, { x0: 84, y: y, unit: 56, maxV: 13, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] });
  [[a, "A(" + a + ")"], [b, "B(" + b + ")"]].forEach(function (p) {
    el("circle", { cx: X(p[0]), cy: y, r: 6, fill: BLUE }, svg);
    txt(svg, X(p[0]), y - 22, p[1], { size: 15, weight: 700, fill: BLUE });
  });
  var c = (a + b) / 2;
  var hidden = el("g", {}, svg);
  el("circle", { cx: X(c), cy: y, r: 6.5, fill: RED }, hidden);
  txt(hidden, X(c), y - 46, "C(" + c + ")", { size: 15, weight: 700, fill: RED });
  [[a, c], [c, b]].forEach(function (s) {
    el("line", { x1: X(s[0]) + 8, y1: y + 24, x2: X(s[1]) - 8, y2: y + 24, stroke: GREEN, "stroke-width": 4, "stroke-linecap": "round" }, hidden);
    txt(hidden, (X(s[0]) + X(s[1])) / 2, y + 48, String(half), { size: 14, weight: 700, fill: GREEN });
  });
  hidden.style.display = "none";
  return hidden;
}

registerLessonProblem({
  format: 1,
  id: "coord-ray-midpoint",
  number: "21",
  title: { kz: "Кесіндінің қақ ортасы", ru: "Середина отрезка" },
  difficulty: "med",
  tags: [{ kz: "кесіндінің ортасы", ru: "середина отрезка" }],

  statement: {
    kz: "<p>Бірлік кесіндісі дәптердің 2 торкөзінің ұзындығына тең координаталық сәуле сызыңдар. Сәуле бойынан: 1) \\(A(4)\\) және \\(B(8)\\); 2) \\(A(3)\\) және \\(B(11)\\) нүктелерін белгілеп, <b class=\"lf-find\">\\(AB\\) кесіндісінің қақ ортасындағы \\(C\\) нүктесін координатасымен жазыңдар</b>.</p>",
    ru: "<p>Начертите координатный луч, у которого единичный отрезок равен длине 2 клеток тетради. Отметьте точки: 1) \\(A(4)\\) и \\(B(8)\\); 2) \\(A(3)\\) и \\(B(11)\\), и <b class=\"lf-find\">запишите точку \\(C\\) — середину отрезка \\(AB\\) — с её координатой</b>.</p>",
  },

  visual(root) {
    var svg = el("svg", { viewBox: "0 0 880 420", style: "width:100%;height:auto;display:block" });
    root.appendChild(svg);
    txt(svg, 26, 96, "1)", { size: 17, weight: 700, fill: GRAY, anchor: "start" });
    var h1 = midCase(svg, 90, 4, 8, 2);
    txt(svg, 26, 296, "2)", { size: 17, weight: 700, fill: GRAY, anchor: "start" });
    var h2 = midCase(svg, 290, 3, 11, 4);

    var answered = false;
    return {
      showAnswers: function () {
        if (answered) return;
        answered = true;
        h1.style.display = "";
        h2.style.display = "";
      },
    };
  },

  explanation: {
    kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> 1) \\(A(4),\\; B(8)\\); &nbsp; 2) \\(A(3),\\; B(11)\\).</p><p><b>Табу керек:</b> \\(C = \\,?\\) — \\(AB\\)-ның қақ ортасы (әр жағдайда).</p></div><p>\\(C\\) — \\(AB\\)-ның қақ ортасы болса, \\(AC = CB\\). Ортаның координатасы — шеткі координаталардың қосындысының жартысы:</p><div class=\"lf-formula\">\\[ c = (a + b) : 2 \\]<div class=\"lf-formula-label\">Кесінді ортасының координатасы</div></div><p><b>1)</b> \\(c = (4 + 8) : 2 = 12 : 2 = 6\\). Тексеру: \\(AC = 6 - 4 = 2\\), \\(CB = 8 - 6 = 2\\) — тең. ✓</p><p><b>2)</b> \\(c = (3 + 11) : 2 = 14 : 2 = 7\\). Тексеру: \\(AC = 7 - 3 = 4\\), \\(CB = 11 - 7 = 4\\) — тең. ✓</p><div class=\"lf-answer\">1) \\(C(6)\\); &nbsp; 2) \\(C(7)\\).</div><div class=\"lf-callout\">Қақ орта — шеткі екі санның «дәл ортасындағы» сан: одан \\(A\\)-ға дейін де, \\(B\\)-ға дейін де бірдей қашықтық.</div>",
    ru: "<div class=\"lf-given\"><p><b>Дано:</b> 1) \\(A(4),\\; B(8)\\); &nbsp; 2) \\(A(3),\\; B(11)\\).</p><p><b>Найти:</b> \\(C = \\,?\\) — середину \\(AB\\) (в каждом случае).</p></div><p>Если \\(C\\) — середина \\(AB\\), то \\(AC = CB\\). Координата середины — половина суммы крайних координат:</p><div class=\"lf-formula\">\\[ c = (a + b) : 2 \\]<div class=\"lf-formula-label\">Координата середины отрезка</div></div><p><b>1)</b> \\(c = (4 + 8) : 2 = 12 : 2 = 6\\). Проверка: \\(AC = 6 - 4 = 2\\), \\(CB = 8 - 6 = 2\\) — равны. ✓</p><p><b>2)</b> \\(c = (3 + 11) : 2 = 14 : 2 = 7\\). Проверка: \\(AC = 7 - 3 = 4\\), \\(CB = 11 - 7 = 4\\) — равны. ✓</p><div class=\"lf-answer\">1) \\(C(6)\\); &nbsp; 2) \\(C(7)\\).</div><div class=\"lf-callout\">Середина — число «ровно посередине» между крайними: от него одинаковое расстояние и до \\(A\\), и до \\(B\\).</div>",
  },

  wireExplanation(root, ctx) {
    if (ctx.visual && typeof ctx.visual.showAnswers === "function") ctx.visual.showAnswers();
  },
});
})();
