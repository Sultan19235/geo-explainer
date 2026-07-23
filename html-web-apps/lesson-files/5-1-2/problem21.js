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

// №21: C — the midpoint of AB. Case 1: A(4), B(8); case 2: A(3), B(11).
// Two rays are built stacked; each case gets its own frame.

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
  id: "coord-ray-midpoint",
  number: "21",
  title: { kz: "Кесіндінің қақ ортасы", ru: "Середина отрезка" },
  difficulty: "med",
  tags: [{ kz: "кесіндінің ортасы", ru: "середина отрезка" }],

  statement: {
    kz: "<p>Бірлік кесіндісі дәптердің 2 торкөзінің ұзындығына тең координаталық сәуле сызыңдар. Сәуле бойынан: 1) \\(A(4)\\) және \\(B(8)\\); 2) \\(A(3)\\) және \\(B(11)\\) нүктелерін белгілеп, <b class=\"lf-find\">\\(AB\\) кесіндісінің қақ ортасындағы \\(C\\) нүктесін координатасымен жазыңдар</b>.</p>",
    ru: "<p>Начертите координатный луч, у которого единичный отрезок равен длине 2 клеток тетради. Отметьте точки: 1) \\(A(4)\\) и \\(B(8)\\); 2) \\(A(3)\\) и \\(B(11)\\), и <b class=\"lf-find\">запишите точку \\(C\\) — середину отрезка \\(AB\\) — с её координатой</b>.</p>",
  },

  init(g) {
    crFrame(g, -1.8, 14.6, -8.2, 8.2);
    // Case 1 ray at y = 0.
    var r1 = crRay(g, "a", 13, 0, { tick: 0.2, labelOff: 0.85, lx: 0.12, over: 1.2, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] });
    r1.push(crLabel(g, "alo", "O", -0.16, 1.05));
    g.hide(r1);
    g.hide(
      crPoint(g, "aA", 4, 0, "A(4)", g.BLUE),
      crPoint(g, "aB", 8, 0, "B(8)", g.BLUE),
      crPoint(g, "aC", 6, 0, "C = ?", g.RED, 6),
      crSpan(g, "aAC", 4, 6, -2, "2", g.GREEN),
      crSpan(g, "aCB", 6, 8, -2, "2", g.GREEN),
    );
    // Case 2 ray far below at y = -24 (framed separately in its step).
    var r2 = crRay(g, "b", 13, -24, { tick: 0.2, labelOff: 0.85, lx: 0.12, over: 1.2, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] });
    r2.push(crLabel(g, "blo", "O", -0.16, -22.95));
    g.hide(r2);
    g.hide(
      crPoint(g, "bA", 3, -24, "A(3)", g.BLUE),
      crPoint(g, "bB", 11, -24, "B(11)", g.BLUE),
      crPoint(g, "bC", 7, -24, "C = ?", g.RED, 6),
      crSpan(g, "bAC", 3, 7, -26, "4", g.GREEN),
      crSpan(g, "bCB", 7, 11, -26, "4", g.GREEN),
    );
  },

  steps: [
    {
      title: { kz: "Шарты", ru: "Условие" },
      html: {
        kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> 1) \\(A(4),\\; B(8)\\); &nbsp; 2) \\(A(3),\\; B(11)\\).</p><p><b>Табу керек:</b> <b class=\"lf-find\">\\(C = \\,?\\)</b> — \\(AB\\)-ның қақ ортасы (әр жағдайда).</p></div>",
        ru: "<div class=\"lf-given\"><p><b>Дано:</b> 1) \\(A(4),\\; B(8)\\); &nbsp; 2) \\(A(3),\\; B(11)\\).</p><p><b>Найти:</b> <b class=\"lf-find\">\\(C = \\,?\\)</b> — середину \\(AB\\) (в каждом случае).</p></div>",
      },
    },
    {
      title: { kz: "Сурет", ru: "Чертёж" },
      html: {
        kz: "<p>Сәуле сызып, \\(A(4)\\) мен \\(B(8)\\) нүктелерін белгілейміз. Ізделінді \\(C\\) нүктесі — \\(A\\) мен \\(B\\)-ның дәл ортасында.</p>",
        ru: "<p>Чертим луч и отмечаем точки \\(A(4)\\) и \\(B(8)\\). Искомая точка \\(C\\) — ровно посередине между \\(A\\) и \\(B\\).</p>",
      },
      run(g) {
        g.show("av", "alo", "aA", "aB", "aC");
        for (var k = 0; k <= 13; k++) g.show("at" + k, "al" + k);
      },
    },
    {
      title: { kz: "Теория", ru: "Теория" },
      html: {
        kz: "<p>\\(C\\) — \\(AB\\)-ның қақ ортасы болса, \\(AC = CB\\). Ортаның координатасы — шеткі координаталардың қосындысының жартысы:</p><div class=\"lf-formula\">\\[ c = (a + b) : 2 \\]<div class=\"lf-formula-label\">Кесінді ортасының координатасы</div></div>",
        ru: "<p>Если \\(C\\) — середина \\(AB\\), то \\(AC = CB\\). Координата середины — половина суммы крайних координат:</p><div class=\"lf-formula\">\\[ c = (a + b) : 2 \\]<div class=\"lf-formula-label\">Координата середины отрезка</div></div>",
      },
    },
    {
      title: { kz: "1-қадам · Бірінші жағдай", ru: "Шаг 1 · Первый случай" },
      html: {
        kz: "<p>Формуланы қолданамыз:</p>\\[ c = (a + b) : 2 \\]\\[ c = (4 + 8) : 2 = 12 : 2 = 6 \\]<p>Тексеру: \\(AC = 6 - 4 = 2\\), \\(CB = 8 - 6 = 2\\) — тең. ✓</p><div class=\"lf-answer\">1) \\(C(6)\\)</div>",
        ru: "<p>Применяем формулу:</p>\\[ c = (a + b) : 2 \\]\\[ c = (4 + 8) : 2 = 12 : 2 = 6 \\]<p>Проверка: \\(AC = 6 - 4 = 2\\), \\(CB = 8 - 6 = 2\\) — равны. ✓</p><div class=\"lf-answer\">1) \\(C(6)\\)</div>",
      },
      run(g) {
        g.cap("aC", "C(6)");
        g.show("aAC", "aCB");
      },
    },
    {
      title: { kz: "2-қадам · Екінші жағдай", ru: "Шаг 2 · Второй случай" },
      html: {
        kz: "<p>Енді \\(A(3)\\) және \\(B(11)\\):</p>\\[ c = (3 + 11) : 2 = 14 : 2 = 7 \\]<p>Тексеру: \\(AC = 7 - 3 = 4\\), \\(CB = 11 - 7 = 4\\) — тең. ✓</p><div class=\"lf-answer\">2) \\(C(7)\\)</div>",
        ru: "<p>Теперь \\(A(3)\\) и \\(B(11)\\):</p>\\[ c = (3 + 11) : 2 = 14 : 2 = 7 \\]<p>Проверка: \\(AC = 7 - 3 = 4\\), \\(CB = 11 - 7 = 4\\) — равны. ✓</p><div class=\"lf-answer\">2) \\(C(7)\\)</div>",
      },
      run(g) {
        crFrame(g, -1.8, 14.6, -32.2, -15.8);
        g.show("bv", "blo", "bA", "bB", "bC", "bAC", "bCB");
        for (var k = 0; k <= 13; k++) g.show("bt" + k, "bl" + k);
        g.cap("bC", "C(7)");
      },
    },
    {
      title: { kz: "Жауабы", ru: "Ответ" },
      html: {
        kz: "<div class=\"lf-answer\">1) \\(C(6)\\); &nbsp; 2) \\(C(7)\\).</div><div class=\"lf-callout\">Қақ орта — шеткі екі санның «дәл ортасындағы» сан: одан \\(A\\)-ға дейін де, \\(B\\)-ға дейін де бірдей қашықтық.</div>",
        ru: "<div class=\"lf-answer\">1) \\(C(6)\\); &nbsp; 2) \\(C(7)\\).</div><div class=\"lf-callout\">Середина — число «ровно посередине» между крайними: от него одинаковое расстояние и до \\(A\\), и до \\(B\\).</div>",
      },
    },
  ],
});
})();
