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

// №19: read A, B, C, D off two coordinate rays (unit = 1 tick; ticks by 5).
// 2D file: framing via 4-arg setCoordSystem inside init/steps.

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

  init(g) {
    crFrame(g, -2, 16, -9, 9);
    // 1) ray: unit segment = one tick, only 0 and 1 labelled.
    var r1 = crRay(g, "a", 13, 0, { tick: 0.22, labelOff: 0.9, lx: 0.13, over: 1.4, labels: [0, 1] });
    r1.push(crLabel(g, "alo", "O", -0.17, 1.1));
    var p1 = [
      crPoint(g, "pA", 3, 0, "A", g.RED),
      crPoint(g, "pB", 6, 0, "B", g.RED),
      crPoint(g, "pC", 7, 0, "C", g.RED),
      crPoint(g, "pD", 10, 0, "D", g.RED),
    ];
    g.hide(r1, p1);
    // 2) ray far below (own frame): small ticks each 1, tall each 5.
    var r2 = crRay(g, "b", 50, -100, { big: 5, tick: 0.55, labelOff: 3.4, lx: 0.55, over: 4.5, labels: [0, 5] });
    r2.push(crLabel(g, "blo", "O", -0.7, -95.8));
    [10, 15, 20, 25, 30, 35, 40, 45, 50].forEach(function (v) {
      g.hide(crLabel(g, "bl" + v, String(v), v - 0.55 * String(v).length, -103.4));
    });
    var p2 = [
      crPoint(g, "qA", 5, -100, "A", g.RED),
      crPoint(g, "qB", 20, -100, "B", g.RED),
      crPoint(g, "qC", 35, -100, "C", g.RED),
      crPoint(g, "qD", 50, -100, "D", g.RED),
    ];
    g.hide(r2, p2);
  },

  steps: [
    {
      title: { kz: "Шарты", ru: "Условие" },
      html: {
        kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> координаталық сәуледе \\(A\\), \\(B\\), \\(C\\), \\(D\\) нүктелері белгіленген.</p><p><b>Табу керек:</b> <b class=\"lf-find\">әр нүктенің координатасы</b>.</p></div>",
        ru: "<div class=\"lf-given\"><p><b>Дано:</b> на координатном луче отмечены точки \\(A\\), \\(B\\), \\(C\\), \\(D\\).</p><p><b>Найти:</b> <b class=\"lf-find\">координату каждой точки</b>.</p></div>",
      },
    },
    {
      title: { kz: "1) Сурет", ru: "1) Чертёж" },
      html: {
        kz: "<p>Бірінші сәуледе бірлік кесінді — көрші штрихтардың арасы. Координатаны табу үшін санақ басынан (\\(O\\)) бастап бірлік кесінділерді санаймыз.</p>",
        ru: "<p>На первом луче единичный отрезок — расстояние между соседними штрихами. Чтобы найти координату, считаем единичные отрезки от начала отсчёта (\\(O\\)).</p>",
      },
      run(g) {
        g.show("av", "alo", "al0", "al1", "pA", "pB", "pC", "pD");
        for (var k = 0; k <= 13; k++) g.show("at" + k);
      },
    },
    {
      title: { kz: "1) Шешуі", ru: "1) Решение" },
      html: {
        kz: "<p>\\(O\\)-дан санаймыз: \\(A\\) — 3-ші штрихта, \\(B\\) — 6-шы, \\(C\\) — 7-ші, \\(D\\) — 10-шы штрихта.</p><div class=\"lf-answer\">1) \\(A(3),\\; B(6),\\; C(7),\\; D(10)\\)</div>",
        ru: "<p>Считаем от \\(O\\): \\(A\\) — на 3-м штрихе, \\(B\\) — на 6-м, \\(C\\) — на 7-м, \\(D\\) — на 10-м.</p><div class=\"lf-answer\">1) \\(A(3),\\; B(6),\\; C(7),\\; D(10)\\)</div>",
      },
      run(g) {
        g.cap("pA", "A(3)"); g.cap("pB", "B(6)"); g.cap("pC", "C(7)"); g.cap("pD", "D(10)");
      },
    },
    {
      title: { kz: "2) Сурет", ru: "2) Чертёж" },
      html: {
        kz: "<p>Екінші сәуледе тек \\(0\\) мен \\(5\\) жазылған: биік штрихтардың арасы — 5 бірлік, ал ұсақ штрихтардың арасы — 1 бірлік.</p>",
        ru: "<p>На втором луче подписаны только \\(0\\) и \\(5\\): между высокими штрихами — 5 единиц, между мелкими — 1 единица.</p>",
      },
      run(g) {
        crFrame(g, -6, 61, -133.5, -66.5);
        g.show("bv", "blo", "bl0", "bl5", "qA", "qB", "qC", "qD");
        for (var k = 0; k <= 50; k++) g.show("bt" + k);
      },
    },
    {
      title: { kz: "2) Шешуі", ru: "2) Решение" },
      html: {
        kz: "<p>Биік штрихтарды бестен санаймыз: \\(5, 10, 15, \\ldots\\) Сонда \\(A\\) — 5-те, \\(B\\) — 20-да, \\(C\\) — 35-те, \\(D\\) — 50-де тұр.</p><div class=\"lf-answer\">2) \\(A(5),\\; B(20),\\; C(35),\\; D(50)\\)</div>",
        ru: "<p>Считаем высокие штрихи по пять: \\(5, 10, 15, \\ldots\\) Тогда \\(A\\) — на 5, \\(B\\) — на 20, \\(C\\) — на 35, \\(D\\) — на 50.</p><div class=\"lf-answer\">2) \\(A(5),\\; B(20),\\; C(35),\\; D(50)\\)</div>",
      },
      run(g) {
        [10, 15, 20, 25, 30, 35, 40, 45, 50].forEach(function (v) { g.show("bl" + v); });
        g.cap("qA", "A(5)"); g.cap("qB", "B(20)"); g.cap("qC", "C(35)"); g.cap("qD", "D(50)");
      },
    },
    {
      title: { kz: "Жауабы", ru: "Ответ" },
      html: {
        kz: "<div class=\"lf-answer\">1) \\(A(3),\\; B(6),\\; C(7),\\; D(10)\\); &nbsp; 2) \\(A(5),\\; B(20),\\; C(35),\\; D(50)\\)</div><div class=\"lf-callout\">Координата — санақ басынан нүктеге дейінгі бірлік кесінділердің саны.</div>",
        ru: "<div class=\"lf-answer\">1) \\(A(3),\\; B(6),\\; C(7),\\; D(10)\\); &nbsp; 2) \\(A(5),\\; B(20),\\; C(35),\\; D(50)\\)</div><div class=\"lf-callout\">Координата — число единичных отрезков от начала отсчёта до точки.</div>",
      },
    },
  ],
});
})();
