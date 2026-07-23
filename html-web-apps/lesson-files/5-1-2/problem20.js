/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-mark-points",
  "number": "20",
  "title": { "kz": "Нүктелерді белгілеу", "ru": "Отметить точки" },
  "difficulty": "easy",
  "tags": [ { "kz": "нүктені белгілеу", "ru": "отметить точку" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №20: mark A(2), B(6), C(8), D(9) on a ray with unit = 1 cm; find OA…OD.

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
  id: "coord-ray-mark-points",
  number: "20",
  title: { kz: "Нүктелерді белгілеу", ru: "Отметить точки" },
  difficulty: "easy",
  tags: [{ kz: "нүктені белгілеу", ru: "отметить точку" }],

  statement: {
    kz: "<p>Бірлік кесінді ретінде ұзындығы \\(1\\) см кесіндіні алып, координаталық сәуле сызыңдар. Оның бойында \\(2\\), \\(6\\), \\(8\\) және \\(9\\) сандарын кескіндейтін \\(A\\), \\(B\\), \\(C\\) және \\(D\\) нүктелерін белгілеңдер. <b class=\"lf-find\">\\(OA\\), \\(OB\\), \\(OC\\) және \\(OD\\) кесінділерінің ұзындықтарын сантиметр есебімен табыңдар.</b></p>",
    ru: "<p>Приняв за единичный отрезок отрезок длиной \\(1\\) см, начертите координатный луч. Отметьте на нём точки \\(A\\), \\(B\\), \\(C\\) и \\(D\\), изображающие числа \\(2\\), \\(6\\), \\(8\\) и \\(9\\). <b class=\"lf-find\">Найдите длины отрезков \\(OA\\), \\(OB\\), \\(OC\\) и \\(OD\\) в сантиметрах.</b></p>",
  },

  init(g) {
    crFrame(g, -1.8, 14.6, -10.2, 6.2);
    var r = crRay(g, "r", 12, 0, { tick: 0.2, labelOff: 0.85, lx: 0.12, over: 1.3, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
    r.push(crLabel(g, "lo", "O", -0.16, 1.05));
    g.hide(r);
    g.hide(
      crPoint(g, "pA", 2, 0, "A(2)", g.BLUE),
      crPoint(g, "pB", 6, 0, "B(6)", g.BLUE),
      crPoint(g, "pC", 8, 0, null, g.BLUE),
      crPoint(g, "pD", 9, 0, null, g.BLUE),
      crLabel(g, "tC", "C(8)", 7.3, 1.4, g.BLUE),
      crLabel(g, "tD", "D(9)", 9, 2.6, g.BLUE),
      crSpan(g, "sA", 0, 2, -2.2, "OA = 2 см", g.PURPLE),
      crSpan(g, "sB", 0, 6, -3.4, "OB = 6 см", g.TEAL),
      crSpan(g, "sC", 0, 8, -4.6, "OC = 8 см", g.MAGENTA),
      crSpan(g, "sD", 0, 9, -5.8, "OD = 9 см", g.ORANGE),
    );
  },

  steps: [
    {
      title: { kz: "Шарты", ru: "Условие" },
      html: {
        kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> бірлік кесінді \\(= 1\\) см; \\(A(2),\\; B(6),\\; C(8),\\; D(9)\\).</p><p><b>Табу керек:</b> <b class=\"lf-find\">\\(OA,\\; OB,\\; OC,\\; OD = \\,?\\)</b> (см)</p></div>",
        ru: "<div class=\"lf-given\"><p><b>Дано:</b> единичный отрезок \\(= 1\\) см; \\(A(2),\\; B(6),\\; C(8),\\; D(9)\\).</p><p><b>Найти:</b> <b class=\"lf-find\">\\(OA,\\; OB,\\; OC,\\; OD = \\,?\\)</b> (см)</p></div>",
      },
    },
    {
      title: { kz: "Сурет", ru: "Чертёж" },
      html: {
        kz: "<p>Координаталық сәуле сызамыз: санақ басы \\(O\\), бірлік кесінді — \\(1\\) см, бағыты оңға.</p>",
        ru: "<p>Чертим координатный луч: начало отсчёта \\(O\\), единичный отрезок — \\(1\\) см, направление вправо.</p>",
      },
      run(g) {
        g.show("rv", "lo");
        for (var k = 0; k <= 12; k++) g.show("rt" + k, "rl" + k);
      },
    },
    {
      title: { kz: "1-қадам · Нүктелерді белгілейміз", ru: "Шаг 1 · Отмечаем точки" },
      html: {
        kz: "<p>Әр нүктені өз санының тұсына қоямыз: \\(A\\) — 2-ге, \\(B\\) — 6-ға, \\(C\\) — 8-ге, \\(D\\) — 9-ға.</p>",
        ru: "<p>Ставим каждую точку над своим числом: \\(A\\) — на 2, \\(B\\) — на 6, \\(C\\) — на 8, \\(D\\) — на 9.</p>",
      },
      run(g) {
        g.show("pA", "pB", "pC", "pD", "tC", "tD");
      },
    },
    {
      title: { kz: "2-қадам · Кесінділердің ұзындықтары", ru: "Шаг 2 · Длины отрезков" },
      html: {
        kz: "<p>Бірлік кесінді \\(1\\) см болғандықтан, кесіндінің ұзындығы нүктенің координатасына тең:</p><p>\\(OA = 2 \\cdot 1 = 2\\) см; &nbsp; \\(OB = 6 \\cdot 1 = 6\\) см; &nbsp; \\(OC = 8 \\cdot 1 = 8\\) см; &nbsp; \\(OD = 9 \\cdot 1 = 9\\) см.</p>",
        ru: "<p>Так как единичный отрезок равен \\(1\\) см, длина отрезка равна координате точки:</p><p>\\(OA = 2 \\cdot 1 = 2\\) см; &nbsp; \\(OB = 6 \\cdot 1 = 6\\) см; &nbsp; \\(OC = 8 \\cdot 1 = 8\\) см; &nbsp; \\(OD = 9 \\cdot 1 = 9\\) см.</p>",
      },
      run(g) {
        g.show("sA", "sB", "sC", "sD");
      },
    },
    {
      title: { kz: "Жауабы", ru: "Ответ" },
      html: {
        kz: "<div class=\"lf-answer\">\\(OA = 2\\) см, \\(OB = 6\\) см, \\(OC = 8\\) см, \\(OD = 9\\) см.</div><div class=\"lf-callout\">Бірлік кесінді 1 см болғанда координата мен ұзындық сан жағынан бірдей.</div>",
        ru: "<div class=\"lf-answer\">\\(OA = 2\\) см, \\(OB = 6\\) см, \\(OC = 8\\) см, \\(OD = 9\\) см.</div><div class=\"lf-callout\">Когда единичный отрезок равен 1 см, координата и длина численно совпадают.</div>",
      },
    },
  ],
});
})();
