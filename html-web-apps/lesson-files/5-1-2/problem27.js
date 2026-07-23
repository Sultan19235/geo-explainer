/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "coord-ray-cities",
  "number": "27",
  "title": { "kz": "Қалалар", "ru": "Города" },
  "difficulty": "med",
  "tags": [ { "kz": "бірлік кесінді", "ru": "единичный отрезок" } ]
}
__LESSON_META__*/

// File-scoped: lesson files share the page global scope — helpers must not leak.
(function () {

// №27: three coordinate rays from O (Astana), unit = 60 km. Read off the
// unit counts for Kostanay (11), Pavlodar (7), Zhezkazgan (10) → distances.

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
function crLabel(g, n, txt, x, y, color) {
  g.cmd(n + '=Text("' + txt + '",(' + x + "," + y + "))");
  g.col(n, color || g.DARK); g.lock(n);
  return n;
}

// One angled ray from the origin: arrow, 12 perpendicular ticks, name label.
// Returns all object names.
function cityRay(g, id, angleDeg, labelTxt, labelX, labelY, color) {
  var a = (angleDeg * Math.PI) / 180;
  var dx = Math.cos(a), dy = Math.sin(a);
  var names = [id + "v"];
  g.cmd(id + "v=Vector((0,0),(" + 13 * dx + "," + 13 * dy + "))");
  g.col(id + "v", color); g.thick(id + "v", 3); g.labelOff(id + "v"); g.lock(id + "v");
  for (var k = 1; k <= 12; k++) {
    var px = k * dx, py = k * dy;
    var tn = id + "t" + k;
    g.cmd(tn + "=Segment((" + (px - 0.28 * dy) + "," + (py + 0.28 * dx) + "),(" + (px + 0.28 * dy) + "," + (py - 0.28 * dx) + "))");
    g.col(tn, color); g.thick(tn, 2); g.labelOff(tn); g.lock(tn);
    names.push(tn);
  }
  names.push(crLabel(g, id + "n", labelTxt, labelX, labelY, color));
  return names;
}

function cityPoint(g, n, angleDeg, u, color) {
  var a = (angleDeg * Math.PI) / 180;
  g.cmd(n + "=Point({" + u * Math.cos(a) + "," + u * Math.sin(a) + ",0})");
  g.pointSize(n, 6); g.col(n, color); g.cap(n, "?"); g.lock(n);
  return n;
}

registerLessonProblem({
  format: 1,
  id: "coord-ray-cities",
  number: "27",
  title: { kz: "Қалалар", ru: "Города" },
  difficulty: "med",
  tags: [{ kz: "бірлік кесінді", ru: "единичный отрезок" }],

  statement: {
    kz: "<p>Суретте санақ басы \\(O\\) нүктесі (Астана) болатын, бірлік кесіндісі \\(60\\) км-ге тең координаталық сәулелер кескінделген. <b class=\"lf-find\">Қостанай, Павлодар, Жезқазған қалаларының Астанадан арақашықтықтарын (жуықтап) табыңдар.</b></p>",
    ru: "<p>На рисунке изображены координатные лучи с началом отсчёта в точке \\(O\\) (Астана) и единичным отрезком \\(60\\) км. <b class=\"lf-find\">Найдите (приближённо) расстояния городов Костанай, Павлодар, Жезказган от Астаны.</b></p>",
  },

  init(g) {
    crFrame(g, -16.5, 15, -18.7, 12.8);
    var all = [];
    all = all.concat(cityRay(g, "k", 154, "Қостанай", -14.8, 7.2, g.BLUE));
    all = all.concat(cityRay(g, "p", 20, "Павлодар", 12.4, 5.6, g.ORANGE));
    all = all.concat(cityRay(g, "j", 249, "Жезқазған", -7.6, -13.9, g.PURPLE));
    g.cmd("cO=Point({0,0,0})");
    g.pointSize("cO", 6); g.col("cO", g.DARK); g.cap("cO", "O (Астана)"); g.lock("cO");
    all.push("cO");
    all.push(cityPoint(g, "cK", 154, 11, g.RED));
    all.push(cityPoint(g, "cP", 20, 7, g.RED));
    all.push(cityPoint(g, "cJ", 249, 10, g.RED));
    g.hide(all);
  },

  steps: [
    {
      title: { kz: "Шарты", ru: "Условие" },
      html: {
        kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> санақ басы — \\(O\\) (Астана); бірлік кесінді \\(= 60\\) км; әр қала өз сәулесінде белгіленген.</p><p><b>Табу керек:</b> <b class=\"lf-find\">әр қалаға дейінгі қашықтық \\(= \\,?\\)</b> (км)</p></div>",
        ru: "<div class=\"lf-given\"><p><b>Дано:</b> начало отсчёта — \\(O\\) (Астана); единичный отрезок \\(= 60\\) км; каждый город отмечен на своём луче.</p><p><b>Найти:</b> <b class=\"lf-find\">расстояние до каждого города \\(= \\,?\\)</b> (км)</p></div>",
      },
    },
    {
      title: { kz: "Сурет", ru: "Чертёж" },
      html: {
        kz: "<p>Астанадан үш бағытта үш координаталық сәуле шығады. Әр сәуленің штрихтарының арасы — бір бірлік кесінді, яғни \\(60\\) км.</p>",
        ru: "<p>Из Астаны выходят три координатных луча. Расстояние между штрихами каждого луча — один единичный отрезок, то есть \\(60\\) км.</p>",
      },
      run(g) {
        g.show("cO", "kn", "pn", "jn", "kv", "pv", "jv", "cK", "cP", "cJ");
        for (var k = 1; k <= 12; k++) g.show("kt" + k, "pt" + k, "jt" + k);
      },
    },
    {
      title: { kz: "Теория", ru: "Теория" },
      html: {
        kz: "<div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Қашықтық = бірлік саны × бірлік кесіндінің ұзындығы</div></div><p>Қаланың координатасы — \\(O\\)-дан қалаға дейінгі бірлік кесінділердің саны \\(n\\).</p>",
        ru: "<div class=\"lf-formula\">\\[ S = n \\cdot e \\]<div class=\"lf-formula-label\">Расстояние = число единиц × длина единичного отрезка</div></div><p>Координата города — число единичных отрезков \\(n\\) от \\(O\\) до города.</p>",
      },
    },
    {
      title: { kz: "1-қадам · Қостанай", ru: "Шаг 1 · Костанай" },
      html: {
        kz: "<p>Қостанай сәулесінде штрихтарды санаймыз: 11 бірлік.</p>\\[ S = n \\cdot e \\]\\[ S = 11 \\cdot 60 = 660 \\text{ км} \\]",
        ru: "<p>Считаем штрихи на луче Костаная: 11 единиц.</p>\\[ S = n \\cdot e \\]\\[ S = 11 \\cdot 60 = 660 \\text{ км} \\]",
      },
      run(g) {
        g.cap("cK", "11 · 60 = 660 км");
      },
    },
    {
      title: { kz: "2-қадам · Павлодар", ru: "Шаг 2 · Павлодар" },
      html: {
        kz: "<p>Павлодар сәулесінде: 7 бірлік.</p>\\[ S = 7 \\cdot 60 = 420 \\text{ км} \\]",
        ru: "<p>На луче Павлодара: 7 единиц.</p>\\[ S = 7 \\cdot 60 = 420 \\text{ км} \\]",
      },
      run(g) {
        g.cap("cP", "7 · 60 = 420 км");
      },
    },
    {
      title: { kz: "3-қадам · Жезқазған", ru: "Шаг 3 · Жезказган" },
      html: {
        kz: "<p>Жезқазған сәулесінде: 10 бірлік.</p>\\[ S = 10 \\cdot 60 = 600 \\text{ км} \\]",
        ru: "<p>На луче Жезказгана: 10 единиц.</p>\\[ S = 10 \\cdot 60 = 600 \\text{ км} \\]",
      },
      run(g) {
        g.cap("cJ", "10 · 60 = 600 км");
      },
    },
    {
      title: { kz: "Жауабы", ru: "Ответ" },
      html: {
        kz: "<div class=\"lf-answer\">Астанадан: Қостанай — \\(\\approx 660\\) км, Павлодар — \\(\\approx 420\\) км, Жезқазған — \\(\\approx 600\\) км.</div><div class=\"lf-callout\">Нақты қашықтықтар да осыған жуық: карта бойынша ≈ 660, ≈ 420 және ≈ 600 км.</div>",
        ru: "<div class=\"lf-answer\">От Астаны: Костанай — \\(\\approx 660\\) км, Павлодар — \\(\\approx 420\\) км, Жезказган — \\(\\approx 600\\) км.</div><div class=\"lf-callout\">Реальные расстояния близки к этим: по карте ≈ 660, ≈ 420 и ≈ 600 км.</div>",
      },
    },
  ],
});
})();
