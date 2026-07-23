/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-boy-and-dog",
  "number": "24",
  "title": { "kz": "Бала мен ит", "ru": "Мальчик и собака" },
  "difficulty": "med",
  "tags": [ { "kz": "қарсы қозғалыс", "ru": "встречное движение" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №24 — document-mode with an ANIMATED head-on scene: the boy (3 m/s) and
// the dog (5 m/s) run toward each other from 3 and 11 (unit = 30 m) and
// meet at 6 after 30 s. 4.5 s of animation = the whole 30 s.

var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", GREEN = "#16a34a", RED = "#dc2626", PURPLE = "#7c3aed";

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
  id: "coord-ray-boy-and-dog",
  number: "24",
  title: { kz: "Бала мен ит", ru: "Мальчик и собака" },
  difficulty: "med",
  tags: [{ kz: "қарсы қозғалыс", ru: "встречное движение" }],

  statement: {
    kz: "<p>Суреттегі баланың және оның итінің тұрған орындарына сәйкес нүктелердің <b class=\"lf-find\">координаталарын табыңдар</b>. Бала \\(3\\) м/с, ит \\(5\\) м/с жылдамдықпен бір-біріне қарсы жүгіреді. 1) Егер бірлік кесінді \\(30\\) м-ге тең болса, <b class=\"lf-find\">олар неше метр қашықтықтан жүгіріп келеді?</b> 2) <b class=\"lf-find\">Бала мен ит неше секундтан соң кездеседі?</b></p>",
    ru: "<p><b class=\"lf-find\">Найдите координаты</b> точек, где стоят мальчик и его собака. Мальчик бежит со скоростью \\(3\\) м/с, собака — \\(5\\) м/с, навстречу друг другу. 1) Если единичный отрезок равен \\(30\\) м, <b class=\"lf-find\">с какого расстояния они бегут навстречу друг другу?</b> 2) <b class=\"lf-find\">Через сколько секунд мальчик и собака встретятся?</b></p>",
  },

  visual(root, ctx) {
    var ru = ctx.lang === "ru";
    var svg = el("svg", { viewBox: "0 0 880 280", style: "width:100%;height:auto;display:block" });
    root.appendChild(svg);

    txt(svg, 80, 34,
      ru ? "1 единичный отрезок = 30 м · мальчик 3 м/с · собака 5 м/с" : "1 бірлік кесінді = 30 м · бала 3 м/с · ит 5 м/с",
      { size: 13.5, fill: GRAY, anchor: "start" });

    var X = ray(svg, { x0: 80, y: 170, unit: 50, maxV: 14, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] });

    el("circle", { cx: X(3), cy: 170, r: 6, fill: RED }, svg);
    var capB = txt(svg, X(3), 92, "?", { size: 16, weight: 700, fill: RED });
    el("circle", { cx: X(11), cy: 170, r: 6, fill: RED }, svg);
    var capD = txt(svg, X(11), 92, "?", { size: 16, weight: 700, fill: RED });

    // Meet point at 6 — hidden until the run finishes.
    var meet = el("g", {}, svg);
    el("circle", { cx: X(6), cy: 170, r: 6, fill: GREEN }, meet);
    txt(meet, X(6), 92, ru ? "встреча · 30 с" : "кездесу · 30 с", { size: 14, weight: 700, fill: GREEN });
    meet.style.display = "none";

    // The runners: boy from 3 rightward, dog from 11 leftward; the dog is
    // drawn a step to the right so at the meet they stand side by side.
    var boy = el("g", {}, svg);
    txt(boy, X(3), 138, "🏃", { size: 30 });
    var dog = el("g", {}, svg);
    txt(dog, X(11) + 20, 138, "🐕", { size: 30 });

    // Answer annotation (explanation reveal): the 240-m span.
    var span = el("g", {}, svg);
    el("line", { x1: X(3), y1: 226, x2: X(11), y2: 226, stroke: PURPLE, "stroke-width": 4, "stroke-linecap": "round" }, span);
    el("line", { x1: X(3), y1: 218, x2: X(3), y2: 234, stroke: PURPLE, "stroke-width": 2.5 }, span);
    el("line", { x1: X(11), y1: 218, x2: X(11), y2: 234, stroke: PURPLE, "stroke-width": 2.5 }, span);
    txt(span, X(7), 254, "240 м", { size: 15, weight: 700, fill: PURPLE });
    span.style.display = "none";

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:10px;";
    var btn = document.createElement("button");
    btn.textContent = ru ? "▶ Запустить" : "▶ Ойнату";
    btn.style.cssText = "background:#2563eb;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;";
    var tBadge = document.createElement("span");
    var gBadge = document.createElement("span");
    [tBadge, gBadge].forEach(function (b) {
      b.style.cssText = "background:#f1f3f7;color:#1a1a2e;border-radius:999px;padding:7px 16px;font-size:13.5px;font-weight:600;";
    });
    bar.appendChild(btn); bar.appendChild(tBadge); bar.appendChild(gBadge);
    root.appendChild(bar);

    var raf = 0;
    function setState(p) { // p ∈ [0,1] → 30 seconds
      var t = 30 * p;
      var boyX = 3 + (3 / 30) * t, dogX = 11 - (5 / 30) * t;
      boy.setAttribute("transform", "translate(" + ((boyX - 3) * 50) + ",0)");
      dog.setAttribute("transform", "translate(" + ((dogX - 11) * 50) + ",0)");
      meet.style.display = p >= 1 ? "" : "none";
      tBadge.textContent = "t = " + Math.round(t) + " с";
      gBadge.textContent = (ru ? "расстояние: " : "ара қашықтық: ") + Math.round(240 - 8 * t) + " м";
    }
    function play() { // 4.5 s of animation = the 30-second run
      cancelAnimationFrame(raf);
      var t0 = 0;
      btn.textContent = ru ? "⟲ Ещё раз" : "⟲ Қайталау";
      function frame(now) {
        if (!t0) t0 = now;
        var p = Math.min(1, (now - t0) / 4500);
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
        capB.textContent = "3";
        capB.setAttribute("fill", GREEN);
        capD.textContent = "11";
        capD.setAttribute("fill", GREEN);
        span.style.display = "";
      },
      destroy: function () { cancelAnimationFrame(raf); },
    };
  },

  explanation: {
    kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> бірлік кесінді \\(= 30\\) м; жылдамдықтар: бала — \\(3\\) м/с, ит — \\(5\\) м/с; қарсы қозғалыс.</p><p><b>Табу керек:</b> координаталар; қашықтық \\(S\\); кездесу уақыты \\(t\\).</p></div><p><b>Координаталар.</b> Штрихтарды санаймыз: бала — 3-те, ит — 11-де.</p><p><b>1) Қашықтық.</b> Араларында \\(11 - 3 = 8\\) бірлік кесінді бар, әрқайсысы \\(30\\) м:</p><div class=\"lf-formula\">\\[ S = (11 - 3) \\cdot 30 = 8 \\cdot 30 = 240 \\text{ м} \\]<div class=\"lf-formula-label\">Қашықтық</div></div><p><b>2) Кездесу уақыты.</b> Қарсы қозғалыста жақындасу жылдамдығы — екі жылдамдықтың <b>қосындысы</b>: \\(3 + 5 = 8\\) м/с.</p><div class=\"lf-formula\">\\[ t = S : (v_1 + v_2) = 240 : 8 = 30 \\text{ с} \\]<div class=\"lf-formula-label\">Кездесу уақыты</div></div><div class=\"lf-answer\">Координаталар: \\(3\\) және \\(11\\); &nbsp; 1) \\(240\\) м; &nbsp; 2) \\(30\\) секундтан соң кездеседі.</div><div class=\"lf-callout\">Тексеру: 30 секундта бала \\(3 \\cdot 30 = 90\\) м, ит \\(5 \\cdot 30 = 150\\) м жүгіреді; \\(90 + 150 = 240\\) м. ✓</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Қозғалысты тағы көру</button></p>",
    ru: "<div class=\"lf-given\"><p><b>Дано:</b> единичный отрезок \\(= 30\\) м; скорости: мальчик — \\(3\\) м/с, собака — \\(5\\) м/с; движение навстречу.</p><p><b>Найти:</b> координаты; расстояние \\(S\\); время встречи \\(t\\).</p></div><p><b>Координаты.</b> Считаем штрихи: мальчик — на 3, собака — на 11.</p><p><b>1) Расстояние.</b> Между ними \\(11 - 3 = 8\\) единичных отрезков, каждый по \\(30\\) м:</p><div class=\"lf-formula\">\\[ S = (11 - 3) \\cdot 30 = 8 \\cdot 30 = 240 \\text{ м} \\]<div class=\"lf-formula-label\">Расстояние</div></div><p><b>2) Время встречи.</b> При встречном движении скорость сближения — <b>сумма</b> двух скоростей: \\(3 + 5 = 8\\) м/с.</p><div class=\"lf-formula\">\\[ t = S : (v_1 + v_2) = 240 : 8 = 30 \\text{ с} \\]<div class=\"lf-formula-label\">Время встречи</div></div><div class=\"lf-answer\">Координаты: \\(3\\) и \\(11\\); &nbsp; 1) \\(240\\) м; &nbsp; 2) встретятся через \\(30\\) секунд.</div><div class=\"lf-callout\">Проверка: за 30 секунд мальчик пробежит \\(3 \\cdot 30 = 90\\) м, собака \\(5 \\cdot 30 = 150\\) м; \\(90 + 150 = 240\\) м. ✓</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Посмотреть движение ещё раз</button></p>",
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
