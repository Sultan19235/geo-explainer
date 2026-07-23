/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-read-coordinates",
  "number": "19",
  "title": { "kz": "Координаталарды оқу", "ru": "Чтение координат" },
  "difficulty": "easy",
  "tags": [ { "kz": "координаталарды оқу", "ru": "чтение координат" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №19 — document-mode (mini-page) problem: statement → SVG figure →
// hidden explanation. Static textbook-style rays, drawn with plain SVG.

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", RED = "#dc2626", GREEN = "#16a34a";

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
// Coordinate ray: arrowed line from 0, ticks (taller every `big`), number
// labels under the listed values. Returns v→x pixel mapper.
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
    txt(svg, X(v), o.y + (o.labelDy || 30), String(v), { size: 16, weight: 600 });
  });
  txt(svg, X(0) - 10, o.y - 12, "O", { size: 16, weight: 600, anchor: "end" });
  return X;
}

registerLessonProblem({
  format: 1,
  id: "coord-ray-read-coordinates",
  number: "19",
  title: { kz: "Координаталарды оқу", ru: "Чтение координат" },
  difficulty: "easy",
  tags: [{ kz: "координаталарды оқу", ru: "чтение координат" }],

  statement: {
    kz: "<p>Координаталық сәуледе \\(A\\), \\(B\\), \\(C\\) және \\(D\\) нүктелеріне <b class=\"lf-find\">қандай сандар сәйкес келетінін анықтаңдар</b>. \\(A\\), \\(B\\), \\(C\\) және \\(D\\) нүктелерін координаталарымен жазыңдар.</p><p>1) бірлік кесінді — 1 штрих; &nbsp; 2) штрихтар 5-тен саналады.</p>",
    ru: "<p><b class=\"lf-find\">Определите, какие числа соответствуют</b> точкам \\(A\\), \\(B\\), \\(C\\) и \\(D\\) на координатном луче. Запишите точки \\(A\\), \\(B\\), \\(C\\) и \\(D\\) с их координатами.</p><p>1) единичный отрезок — 1 штрих; &nbsp; 2) штрихи считаются по 5.</p>",
  },

  visual(root) {
    var svg = el("svg", { viewBox: "0 0 880 300", style: "width:100%;height:auto;display:block" });
    root.appendChild(svg);

    // 1) unit segment = one tick; only 0 and 1 are labelled.
    txt(svg, 22, 76, "1)", { size: 17, weight: 700, fill: GRAY, anchor: "start" });
    var X1 = ray(svg, { x0: 84, y: 70, unit: 54, maxV: 13, labels: [0, 1] });
    var caps1 = {};
    [["A", 3], ["B", 6], ["C", 7], ["D", 10]].forEach(function (p) {
      el("circle", { cx: X1(p[1]), cy: 70, r: 6, fill: RED }, svg);
      caps1[p[0]] = txt(svg, X1(p[1]), 48, p[0], { size: 16, weight: 700, fill: RED });
    });

    // 2) small ticks each 1, tall each 5; only 0 and 5 are labelled.
    txt(svg, 22, 216, "2)", { size: 17, weight: 700, fill: GRAY, anchor: "start" });
    var X2 = ray(svg, { x0: 84, y: 210, unit: 14.4, maxV: 50, big: 5, tick: 6, labels: [0, 5] });
    var caps2 = {}, hiddenLabels = [];
    [["A", 5], ["B", 20], ["C", 35], ["D", 50]].forEach(function (p) {
      el("circle", { cx: X2(p[1]), cy: 210, r: 6, fill: RED }, svg);
      caps2[p[0]] = txt(svg, X2(p[1]), 188, p[0], { size: 16, weight: 700, fill: RED });
    });

    var answered = false;
    return {
      // Explanation reveal annotates the figure: coordinates appear on the
      // points, the counted-by-five labels fill in on ray 2.
      showAnswers: function () {
        if (answered) return;
        answered = true;
        var a1 = { A: 3, B: 6, C: 7, D: 10 }, a2 = { A: 5, B: 20, C: 35, D: 50 };
        ["A", "B", "C", "D"].forEach(function (n) {
          caps1[n].textContent = n + "(" + a1[n] + ")";
          caps1[n].setAttribute("fill", GREEN);
          caps2[n].textContent = n + "(" + a2[n] + ")";
          caps2[n].setAttribute("fill", GREEN);
        });
        [10, 15, 20, 25, 30, 35, 40, 45].forEach(function (v) {
          hiddenLabels.push(txt(svg, X2(v), 240, String(v), { size: 14, weight: 500, fill: GRAY }));
        });
      },
    };
  },

  explanation: {
    kz: "<p><b>1-сурет.</b> Бірлік кесінді — көрші штрихтардың арасы. Координатаны табу үшін санақ басынан (\\(O\\)) бастап бірлік кесінділерді санаймыз: \\(A\\) — 3-ші штрихта, \\(B\\) — 6-шы, \\(C\\) — 7-ші, \\(D\\) — 10-шы штрихта.</p><div class=\"lf-answer\">1) \\(A(3),\\; B(6),\\; C(7),\\; D(10)\\)</div><p><b>2-сурет.</b> Мұнда тек \\(0\\) мен \\(5\\) жазылған: биік штрихтардың арасы — 5 бірлік, ұсақ штрихтардың арасы — 1 бірлік. Биік штрихтарды бестен санаймыз: \\(5, 10, 15, \\ldots\\)</p><div class=\"lf-answer\">2) \\(A(5),\\; B(20),\\; C(35),\\; D(50)\\)</div><div class=\"lf-callout\">Координата — санақ басынан нүктеге дейінгі бірлік кесінділердің саны.</div>",
    ru: "<p><b>Рисунок 1.</b> Единичный отрезок — расстояние между соседними штрихами. Чтобы найти координату, считаем единичные отрезки от начала отсчёта (\\(O\\)): \\(A\\) — на 3-м штрихе, \\(B\\) — на 6-м, \\(C\\) — на 7-м, \\(D\\) — на 10-м.</p><div class=\"lf-answer\">1) \\(A(3),\\; B(6),\\; C(7),\\; D(10)\\)</div><p><b>Рисунок 2.</b> Здесь подписаны только \\(0\\) и \\(5\\): между высокими штрихами — 5 единиц, между мелкими — 1 единица. Считаем высокие штрихи по пять: \\(5, 10, 15, \\ldots\\)</p><div class=\"lf-answer\">2) \\(A(5),\\; B(20),\\; C(35),\\; D(50)\\)</div><div class=\"lf-callout\">Координата — число единичных отрезков от начала отсчёта до точки.</div>",
  },

  wireExplanation(root, ctx) {
    if (ctx.visual && typeof ctx.visual.showAnswers === "function") {
      ctx.visual.showAnswers();
    }
  },
});
})();
