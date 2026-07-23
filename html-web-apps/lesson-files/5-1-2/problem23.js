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

// №23: Aldar-Köse walks to Shygaibai's house at A on the ray; unit = 40 m,
// speed 80 m/min. Find A's coordinate and the walking time.

// 2D content renders in the 3D view top-down (SetPerspective("G") kills the
// view in the current web3d build) — so framing uses the 6-arg 3D form.
function crFrame(g, x0, x1, y0, y1) {
  // Deterministic top-down camera: jump far off-axis first — a single
  // near-parallel SetViewDirection keeps the previous azimuth and can leave
  // the view mirrored/rotated depending on prior state.
  g.cmd("SetViewDirection((0,-1,0),false)");
  g.cmd("SetViewDirection((0,-0.001,1),false)");
  if (g.api && g.api.setCoordSystem) g.api.setCoordSystem(x0, x1, y0, y1, -5, 5);
}
function crRay(g, id, maxV, yo, o) {
  o = o || {};
  var st = o.step || 1, tick = o.tick || 0.18, big = o.big || 0;
  var lo = o.labelOff || 0.7, lx = o.lx || 0.1, over = o.over || 1;
  var names = [id + "v"];
  g.cmd(id + "v=Vector((0," + yo + "),(" + (maxV + over) + "," + yo + "))");
  g.col(id + "v", g.DARK); g.thick(id + "v", 3); g.labelOff(id + "v"); g.lock(id + "v");
  for (var k = 0; k <= maxV; k += st) {
    var h = big && k % big === 0 ? tick * 1.7 : tick;
    var tn = id + "t" + k;
    g.cmd(tn + "=Segment((" + k + "," + (yo - h) + "),(" + k + "," + (yo + h) + "))");
    g.col(tn, g.DARK); g.thick(tn, 2); g.labelOff(tn); g.lock(tn);
    names.push(tn);
  }
  (o.labels || []).forEach(function (v) {
    names.push(crLabel(g, id + "l" + v, String(v), v - lx * String(v).length, yo - lo));
  });
  return names;
}
function crLabel(g, n, txt, x, y, color) {
  g.cmd(n + '=Text("' + txt + '",(' + x + "," + y + "))");
  g.col(n, color || g.DARK); g.lock(n);
  return n;
}
// Point({…}) forces point semantics — a lowercase name with bare tuple
// syntax (n=(x,y)) would silently create a VECTOR instead.
function crPoint(g, n, x, yo, capTxt, color, size) {
  g.cmd(n + "=Point({" + x + "," + yo + ",0})");
  g.pointSize(n, size || 5);
  g.col(n, color || g.BLUE);
  g.cap(n, capTxt || n);
  if (capTxt === null) g.labelOff(n);
  g.lock(n);
  return n;
}
function crSpan(g, n, a, b, y, capTxt, color) {
  g.cmd(n + "=Segment((" + a + "," + y + "),(" + b + "," + y + "))");
  g.col(n, color || g.PURPLE); g.thick(n, 4); g.cap(n, capTxt); g.lock(n);
  return n;
}

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

  init(g) {
    crFrame(g, -1.6, 12.8, -7.4, 7);
    var r = crRay(g, "r", 10, 0, { tick: 0.18, labelOff: 0.8, lx: 0.11, over: 1.2, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    r.push(crLabel(g, "lo", "O", -0.15, 1));
    g.hide(r);
    g.hide(
      crLabel(g, "eA", "🐎", -0.5, 2.6),
      crLabel(g, "eH", "⛺", 7.6, 2.6),
      crPoint(g, "pA", 8, 0, "A = ?", g.RED, 6),
      crSpan(g, "sd", 0, 8, -2.2, "? м", g.PURPLE),
    );
    // Meter sub-labels (gray, under the number labels).
    [2, 4, 6, 8, 10].forEach(function (v) {
      g.hide(crLabel(g, "m" + v, String(v * 40) + " м", v - 0.5, -3.4, g.GRAY));
    });
  },

  steps: [
    {
      title: { kz: "Шарты", ru: "Условие" },
      html: {
        kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> жылдамдық \\(v = 80\\) м/мин; бірлік кесінді \\(= 40\\) м; үй — \\(A\\) нүктесінде.</p><p><b>Табу керек:</b> <b class=\"lf-find\">1) \\(A\\)-ның координатасы; 2) жол уақыты \\(t = \\,?\\)</b></p></div>",
        ru: "<div class=\"lf-given\"><p><b>Дано:</b> скорость \\(v = 80\\) м/мин; единичный отрезок \\(= 40\\) м; дом — в точке \\(A\\).</p><p><b>Найти:</b> <b class=\"lf-find\">1) координату \\(A\\); 2) время пути \\(t = \\,?\\)</b></p></div>",
      },
    },
    {
      title: { kz: "Сурет", ru: "Чертёж" },
      html: {
        kz: "<p>Алдаркөсе санақ басында (\\(O\\)) тұр, Шығайбайдың үйі — \\(A\\) нүктесінде. Штрихтарды санап, \\(A\\)-ның координатасын анықтаймыз.</p>",
        ru: "<p>Алдар-Косе стоит в начале отсчёта (\\(O\\)), дом Шыгайбая — в точке \\(A\\). Считая штрихи, определим координату \\(A\\).</p>",
      },
      run(g) {
        g.show("rv", "lo", "eA", "eH", "pA");
        for (var k = 0; k <= 10; k++) g.show("rt" + k, "rl" + k);
      },
    },
    {
      title: { kz: "Теория", ru: "Теория" },
      html: {
        kz: "<div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Қашықтық = бірлік саны × бірлік кесіндінің ұзындығы</div></div><div class=\"lf-formula\">\\[ t = S : v \\]<div class=\"lf-formula-label\">Уақыт = қашықтық : жылдамдық</div></div>",
        ru: "<div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Расстояние = число единиц × длина единичного отрезка</div></div><div class=\"lf-formula\">\\[ t = S : v \\]<div class=\"lf-formula-label\">Время = расстояние : скорость</div></div>",
      },
    },
    {
      title: { kz: "1-қадам · A нүктесінің координатасы", ru: "Шаг 1 · Координата точки A" },
      html: {
        kz: "<p>\\(O\\)-дан \\(A\\)-ға дейін 8 бірлік кесінді бар:</p><div class=\"lf-answer\">1) \\(A(8)\\)</div>",
        ru: "<p>От \\(O\\) до \\(A\\) — 8 единичных отрезков:</p><div class=\"lf-answer\">1) \\(A(8)\\)</div>",
      },
      run(g) {
        g.cap("pA", "A(8)");
      },
    },
    {
      title: { kz: "2-қадам · Қашықтық", ru: "Шаг 2 · Расстояние" },
      html: {
        kz: "<p>Бір бірлік кесінді — \\(40\\) м, ал \\(A\\)-ға дейін 8 бірлік:</p>\\[ S = n \\cdot e \\]\\[ S = 8 \\cdot 40 = 320 \\text{ м} \\]<p>\\(S = 320\\) м — келесі қадамда керек.</p>",
        ru: "<p>Один единичный отрезок — \\(40\\) м, а до \\(A\\) — 8 единиц:</p>\\[ S = n \\cdot e \\]\\[ S = 8 \\cdot 40 = 320 \\text{ м} \\]<p>\\(S = 320\\) м — понадобится на следующем шаге.</p>",
      },
      run(g) {
        g.cap("sd", "320 м");
        g.show("sd");
        [2, 4, 6, 8, 10].forEach(function (v) { g.show("m" + v); });
      },
    },
    {
      title: { kz: "3-қадам · Уақыт", ru: "Шаг 3 · Время" },
      html: {
        kz: "<p>Жылдамдық \\(80\\) м/мин:</p>\\[ t = S : v \\]\\[ t = 320 : 80 = 4 \\text{ мин} \\]",
        ru: "<p>Скорость \\(80\\) м/мин:</p>\\[ t = S : v \\]\\[ t = 320 : 80 = 4 \\text{ мин} \\]",
      },
    },
    {
      title: { kz: "Жауабы", ru: "Ответ" },
      html: {
        kz: "<div class=\"lf-answer\">1) \\(A(8)\\); &nbsp; 2) Алдаркөсе үйге \\(4\\) минутта жетеді.</div><div class=\"lf-callout\">Тексеру: 4 минутта \\(80 \\cdot 4 = 320\\) м жүреді — дәл \\(A\\)-ға дейінгі қашықтық. ✓</div>",
        ru: "<div class=\"lf-answer\">1) \\(A(8)\\); &nbsp; 2) Алдар-Косе дойдёт до дома за \\(4\\) минуты.</div><div class=\"lf-callout\">Проверка: за 4 минуты он пройдёт \\(80 \\cdot 4 = 320\\) м — ровно расстояние до \\(A\\). ✓</div>",
      },
    },
  ],
});
})();
