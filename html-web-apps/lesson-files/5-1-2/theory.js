/*__LESSON_META__
{
  "format": 1,
  "kind": "theory",
  "id": "coord-ray-theory",
  "title": { "kz": "Координаталық сәуле", "ru": "Координатный луч" }
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// 5-сынып · 1.2 «Координаталық сәуле» — document-layout theory: every
// section is text on top + a plain-SVG figure below; question sections keep
// their answers hidden until the teacher reveals them. No GeoGebra.

var SVG_NS = "http://www.w3.org/2000/svg";
var V_DARK = "#1a1a2e", V_GRAY = "#6b7280", V_BLUE = "#2563eb", V_GREEN = "#16a34a",
    V_PURPLE = "#7c3aed", V_ORANGE = "#ea580c", V_RED = "#dc2626";

function vEl(tag, attrs, parent) {
  var node = document.createElementNS(SVG_NS, tag);
  for (var key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.appendChild(node);
  return node;
}
function vTxt(parent, x, y, s, o) {
  o = o || {};
  var t = vEl("text", {
    x: x, y: y, fill: o.fill || V_DARK,
    "font-size": o.size || 15, "font-weight": o.weight || 500,
    "text-anchor": o.anchor || "middle",
    "font-family": "system-ui, -apple-system, 'Segoe UI', sans-serif"
  }, parent);
  t.textContent = s;
  return t;
}
function vRay(svg, o) {
  var X = function (v) { return o.x0 + v * o.unit; };
  var end = X(o.maxV) + (o.over || 26);
  vEl("line", { x1: X(0), y1: o.y, x2: end, y2: o.y, stroke: V_DARK, "stroke-width": 3, "stroke-linecap": "round" }, svg);
  vEl("path", { d: "M" + (end + 12) + " " + o.y + " l-14 -6 v12 z", fill: V_DARK }, svg);
  for (var v = 0; v <= o.maxV; v += (o.step || 1)) {
    var h = o.big && v % o.big === 0 ? (o.tick || 6) * 1.7 : (o.tick || 6);
    vEl("line", { x1: X(v), y1: o.y - h, x2: X(v), y2: o.y + h, stroke: V_DARK, "stroke-width": 1.6 }, svg);
  }
  (o.labels || []).forEach(function (v) {
    vTxt(svg, X(v), o.y + (o.labelDy || 28), String(v), { size: 14, weight: 600 });
  });
  vTxt(svg, X(0) - 9, o.y - 11, "O", { size: 15, weight: 600, anchor: "end" });
  return X;
}

// The intro scene (sections 1 and 2): house at 0, dog at 4 m, cat at 16 m
// on a ray with ticks every 2 m. Returns a handle whose showAnswers()
// annotates the cat's distance and the 12-m gap.
function introScene(root) {
  var svg = vEl("svg", { viewBox: "0 0 840 250", style: "width:100%;height:auto;display:block" }, root);
  var X = vRay(svg, { x0: 70, y: 140, unit: 34, maxV: 20, step: 2, tick: 7, labels: [0, 2], labelDy: 30 });
  vTxt(svg, X(0), 108, "🏠", { size: 28 });
  vTxt(svg, X(4), 108, "🐕", { size: 28 });
  vTxt(svg, X(16), 108, "🐈", { size: 28 });
  vEl("circle", { cx: X(4), cy: 140, r: 5, fill: V_ORANGE }, svg);
  vTxt(svg, X(4), 196, "4 м", { size: 14, weight: 700, fill: V_ORANGE });
  vEl("circle", { cx: X(16), cy: 140, r: 5, fill: V_RED }, svg);
  var catCap = vTxt(svg, X(16), 196, "?", { size: 15, weight: 700, fill: V_RED });
  var gap = vEl("g", {}, svg);
  vEl("line", { x1: X(4), y1: 218, x2: X(16), y2: 218, stroke: V_PURPLE, "stroke-width": 4, "stroke-linecap": "round" }, gap);
  vTxt(gap, X(10), 242, "12 м", { size: 14, weight: 700, fill: V_PURPLE });
  gap.style.display = "none";
  var answered = false;
  return {
    showAnswers: function () {
      if (answered) return;
      answered = true;
      catCap.textContent = "16 м";
      catCap.setAttribute("fill", V_GREEN);
      gap.style.display = "";
    },
  };
}

// A plain teaching ray with the unit segment highlighted (sections 4-6).
function unitRay(root, o) {
  var svg = vEl("svg", { viewBox: "0 0 840 " + (o.h || 170), style: "width:100%;height:auto;display:block" }, root);
  var X = vRay(svg, { x0: o.x0 || 80, y: o.y || 100, unit: o.unit, maxV: o.maxV, tick: 6, labels: o.labels, labelDy: 30 });
  if (o.unitSeg) {
    vEl("line", { x1: X(0), y1: o.y || 100, x2: X(1), y2: o.y || 100, stroke: V_ORANGE, "stroke-width": 6, "stroke-linecap": "round" }, svg);
    vTxt(svg, X(0.5), (o.y || 100) - 48, o.unitCap, { size: 13.5, weight: 700, fill: V_ORANGE });
    vEl("line", { x1: X(0.5), y1: (o.y || 100) - 40, x2: X(0.5), y2: (o.y || 100) - 14, stroke: V_ORANGE, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  }
  (o.points || []).forEach(function (p) {
    vEl("circle", { cx: X(p.v), cy: o.y || 100, r: p.big ? 6 : 5, fill: p.color }, svg);
    vTxt(svg, X(p.v), (o.y || 100) - 22, p.cap, { size: 14.5, weight: 700, fill: p.color });
  });
  return X;
}

registerLessonTheory({
  format: 1,
  id: "coord-ray-theory",
  title: { kz: "Координаталық сәуле", ru: "Координатный луч" },
  subtitle: { kz: "5-сынып · 1-тарау · Натурал сандар", ru: "5 класс · Глава 1 · Натуральные числа" },

  sections: [
    // ── 1. Кіріспе есеп ─────────────────────────────────────────────────────
    {
      title: { kz: "Кіріспе есеп: ит пен мысық", ru: "Вводная задача: собака и кошка" },
      html: {
        kz: "<p><b>Есеп.</b> Ит мысықты көріп, қуа жөнелді. Мысық одан \\(7\\) м/с жылдамдықпен қашса, ит оны \\(10\\) м/с жылдамдықпен қуды. Қанша уақытта ит мысықты қуып жетеді?</p><p>Суретте ит пен мысықтың бастапқы орындары сәуле бойында белгіленген: үй — \\(O\\) нүктесінде, ит үйден \\(4\\) м, мысық — одан әрі қашықтықта.</p><div class=\"lf-callout\">Суреттегі көрші штрихтардың арасы 2 метрге сәйкес келеді. Мысық үйден неше метр қашықтықта отыр? Штрихтарды санап көріңіз — жауабын келесі бөлімде тексересіз.</div>",
        ru: "<p><b>Задача.</b> Собака, увидев кошку, бросилась в погоню. Кошка убегает со скоростью \\(7\\) м/с, а собака гонится за ней со скоростью \\(10\\) м/с. Через какое время собака догонит кошку?</p><p>На рисунке начальные положения отмечены на луче: дом — в точке \\(O\\), собака в \\(4\\) м от дома, кошка — дальше.</p><div class=\"lf-callout\">Расстояние между соседними штрихами соответствует 2 метрам. На каком расстоянии от дома сидит кошка? Посчитайте штрихи — ответ проверите в следующем разделе.</div>",
      },
      visual(root) { introScene(root); },
    },

    // ── 2. Сұрақтар (жауаптары жасырын) ─────────────────────────────────────
    {
      title: { kz: "Сурет бойынша сұрақтар", ru: "Вопросы по рисунку" },
      html: {
        kz: "<p><b>1)</b> Солдан оңға қарай бағытталған сәуле нені көрсетеді?</p><p><b>2)</b> Штрихтар арасындағы қашықтық қандай ұзындыққа сәйкес?</p><p><b>3)</b> Мысық үйден (\\(O\\) нүктесінен) неше метр қашықтықта отырды?</p><p><b>4)</b> Санақ басы қай нүктеге сәйкес?</p><p><b>5)</b> Ит пен мысық арасындағы қашықтық неше метр?</p><p><b>6)</b> Қанша уақытта ит мысықты қуып жетеді?</p>",
        ru: "<p><b>1)</b> Что показывает луч, направленный слева направо?</p><p><b>2)</b> Какой длине соответствует расстояние между штрихами?</p><p><b>3)</b> На каком расстоянии от дома (точки \\(O\\)) сидела кошка?</p><p><b>4)</b> Какой точке соответствует начало отсчёта?</p><p><b>5)</b> Каково расстояние между собакой и кошкой?</p><p><b>6)</b> Через какое время собака догонит кошку?</p>",
      },
      visual(root) { return introScene(root); },
      explanationLabel: { kz: "Жауаптарын көрсету", ru: "Показать ответы" },
      explanation: {
        kz: "<p><b>1)</b> Қозғалыс бағытын.</p><p><b>2)</b> 2 метрге.</p><p><b>3)</b> <b>16 метр</b> (8 штрих × 2 м).</p><p><b>4)</b> \\(O\\) нүктесіне — үйге.</p><p><b>5)</b> \\(16 - 4 = 12\\) м.</p><p><b>6)</b> \\((16-4):(10-7) = 4\\) с — мұны келесі бөлімде толық талдаймыз.</p>",
        ru: "<p><b>1)</b> Направление движения.</p><p><b>2)</b> 2 метрам.</p><p><b>3)</b> <b>16 метров</b> (8 штрихов × 2 м).</p><p><b>4)</b> Точке \\(O\\) — дому.</p><p><b>5)</b> \\(16 - 4 = 12\\) м.</p><p><b>6)</b> \\((16-4):(10-7) = 4\\) с — разберём в следующем разделе.</p>",
      },
      wireExplanation(root, ctx) {
        if (ctx.visual && typeof ctx.visual.showAnswers === "function") ctx.visual.showAnswers();
      },
    },

    // ── 3. Қуып жету — анимациялы модель ────────────────────────────────────
    {
      title: { kz: "Ит мысықты қалай қуып жетеді?", ru: "Как собака догоняет кошку?" },
      html: {
        kz: "<p>Ит пен мысықтың ара қашықтығы: \\(16 - 4 = 12\\) м. Ит әр секунд сайын мысыққа \\(10 - 7 = 3\\) м жақындайды.</p><p>«▶» батырмасын басып, қуалауды бақылаңыз: ара қашықтық қалай кемитінін көресіз.</p>",
        ru: "<p>Расстояние между собакой и кошкой: \\(16 - 4 = 12\\) м. Каждую секунду собака приближается к кошке на \\(10 - 7 = 3\\) м.</p><p>Нажмите «▶» и понаблюдайте за погоней: видно, как сокращается расстояние.</p>",
      },
      visual(root, ctx) {
        var ru = ctx.lang === "ru";
        var svg = vEl("svg", { viewBox: "0 0 800 270", style: "width:100%;height:auto;display:block" }, root);

        vTxt(svg, 60, 30, ru ? "Собака: 10 м/с · Кошка: 7 м/с" : "Ит: 10 м/с · Мысық: 7 м/с",
          { size: 15, fill: V_GRAY, anchor: "start" });

        var X = vRay(svg, { x0: 60, y: 180, unit: 11.2, maxV: 60, step: 2, big: 10, labels: [0, 10, 20, 30, 40, 50, 60] });

        vTxt(svg, X(0), 148, "🏠", { size: 30 });
        vEl("circle", { cx: X(4), cy: 180, r: 5, fill: V_BLUE }, svg);
        vTxt(svg, X(4), 162, "4", { size: 13, weight: 700, fill: V_BLUE });
        vEl("circle", { cx: X(16), cy: 180, r: 5, fill: V_PURPLE }, svg);
        vTxt(svg, X(16), 162, "16", { size: 13, weight: 700, fill: V_PURPLE });

        // Meet point — hidden until the chase finishes; the label sits above
        // the actors' lane so the emojis can't cover it.
        var meet = vEl("g", {}, svg);
        vEl("circle", { cx: X(44), cy: 180, r: 6, fill: V_GREEN }, meet);
        vTxt(meet, X(44), 104, "44 м · 4 с", { size: 15, weight: 700, fill: V_GREEN });
        meet.style.display = "none";

        // Moving actors (translate along the ray while playing). The cat is
        // drawn a step ahead so at the meet they stand side by side —
        // "caught" instead of two stacked emojis.
        var dog = vEl("g", {}, svg);
        vTxt(dog, X(4), 146, "🐕", { size: 32 });
        var cat = vEl("g", {}, svg);
        vTxt(cat, X(16) + 18, 146, "🐈", { size: 32 });

        // Shrinking-gap indicator under the ray.
        var gapLine = vEl("line", { x1: X(4), y1: 236, x2: X(16), y2: 236, stroke: V_ORANGE, "stroke-width": 4, "stroke-linecap": "round" }, svg);
        var gapCap = vTxt(svg, (X(4) + X(16)) / 2, 260, "12 м", { size: 14, weight: 700, fill: V_ORANGE });

        var bar = document.createElement("div");
        bar.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:10px;";
        var btn = document.createElement("button");
        btn.textContent = ru ? "▶ Запустить погоню" : "▶ Қуалауды бастау";
        btn.style.cssText = "background:#2563eb;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;";
        var tBadge = document.createElement("span");
        var gBadge = document.createElement("span");
        [tBadge, gBadge].forEach(function (b) {
          b.style.cssText = "background:#f1f3f7;color:#1a1a2e;border-radius:999px;padding:7px 16px;font-size:13.5px;font-weight:600;";
        });
        bar.appendChild(btn); bar.appendChild(tBadge); bar.appendChild(gBadge);
        root.appendChild(bar);

        var raf = 0;
        function setState(p) { // p ∈ [0,1] → 4 seconds of chase
          var t = 4 * p;
          var dogX = 4 + 10 * t, catX = 16 + 7 * t, gap = 12 - 3 * t;
          dog.setAttribute("transform", "translate(" + ((dogX - 4) * 11.2) + ",0)");
          cat.setAttribute("transform", "translate(" + ((catX - 16) * 11.2) + ",0)");
          gapLine.setAttribute("x1", X(dogX));
          gapLine.setAttribute("x2", X(catX));
          gapCap.setAttribute("x", (X(dogX) + X(catX)) / 2);
          gapCap.textContent = (Math.round(gap * 10) / 10) + " м";
          var done = p >= 1;
          gapLine.style.display = done ? "none" : "";
          gapCap.style.display = done ? "none" : "";
          meet.style.display = done ? "" : "none";
          tBadge.textContent = "t = " + (Math.round(t * 10) / 10) + " с";
          gBadge.textContent = (ru ? "расстояние: " : "ара қашықтық: ") + (Math.round(gap * 10) / 10) + " м";
        }
        function play() { // real time: 1 s of animation = 1 second of chase
          cancelAnimationFrame(raf);
          var t0 = 0;
          btn.textContent = ru ? "⟲ Ещё раз" : "⟲ Қайталау";
          function frame(now) {
            if (!t0) t0 = now;
            var p = Math.min(1, (now - t0) / 4000);
            setState(p);
            if (p < 1) raf = requestAnimationFrame(frame);
          }
          setState(0);
          raf = requestAnimationFrame(frame);
        }
        btn.onclick = play;
        setState(0);

        return { play: play, destroy: function () { cancelAnimationFrame(raf); } };
      },
      explanation: {
        kz: "<div class=\"lf-formula\">\\[ t = S : (v_1 - v_2) \\]<div class=\"lf-formula-label\">Қуып жету уақыты</div></div><div class=\"lf-answer\">\\( (16-4) : (10-7) = 12 : 3 = 4 \\) с — ит мысықты 4 секундта қуып жетеді.</div><div class=\"lf-callout\">Ара қашықтық секунд сайын 3 м-ге кемиді: 12 → 9 → 6 → 3 → 0. Ит мысықты 44 м белгісінде қуып жетеді: \\(4 + 10 \\cdot 4 = 16 + 7 \\cdot 4 = 44\\).</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Қуалауды тағы көру</button></p>",
        ru: "<div class=\"lf-formula\">\\[ t = S : (v_1 - v_2) \\]<div class=\"lf-formula-label\">Время погони</div></div><div class=\"lf-answer\">\\( (16-4) : (10-7) = 12 : 3 = 4 \\) с — собака догонит кошку через 4 секунды.</div><div class=\"lf-callout\">Расстояние сокращается на 3 м каждую секунду: 12 → 9 → 6 → 3 → 0. Собака догонит кошку на отметке 44 м: \\(4 + 10 \\cdot 4 = 16 + 7 \\cdot 4 = 44\\).</div><p style=\"text-align:center;margin-top:14px\"><button class=\"lf-replay\" style=\"background:#eef1f5;border:1.5px solid #d8dde5;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13.5px;font-weight:600;cursor:pointer\">▶ Посмотреть погоню ещё раз</button></p>",
      },
      wireExplanation(root, ctx) {
        var visual = ctx.visual;
        Array.prototype.forEach.call(root.querySelectorAll(".lf-replay"), function (b) {
          b.onclick = function () {
            if (visual && typeof visual.play === "function") visual.play();
          };
        });
      },
    },

    // ── 4. Координаталық сәулені салу ───────────────────────────────────────
    {
      title: { kz: "Координаталық сәулені салу", ru: "Построение координатного луча" },
      html: {
        kz: "<p><b>1.</b> Бағыты белгіленген сәуле сызамыз.</p><p><b>2.</b> Сәуленің басталу нүктесін \\(O\\) деп белгілейміз. Ол — <b>санақ басы</b>. Оның тұсына \\(0\\)-ді жазамыз.</p><p><b>3.</b> Санақ басынан бастап <b>бірлік кесінді</b> \\(OA\\)-ны саламыз. \\(A\\) нүктесінің тұсына \\(1\\) санын жазамыз.</p><p><b>4.</b> Бірлік кесіндіні жалғастыра салып, \\(2, 3, 4, 5, \\ldots\\) сандарын кескіндейміз. Координаталық сәуле дайын!</p>",
        ru: "<p><b>1.</b> Проводим луч и указываем его направление.</p><p><b>2.</b> Начало луча обозначаем точкой \\(O\\) — это <b>начало отсчёта</b>. Под ней пишем \\(0\\).</p><p><b>3.</b> От начала отсчёта откладываем <b>единичный отрезок</b> \\(OA\\). Под точкой \\(A\\) пишем число \\(1\\).</p><p><b>4.</b> Продолжая откладывать единичный отрезок, изображаем числа \\(2, 3, 4, 5, \\ldots\\) Координатный луч готов!</p>",
      },
      visual(root, ctx) {
        unitRay(root, {
          unit: 80, maxV: 8, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8],
          unitSeg: true,
          unitCap: ctx.lang === "ru" ? "единичный отрезок" : "бірлік кесінді",
          points: [
            { v: 1, cap: "A", color: V_ORANGE },
            { v: 2, cap: "B", color: V_BLUE },
            { v: 3, cap: "C", color: V_BLUE },
          ],
        });
      },
    },

    // ── 5. Анықтама ─────────────────────────────────────────────────────────
    {
      title: { kz: "Анықтама", ru: "Определение" },
      html: {
        kz: "<div class=\"lf-given\">Сәуленің \\(O\\) басталу нүктесі <b>санақ басы</b> ретінде алынған, <b>бірлік кесіндісі</b> берілген, <b>бағыты</b> белгіленген сәуле <b>координаталық сәуле</b> деп аталады.</div><p><b>① Санақ басы</b> — сәуленің басталу нүктесі \\(O\\). Оның тұсына \\(0\\) жазылады.</p><p><b>② Бірлік кесінді</b> — ұзындығы «бірлік» ретінде алынған \\(OA\\) кесіндісі.</p><p><b>③ Бағыты</b> — көбінесе горизонталь сызылып, оңға қарай бағытталады.</p><div class=\"lf-callout\">Координаталық сәулені «сан сәулесі» деп те атайды. Ол шектеусіз — оны шексіз жалғастыруға болады.</div>",
        ru: "<div class=\"lf-given\">Луч, у которого начало \\(O\\) принято за <b>начало отсчёта</b>, задан <b>единичный отрезок</b> и указано <b>направление</b>, называется <b>координатным лучом</b>.</div><p><b>① Начало отсчёта</b> — начальная точка луча \\(O\\). Под ней пишут \\(0\\).</p><p><b>② Единичный отрезок</b> — отрезок \\(OA\\), длина которого принята за «единицу».</p><p><b>③ Направление</b> — обычно проводят горизонтально и направляют вправо.</p><div class=\"lf-callout\">Координатный луч называют также «числовым лучом». Он бесконечен — его можно продолжать без конца.</div>",
      },
      visual(root, ctx) {
        unitRay(root, {
          unit: 90, maxV: 7, labels: [0, 1, 2, 3, 4, 5, 6, 7],
          unitSeg: true,
          unitCap: ctx.lang === "ru" ? "единичный отрезок" : "бірлік кесінді",
          points: [{ v: 1, cap: "A", color: V_ORANGE }],
        });
      },
    },

    // ── 6. Нүктенің координатасы ────────────────────────────────────────────
    {
      title: { kz: "Нүктенің координатасы", ru: "Координата точки" },
      html: {
        kz: "<div class=\"lf-given\">Координаталық сәуледегі берілген нүктеге сәйкес сан осы нүктенің <b>координатасы</b> деп аталады.</div><p><b>Жазылуы:</b> \\(O(0),\\; A(1),\\; B(2),\\; C(3),\\; \\ldots\\) — сан нүкте атауының жанында жақшаның ішінде жазылады.</p><p><b>Оқылуы:</b> «\\(B\\) нүктесінің координатасы 2-ге тең».</p><p>Мысалы, суреттегі \\(M\\) нүктесінің координатасы — \\(5\\), сондықтан \\(M(5)\\) деп жазамыз.</p>",
        ru: "<div class=\"lf-given\">Число, соответствующее данной точке на координатном луче, называется <b>координатой</b> этой точки.</div><p><b>Запись:</b> \\(O(0),\\; A(1),\\; B(2),\\; C(3),\\; \\ldots\\) — число пишут в скобках рядом с именем точки.</p><p><b>Читается:</b> «координата точки \\(B\\) равна 2».</p><p>Например, координата точки \\(M\\) на рисунке равна \\(5\\), поэтому пишем \\(M(5)\\).</p>",
      },
      visual(root) {
        unitRay(root, {
          unit: 52, maxV: 12, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          points: [
            { v: 1, cap: "A(1)", color: V_BLUE },
            { v: 2, cap: "B(2)", color: V_BLUE },
            { v: 3, cap: "C(3)", color: V_BLUE },
            { v: 5, cap: "M(5)", color: V_ORANGE, big: true },
          ],
        });
      },
    },

    // ── 7. Бекіту сұрақтары (жауаптары жасырын) ─────────────────────────────
    {
      title: { kz: "Бекіту сұрақтары", ru: "Вопросы для закрепления" },
      html: {
        kz: "<p><b>1.</b> Координаталық сәуле қалай сызылады?</p><p><b>2.</b> Координаталық сәуленің санақ басы ретінде қай нүкте алынады?</p><p><b>3.</b> Бірлік кесінді деген не?</p><p><b>4.</b> Нүктенің координатасы дегеніміз не? Қалай жазылады?</p>",
        ru: "<p><b>1.</b> Как проводится координатный луч?</p><p><b>2.</b> Какая точка принимается за начало отсчёта?</p><p><b>3.</b> Что такое единичный отрезок?</p><p><b>4.</b> Что такое координата точки? Как её записывают?</p>",
      },
      explanationLabel: { kz: "Жауаптарын көрсету", ru: "Показать ответы" },
      explanation: {
        kz: "<p><b>1.</b> Көбінесе горизонталь сызылып, оңға қарай бағытталады: санақ басы \\(O\\), бірлік кесінді және бағыты болады.</p><p><b>2.</b> Сәуленің басталу нүктесі — \\(O\\) нүктесі.</p><p><b>3.</b> Ұзындығы «бірлік» ретінде алынған кесінді (\\(OA\\)).</p><p><b>4.</b> Нүктеге сәйкес сан. Мысалы: \\(A(1),\\; B(2),\\; C(3)\\).</p>",
        ru: "<p><b>1.</b> Обычно горизонтально и вправо: есть начало отсчёта \\(O\\), единичный отрезок и направление.</p><p><b>2.</b> Начальная точка луча — точка \\(O\\).</p><p><b>3.</b> Отрезок, длина которого принята за «единицу» (\\(OA\\)).</p><p><b>4.</b> Число, соответствующее точке. Например: \\(A(1),\\; B(2),\\; C(3)\\).</p>",
      },
    },

    // ── 8. Түйін ────────────────────────────────────────────────────────────
    {
      title: { kz: "Тақырыптың түйіні", ru: "Итоги темы" },
      html: {
        kz: "<p><b>1.</b> Сәуленің басталу нүктесі — \\(O\\) нүктесі <b>санақ басы</b> деп аталады.</p><p><b>2.</b> Координаталық сәуленің белгіленген <b>бағыты</b>, <b>санақ басы</b> және таңдап алынған <b>бірлік кесіндісі</b> болады.</p><p><b>3.</b> Кез келген натурал сан координаталық сәуле бойындағы <b>бір ғана нүктемен</b> кескінделеді.</p><p><b>4.</b> \\(0\\) саны санақ басы болатын \\(O\\) нүктесімен кескінделеді.</p>",
        ru: "<p><b>1.</b> Начальная точка луча — точка \\(O\\) — называется <b>началом отсчёта</b>.</p><p><b>2.</b> У координатного луча есть указанное <b>направление</b>, <b>начало отсчёта</b> и выбранный <b>единичный отрезок</b>.</p><p><b>3.</b> Любое натуральное число изображается <b>только одной точкой</b> координатного луча.</p><p><b>4.</b> Число \\(0\\) изображается точкой \\(O\\) — началом отсчёта.</p>",
      },
    },
  ],
});
})();
