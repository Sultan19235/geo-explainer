/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-aldar-kose",
  "number": "23",
  "title": { "kz": "Алдаркөсе", "ru": "Алдар-Косе" },
  "difficulty": "med",
  "tags": [ { "kz": "қозғалыс", "ru": "движение" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №23 — document-mode problem with an ANIMATED scene: Aldar Köse rides from
// O to Shygaibai's house at A(8); unit = 40 m, speed 80 m/min. The teacher
// plays the motion (1 s of animation = 1 minute); the explanation reveal
// annotates the figure and gets its own replay button.

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", RED = "#dc2626", GREEN = "#16a34a", PURPLE = "#7c3aed";

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
function fmtMin(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); }

registerLessonProblem({
  format: 1,
  id: "coord-ray-aldar-kose",
  number: "23",
  title: { kz: "Алдаркөсе", ru: "Алдар-Косе" },
  difficulty: "med",
  tags: [{ kz: "қозғалыс", ru: "движение" }],

  statement: {
    kz: "<p>Алдаркөсе \\(80\\) м/мин жылдамдықпен Шығайбайдың үйіне келе жатыр. Координаталық сәуледе Шығайбайдың үйі \\(A\\) нүктесімен кескінделген, ал бірлік кесінді \\(40\\) метрге сәйкес. 1) <b class=\"lf-find\">\\(A\\) нүктесінің координатасын табыңдар</b>; 2) <b class=\"lf-find\">Алдаркөсе үйге неше минутта жетеді?</b></p>",
    ru: "<p>Алдар-Косе идёт к дому Шыгайбая со скоростью \\(80\\) м/мин. На координатном луче дом Шыгайбая изображён точкой \\(A\\), а единичный отрезок соответствует \\(40\\) метрам. 1) <b class=\"lf-find\">Найдите координату точки \\(A\\)</b>; 2) <b class=\"lf-find\">за сколько минут Алдар-Косе дойдёт до дома?</b></p>",
  },

  visual(root, ctx) {
    var ru = ctx.lang === "ru";
    var svg = el("svg", { viewBox: "0 0 880 250", style: "width:100%;height:auto;display:block" });
    root.appendChild(svg);

    // Legend: what one unit and the speed are.
    txt(svg, 70, 34,
      ru ? "1 единичный отрезок = 40 м · скорость 80 м/мин" : "1 бірлік кесінді = 40 м · жылдамдық 80 м/мин",
      { size: 13.5, fill: GRAY, anchor: "start" });

    var X = ray(svg, { x0: 70, y: 150, unit: 66, maxV: 10, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });

    // Shygaibai's house at A(8) — raised well above the rider's lane so the
    // arriving horse stops under the tent instead of covering it.
    txt(svg, X(8), 80, "⛺", { size: 30 });
    el("circle", { cx: X(8), cy: 150, r: 6, fill: RED }, svg);
    var capA = txt(svg, X(8), 44, "A = ?", { size: 16, weight: 700, fill: RED });
    var check = txt(svg, X(8) + 28, 74, "✓", { size: 22, weight: 700, fill: GREEN });
    check.style.display = "none";

    // Aldar Köse — the moving actor, riding just above the ray.
    var rider = el("g", {}, svg);
    txt(rider, X(0), 140, "🐎", { size: 30 });

    // Answer annotations (shown on explanation reveal).
    var span = el("g", {}, svg);
    el("line", { x1: X(0), y1: 206, x2: X(8), y2: 206, stroke: PURPLE, "stroke-width": 4, "stroke-linecap": "round" }, span);
    el("line", { x1: X(0), y1: 198, x2: X(0), y2: 214, stroke: PURPLE, "stroke-width": 2.5 }, span);
    el("line", { x1: X(8), y1: 198, x2: X(8), y2: 214, stroke: PURPLE, "stroke-width": 2.5 }, span);
    txt(span, X(4), 234, "320 м", { size: 15, weight: 700, fill: PURPLE });
    span.style.display = "none";

    // Controls + live badges under the figure.
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:10px;";
    var btn = document.createElement("button");
    btn.textContent = ru ? "▶ Запустить" : "▶ Ойнату";
    btn.style.cssText = "background:#2563eb;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;";
    var tBadge = document.createElement("span");
    var sBadge = document.createElement("span");
    [tBadge, sBadge].forEach(function (b) {
      b.style.cssText = "background:#f1f3f7;color:#1a1a2e;border-radius:999px;padding:7px 16px;font-size:13.5px;font-weight:600;";
    });
    bar.appendChild(btn); bar.appendChild(tBadge); bar.appendChild(sBadge);
    root.appendChild(bar);

    var raf = 0;
    function setState(p) { // p ∈ [0,1] → 4 minutes, 320 m, 8 units
      var dx = p * (X(8) - X(0));
      rider.setAttribute("transform", "translate(" + dx + ",0)");
      tBadge.textContent = "t = " + fmtMin(4 * p) + " мин";
      sBadge.textContent = "S = " + Math.round(320 * p) + " м";
      check.style.display = p >= 1 ? "" : "none";
    }
    function play() {
      cancelAnimationFrame(raf);
      var t0 = 0;
      btn.textContent = ru ? "⟲ Ещё раз" : "⟲ Қайталау";
      function frame(now) {
        if (!t0) t0 = now;
        var p = Math.min(1, (now - t0) / 4000); // 1 s of animation = 1 minute
        setState(p);
        if (p < 1) raf = requestAnimationFrame(frame);
      }
      setState(0);
      raf = requestAnimationFrame(frame);
    }
    btn.onclick = play;
    setState(0);

    var answered = false;
    return {
      play: play,
      showAnswers: function () {
        if (answered) return;
        answered = true;
        capA.textContent = "A(8)";
        capA.setAttribute("fill", GREEN);
        span.style.display = "";
      },
      destroy: function () { cancelAnimationFrame(raf); },
    };
  },

  explanation: {
    kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> жылдамдық \\(v = 80\\) м/мин; бірлік кесінді \\(= 40\\) м; үй — \\(A\\) нүктесінде.</p><p><b>Табу керек:</b> 1) \\(A\\)-ның координатасы; 2) жол уақыты \\(t\\).</p></div><p><b>1)</b> Суреттегі штрихтарды санаймыз: \\(O\\)-дан үйге дейін 8 бірлік кесінді бар, демек</p><div class=\"lf-answer\">1) \\(A(8)\\)</div><p><b>2)</b> Бір бірлік кесінді — \\(40\\) м, ал \\(A\\)-ға дейін 8 бірлік:</p><div class=\"lf-formula\">\\[ S = 8 \\cdot 40 = 320 \\text{ м} \\]<div class=\"lf-formula-label\">Қашықтық</div></div><div class=\"lf-formula\">\\[ t = S : v = 320 : 80 = 4 \\text{ мин} \\]<div class=\"lf-formula-label\">Уақыт</div></div><div class=\"lf-answer\">1) \\(A(8)\\); &nbsp; 2) Алдаркөсе үйге \\(4\\) минутта жетеді.</div><div class=\"lf-callout\">Тексеру: 4 минутта \\(80 \\cdot 4 = 320\\) м жүреді — дәл \\(A\\)-ға дейінгі қашықтық. ✓</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Қозғалысты тағы көру</button></p>",
    ru: "<div class=\"lf-given\"><p><b>Дано:</b> скорость \\(v = 80\\) м/мин; единичный отрезок \\(= 40\\) м; дом — в точке \\(A\\).</p><p><b>Найти:</b> 1) координату \\(A\\); 2) время пути \\(t\\).</p></div><p><b>1)</b> Считаем штрихи на рисунке: от \\(O\\) до дома — 8 единичных отрезков, значит</p><div class=\"lf-answer\">1) \\(A(8)\\)</div><p><b>2)</b> Один единичный отрезок — \\(40\\) м, а до \\(A\\) — 8 единиц:</p><div class=\"lf-formula\">\\[ S = 8 \\cdot 40 = 320 \\text{ м} \\]<div class=\"lf-formula-label\">Расстояние</div></div><div class=\"lf-formula\">\\[ t = S : v = 320 : 80 = 4 \\text{ мин} \\]<div class=\"lf-formula-label\">Время</div></div><div class=\"lf-answer\">1) \\(A(8)\\); &nbsp; 2) Алдар-Косе дойдёт до дома за \\(4\\) минуты.</div><div class=\"lf-callout\">Проверка: за 4 минуты он пройдёт \\(80 \\cdot 4 = 320\\) м — ровно расстояние до \\(A\\). ✓</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Посмотреть движение ещё раз</button></p>",
  },

  wireExplanation(root, ctx) {
    var visual = ctx.visual;
    if (visual && typeof visual.showAnswers === "function") visual.showAnswers();
    var buttons = root.querySelectorAll(".lf-replay");
    Array.prototype.forEach.call(buttons, function (b) {
      b.onclick = function () {
        if (visual && typeof visual.play === "function") visual.play();
      };
    });
  },
});
})();
