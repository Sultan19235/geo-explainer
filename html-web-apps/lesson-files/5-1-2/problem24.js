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

// №24: boy at 3 and dog at 11 run towards each other; unit = 30 m,
// speeds 3 m/s and 5 m/s. Find the coordinates, distance and meeting time.

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
  id: "coord-ray-boy-and-dog",
  number: "24",
  title: { kz: "Бала мен ит", ru: "Мальчик и собака" },
  difficulty: "med",
  tags: [{ kz: "қарсы қозғалыс", ru: "встречное движение" }],

  statement: {
    kz: "<p>Суреттегі баланың және оның итінің тұрған орындарына сәйкес нүктелердің <b class=\"lf-find\">координаталарын табыңдар</b>. Бала \\(3\\) м/с, ит \\(5\\) м/с жылдамдықпен бір-біріне қарсы жүгіреді. 1) Егер бірлік кесінді \\(30\\) м-ге тең болса, <b class=\"lf-find\">олар неше метр қашықтықтан жүгіріп келеді?</b> 2) <b class=\"lf-find\">Бала мен ит неше секундтан соң кездеседі?</b></p>",
    ru: "<p><b class=\"lf-find\">Найдите координаты</b> точек, где стоят мальчик и его собака. Мальчик бежит со скоростью \\(3\\) м/с, собака — \\(5\\) м/с, навстречу друг другу. 1) Если единичный отрезок равен \\(30\\) м, <b class=\"lf-find\">с какого расстояния они бегут навстречу друг другу?</b> 2) <b class=\"lf-find\">Через сколько секунд мальчик и собака встретятся?</b></p>",
  },

  init(g) {
    crFrame(g, -1.8, 17, -8.4, 10.4);
    var r = crRay(g, "r", 14, 0, { tick: 0.2, labelOff: 0.9, lx: 0.12, over: 1.3, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] });
    r.push(crLabel(g, "lo", "O", -0.16, 1.1));
    g.hide(r);
    g.hide(
      crLabel(g, "eB", "🏃", 2.6, 3),
      crLabel(g, "eD", "🐕", 10.6, 3),
      crPoint(g, "pB", 3, 0, "?", g.RED, 6),
      crPoint(g, "pD", 11, 0, "?", g.RED, 6),
      crSpan(g, "sg", 3, 11, -2.4, "? м", g.PURPLE),
    );
    [4, 8, 12].forEach(function (v) {
      g.hide(crLabel(g, "m" + v, String(v * 30) + " м", v - 0.55, -3.8, g.GRAY));
    });
  },

  steps: [
    {
      title: { kz: "Шарты", ru: "Условие" },
      html: {
        kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> бірлік кесінді \\(= 30\\) м; жылдамдықтар: бала — \\(3\\) м/с, ит — \\(5\\) м/с; қарсы қозғалыс.</p><p><b>Табу керек:</b> <b class=\"lf-find\">координаталар; қашықтық \\(S\\); кездесу уақыты \\(t\\)</b>.</p></div>",
        ru: "<div class=\"lf-given\"><p><b>Дано:</b> единичный отрезок \\(= 30\\) м; скорости: мальчик — \\(3\\) м/с, собака — \\(5\\) м/с; движение навстречу.</p><p><b>Найти:</b> <b class=\"lf-find\">координаты; расстояние \\(S\\); время встречи \\(t\\)</b>.</p></div>",
      },
    },
    {
      title: { kz: "Сурет", ru: "Чертёж" },
      html: {
        kz: "<p>Бала мен ит сәуленің бойында тұр. Алдымен олардың координаталарын штрихтарды санап анықтаймыз.</p>",
        ru: "<p>Мальчик и собака стоят на луче. Сначала определим их координаты, считая штрихи.</p>",
      },
      run(g) {
        g.show("rv", "lo", "eB", "eD", "pB", "pD");
        for (var k = 0; k <= 14; k++) g.show("rt" + k, "rl" + k);
      },
    },
    {
      title: { kz: "Теория", ru: "Теория" },
      html: {
        kz: "<div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Қашықтық = бірлік саны × бірлік кесінді</div></div><div class=\"lf-formula\">\\[ t = S : (v_1 + v_2) \\]<div class=\"lf-formula-label\">Қарсы қозғалыстағы кездесу уақыты</div></div><p>Қарсы қозғалыста жақындасу жылдамдығы — екі жылдамдықтың <b>қосындысы</b>.</p>",
        ru: "<div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Расстояние = число единиц × единичный отрезок</div></div><div class=\"lf-formula\">\\[ t = S : (v_1 + v_2) \\]<div class=\"lf-formula-label\">Время встречи при встречном движении</div></div><p>При встречном движении скорость сближения — <b>сумма</b> двух скоростей.</p>",
      },
    },
    {
      title: { kz: "1-қадам · Координаталар", ru: "Шаг 1 · Координаты" },
      html: {
        kz: "<p>Штрихтарды санаймыз: бала — 3-те, ит — 11-де.</p><div class=\"lf-answer\">Бала — \\(3\\), ит — \\(11\\).</div>",
        ru: "<p>Считаем штрихи: мальчик — на 3, собака — на 11.</p><div class=\"lf-answer\">Мальчик — \\(3\\), собака — \\(11\\).</div>",
      },
      run(g) {
        g.cap("pB", "3");
        g.cap("pD", "11");
      },
    },
    {
      title: { kz: "2-қадам · Қашықтық", ru: "Шаг 2 · Расстояние" },
      html: {
        kz: "<p>Араларында \\(11 - 3 = 8\\) бірлік кесінді бар, әрқайсысы \\(30\\) м:</p>\\[ S = n \\cdot e \\]\\[ S = (11 - 3) \\cdot 30 = 8 \\cdot 30 = 240 \\text{ м} \\]<p>\\(S = 240\\) м — келесі қадамда керек.</p>",
        ru: "<p>Между ними \\(11 - 3 = 8\\) единичных отрезков, каждый по \\(30\\) м:</p>\\[ S = n \\cdot e \\]\\[ S = (11 - 3) \\cdot 30 = 8 \\cdot 30 = 240 \\text{ м} \\]<p>\\(S = 240\\) м — понадобится на следующем шаге.</p>",
      },
      run(g) {
        g.cap("sg", "240 м");
        g.show("sg");
        [4, 8, 12].forEach(function (v) { g.show("m" + v); });
      },
    },
    {
      title: { kz: "3-қадам · Кездесу уақыты", ru: "Шаг 3 · Время встречи" },
      html: {
        kz: "<p>Жақындасу жылдамдығы: \\(3 + 5 = 8\\) м/с.</p>\\[ t = S : (v_1 + v_2) \\]\\[ t = 240 : (3 + 5) = 240 : 8 = 30 \\text{ с} \\]",
        ru: "<p>Скорость сближения: \\(3 + 5 = 8\\) м/с.</p>\\[ t = S : (v_1 + v_2) \\]\\[ t = 240 : (3 + 5) = 240 : 8 = 30 \\text{ с} \\]",
      },
    },
    {
      title: { kz: "Жауабы", ru: "Ответ" },
      html: {
        kz: "<div class=\"lf-answer\">Координаталар: \\(3\\) және \\(11\\); &nbsp; 1) \\(240\\) м; &nbsp; 2) \\(30\\) секундтан соң кездеседі.</div><div class=\"lf-callout\">Тексеру: 30 секундта бала \\(3 \\cdot 30 = 90\\) м, ит \\(5 \\cdot 30 = 150\\) м жүгіреді; \\(90 + 150 = 240\\) м. ✓</div>",
        ru: "<div class=\"lf-answer\">Координаты: \\(3\\) и \\(11\\); &nbsp; 1) \\(240\\) м; &nbsp; 2) встретятся через \\(30\\) секунд.</div><div class=\"lf-callout\">Проверка: за 30 секунд мальчик пробежит \\(3 \\cdot 30 = 90\\) м, собака \\(5 \\cdot 30 = 150\\) м; \\(90 + 150 = 240\\) м. ✓</div>",
      },
    },
  ],
});
})();
