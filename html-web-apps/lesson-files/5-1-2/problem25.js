/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-grasshopper",
  "number": "25",
  "title": { "kz": "Шегіртке", "ru": "Кузнечик" },
  "difficulty": "hard",
  "tags": [ { "kz": "заңдылық", "ru": "закономерность" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №25 — document-mode with a HOP animation: the grasshopper jumps
// 3 → 1 → 6 → 4 → 9 → 7 → 12 → 10 → 15 along parabolic arcs, leaving a
// green trace; the reveal marks which candidate points it visits.

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", GREEN = "#16a34a", ORANGE = "#ea580c";
var SEQ = [3, 1, 6, 4, 9, 7, 12, 10, 15];
var HOP_MS = 520, PAUSE_MS = 180;

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
  var end = X(o.maxV) + (o.over || 26);
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
  id: "coord-ray-grasshopper",
  number: "25",
  title: { kz: "Шегіртке", ru: "Кузнечик" },
  difficulty: "hard",
  tags: [{ kz: "заңдылық", ru: "закономерность" }],

  statement: {
    kz: "<p>Шегіртке координаталық сәуле бойымен \\(A(3)\\) нүктесінен солға қарай 2 бірлік кесіндіге секірген соң, оңға қарай 5 бірлік кесіндіге секіреді. Шегіртке осылайша қозғалысты жалғастырады. <b class=\"lf-find\">Шегіртке координатасы 2, 4, 5, 7, 9 және 12 нүктелерінің қайсысында болады?</b></p>",
    ru: "<p>По координатному лучу кузнечик из точки \\(A(3)\\) прыгает на 2 единичных отрезка влево, затем на 5 единичных отрезков вправо, и так продолжает. <b class=\"lf-find\">В каких из точек с координатами 2, 4, 5, 7, 9 и 12 побывает кузнечик?</b></p>",
  },

  visual(root, ctx) {
    var ru = ctx.lang === "ru";
    var svg = el("svg", { viewBox: "0 0 880 270", style: "width:100%;height:auto;display:block" });
    root.appendChild(svg);

    txt(svg, 70, 32, ru ? "влево 2 → вправо 5 → влево 2 → …" : "солға 2 → оңға 5 → солға 2 → …",
      { size: 13.5, fill: GRAY, anchor: "start" });

    var X = ray(svg, { x0: 70, y: 180, unit: 42, maxV: 18, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] });

    // Candidate points to test (orange, on the ray).
    var verdicts = {};
    [2, 4, 5, 7, 9, 12].forEach(function (v) {
      el("circle", { cx: X(v), cy: 180, r: 5, fill: ORANGE }, svg);
      verdicts[v] = txt(svg, X(v), 240, "", { size: 14, weight: 700, fill: GREEN });
    });

    // Start point.
    el("circle", { cx: X(3), cy: 180, r: 6, fill: GREEN }, svg);
    txt(svg, X(3), 150, "A(3)", { size: 14.5, weight: 700, fill: GREEN });

    // Trace layer (arcs + visited dots, added as the grasshopper lands).
    var trace = el("g", {}, svg);
    var hopper = txt(svg, X(3), 172, "🦗", { size: 26 });

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:10px;";
    var btn = document.createElement("button");
    btn.textContent = ru ? "▶ Прыжки" : "▶ Секірулер";
    btn.style.cssText = "background:#2563eb;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;";
    var pBadge = document.createElement("span");
    pBadge.style.cssText = "background:#f1f3f7;color:#1a1a2e;border-radius:999px;padding:7px 16px;font-size:13.5px;font-weight:600;";
    bar.appendChild(btn); bar.appendChild(pBadge);
    root.appendChild(bar);

    var raf = 0, timer = 0;
    function resetRun() {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      trace.innerHTML = "";
      hopper.setAttribute("x", X(3));
      hopper.setAttribute("y", 172);
      pBadge.textContent = "3";
    }
    function drawArc(a, b) {
      var h = Math.min(56, Math.abs(X(b) - X(a)) * 0.4);
      el("path", {
        d: "M" + X(a) + " 172 Q " + (X(a) + X(b)) / 2 + " " + (172 - h * 2) + " " + X(b) + " 172",
        fill: "none", stroke: GREEN, "stroke-width": 2.5, "stroke-dasharray": "5 4", opacity: 0.75,
      }, trace);
      el("circle", { cx: X(b), cy: 180, r: 5, fill: GREEN }, trace);
    }
    function hop(i) {
      if (i >= SEQ.length - 1) { btn.textContent = ru ? "⟲ Ещё раз" : "⟲ Қайталау"; return; }
      var a = SEQ[i], b = SEQ[i + 1];
      var h = Math.min(56, Math.abs(X(b) - X(a)) * 0.4);
      var t0 = 0;
      function frame(now) {
        if (!t0) t0 = now;
        var p = Math.min(1, (now - t0) / HOP_MS);
        hopper.setAttribute("x", X(a) + (X(b) - X(a)) * p);
        hopper.setAttribute("y", 172 - h * 2 * p * (1 - p) * 2);
        if (p < 1) { raf = requestAnimationFrame(frame); return; }
        drawArc(a, b);
        pBadge.textContent = pBadge.textContent + " → " + b;
        timer = window.setTimeout(function () { hop(i + 1); }, PAUSE_MS);
      }
      raf = requestAnimationFrame(frame);
    }
    function play() {
      resetRun();
      hop(0);
    }
    btn.onclick = play;
    resetRun();

    var answered = false;
    return {
      play: play,
      showAnswers: function () {
        if (answered) return;
        answered = true;
        [4, 7, 9, 12].forEach(function (v) { verdicts[v].textContent = v + " ✓"; });
        [2, 5].forEach(function (v) {
          verdicts[v].textContent = v + " ✗";
          verdicts[v].setAttribute("fill", GRAY);
        });
      },
      destroy: function () { cancelAnimationFrame(raf); clearTimeout(timer); },
    };
  },

  explanation: {
    kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> бастапқы нүкте \\(A(3)\\); секірулер: солға 2, оңға 5, солға 2, оңға 5, …</p><p><b>Табу керек:</b> 2, 4, 5, 7, 9, 12 нүктелерінің қайсысында болады?</p></div><p><b>Жолды жазамыз:</b> \\(3 - 2 = 1\\), \\(1 + 5 = 6\\), \\(6 - 2 = 4\\), \\(4 + 5 = 9\\), \\(9 - 2 = 7\\), \\(7 + 5 = 12\\), \\(12 - 2 = 10\\), \\(10 + 5 = 15, \\ldots\\)</p><p>Жол: \\(3,\\; 1,\\; 6,\\; 4,\\; 9,\\; 7,\\; 12,\\; 10,\\; 15,\\; \\ldots\\)</p><p><b>Заңдылық:</b> әр <b>екі</b> секіру шегірткені \\(5 - 2 = 3\\) бірлікке оңға жылжытады. Сондықтан ол екі тізбектің сандарында ғана болады:</p><p>• \\(3, 6, 9, 12, 15, \\ldots\\) (3-тен бастап +3);</p><p>• \\(1, 4, 7, 10, 13, \\ldots\\) (1-ден бастап +3).</p><p>Тексереміз: \\(4\\) ✓, \\(7\\) ✓, \\(9\\) ✓, \\(12\\) ✓; ал \\(2\\) мен \\(5\\) — екі тізбекте де жоқ. ✗</p><div class=\"lf-answer\">Шегіртке \\(4,\\; 7,\\; 9,\\; 12\\) нүктелерінде болады; \\(2\\) мен \\(5\\) нүктелеріне ешқашан түспейді.</div><div class=\"lf-callout\">Кілт идея: жеке секірулер емес, ЕКІ секірудің қосындысы (+3) заңдылық береді.</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Секірулерді тағы көру</button></p>",
    ru: "<div class=\"lf-given\"><p><b>Дано:</b> начальная точка \\(A(3)\\); прыжки: влево 2, вправо 5, влево 2, вправо 5, …</p><p><b>Найти:</b> в каких из точек 2, 4, 5, 7, 9, 12 он побывает?</p></div><p><b>Записываем путь:</b> \\(3 - 2 = 1\\), \\(1 + 5 = 6\\), \\(6 - 2 = 4\\), \\(4 + 5 = 9\\), \\(9 - 2 = 7\\), \\(7 + 5 = 12\\), \\(12 - 2 = 10\\), \\(10 + 5 = 15, \\ldots\\)</p><p>Путь: \\(3,\\; 1,\\; 6,\\; 4,\\; 9,\\; 7,\\; 12,\\; 10,\\; 15,\\; \\ldots\\)</p><p><b>Закономерность:</b> каждые <b>два</b> прыжка сдвигают кузнечика на \\(5 - 2 = 3\\) единицы вправо. Поэтому он бывает только в числах двух последовательностей:</p><p>• \\(3, 6, 9, 12, 15, \\ldots\\) (от 3 с шагом +3);</p><p>• \\(1, 4, 7, 10, 13, \\ldots\\) (от 1 с шагом +3).</p><p>Проверяем: \\(4\\) ✓, \\(7\\) ✓, \\(9\\) ✓, \\(12\\) ✓; а \\(2\\) и \\(5\\) нет ни в одной. ✗</p><div class=\"lf-answer\">Кузнечик побывает в точках \\(4,\\; 7,\\; 9,\\; 12\\); в точки \\(2\\) и \\(5\\) он не попадёт никогда.</div><div class=\"lf-callout\">Ключевая идея: закономерность даёт не отдельный прыжок, а СУММА двух прыжков (+3).</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Посмотреть прыжки ещё раз</button></p>",
  },

  wireExplanation(root, ctx) {
    var visual = ctx.visual;
    if (visual && typeof visual.showAnswers === "function") visual.showAnswers();
    Array.prototype.forEach.call(root.querySelectorAll(".lf-replay"), function (b) {
      b.onclick = function () {
        if (visual && typeof visual.play === "function") visual.play();
      };
    });
  },
});
})();
