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

// №25: grasshopper starts at A(3), hops 2 left then 5 right, repeatedly.
// Which of 2, 4, 5, 7, 9, 12 does it visit? Path: 3,1,6,4,9,7,12,10,…

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
// Hop arc between two ray values (semicircle above the ray).
function crHop(g, n, a, b, color) {
  g.cmd(n + "=CircularArc((" + (a + b) / 2 + ",0),(" + Math.max(a, b) + ",0),(" + Math.min(a, b) + ",0))");
  g.col(n, color || g.GREEN); g.thick(n, 3); g.labelOff(n); g.lock(n);
  return n;
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

  init(g) {
    crFrame(g, -2.4, 20, -8.8, 13.6);
    var r = crRay(g, "r", 18, 0, { tick: 0.22, labelOff: 1, lx: 0.13, over: 1.6, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] });
    r.push(crLabel(g, "lo", "O", -0.18, 1.2));
    g.hide(r);
    g.hide(crLabel(g, "eg", "🦗", 2.6, 3.4));
    // Start point + candidate targets (orange).
    g.hide(crPoint(g, "p3", 3, 0, "A(3)", g.GREEN, 6));
    [2, 4, 5, 7, 9, 12].forEach(function (v) {
      g.hide(crPoint(g, "c" + v, v, 0, null, g.ORANGE, 4));
    });
    // Visited points and hop arcs, revealed jump by jump.
    g.hide(
      crPoint(g, "v1", 1, 0, null, g.GREEN, 5),
      crPoint(g, "v6", 6, 0, null, g.GREEN, 5),
      crPoint(g, "v4", 4, 0, null, g.GREEN, 5),
      crPoint(g, "v9", 9, 0, null, g.GREEN, 5),
      crPoint(g, "v7", 7, 0, null, g.GREEN, 5),
      crPoint(g, "v12", 12, 0, null, g.GREEN, 5),
      crPoint(g, "v10", 10, 0, null, g.GREEN, 5),
      crPoint(g, "v15", 15, 0, null, g.GREEN, 5),
      crHop(g, "h1", 3, 1),
      crHop(g, "h2", 1, 6),
      crHop(g, "h3", 6, 4),
      crHop(g, "h4", 4, 9),
      crHop(g, "h5", 9, 7),
      crHop(g, "h6", 7, 12),
      crHop(g, "h7", 12, 10),
      crHop(g, "h8", 10, 15),
    );
  },

  steps: [
    {
      title: { kz: "Шарты", ru: "Условие" },
      html: {
        kz: "<div class=\"lf-given\"><p><b>Берілгені:</b> бастапқы нүкте \\(A(3)\\); секірулер: солға 2, оңға 5, солға 2, оңға 5, …</p><p><b>Табу керек:</b> <b class=\"lf-find\">2, 4, 5, 7, 9, 12 нүктелерінің қайсысында болады?</b></p></div>",
        ru: "<div class=\"lf-given\"><p><b>Дано:</b> начальная точка \\(A(3)\\); прыжки: влево 2, вправо 5, влево 2, вправо 5, …</p><p><b>Найти:</b> <b class=\"lf-find\">в каких из точек 2, 4, 5, 7, 9, 12 он побывает?</b></p></div>",
      },
    },
    {
      title: { kz: "Сурет", ru: "Чертёж" },
      html: {
        kz: "<p>Шегіртке \\(A(3)\\) нүктесінде тұр. Қызғылт сары нүктелер — тексеретін координаталар: \\(2, 4, 5, 7, 9, 12\\).</p>",
        ru: "<p>Кузнечик стоит в точке \\(A(3)\\). Оранжевые точки — координаты для проверки: \\(2, 4, 5, 7, 9, 12\\).</p>",
      },
      run(g) {
        g.show("rv", "lo", "eg", "p3");
        for (var k = 0; k <= 18; k++) g.show("rt" + k, "rl" + k);
        [2, 4, 5, 7, 9, 12].forEach(function (v) { g.show("c" + v); });
      },
    },
    {
      title: { kz: "Шешу жоспары", ru: "План решения" },
      html: {
        kz: "<p>1. Жолды қадамдап жазамыз.</p><p>2. Пайда болған сандар тізбегінен заңдылық іздейміз.</p><p>3. Заңдылық арқылы әр нүктені тексереміз.</p>",
        ru: "<p>1. Выписываем путь прыжок за прыжком.</p><p>2. Ищем закономерность в получившейся последовательности.</p><p>3. По закономерности проверяем каждую точку.</p>",
      },
    },
    {
      title: { kz: "1-қадам · Алғашқы секірулер", ru: "Шаг 1 · Первые прыжки" },
      html: {
        kz: "<p>Жолды жазамыз:</p>\\[ 3 - 2 = 1, \\qquad 1 + 5 = 6 \\]<p>Шегіртке 3-тен 1-ге, одан 6-ға секірді.</p>",
        ru: "<p>Записываем путь:</p>\\[ 3 - 2 = 1, \\qquad 1 + 5 = 6 \\]<p>Кузнечик прыгнул с 3 на 1, оттуда — на 6.</p>",
      },
      run(g) {
        g.show("v1", "v6", "h1", "h2");
      },
    },
    {
      title: { kz: "2-қадам · Жолдың жалғасы", ru: "Шаг 2 · Продолжение пути" },
      html: {
        kz: "<p>Дәл солай жалғастырамыз:</p>\\[ 6 - 2 = 4, \\quad 4 + 5 = 9, \\quad 9 - 2 = 7, \\quad 7 + 5 = 12, \\quad 12 - 2 = 10, \\quad 10 + 5 = 15, \\;\\ldots \\]<p>Жол: \\(3,\\; 1,\\; 6,\\; 4,\\; 9,\\; 7,\\; 12,\\; 10,\\; 15,\\; \\ldots\\)</p>",
        ru: "<p>Продолжаем так же:</p>\\[ 6 - 2 = 4, \\quad 4 + 5 = 9, \\quad 9 - 2 = 7, \\quad 7 + 5 = 12, \\quad 12 - 2 = 10, \\quad 10 + 5 = 15, \\;\\ldots \\]<p>Путь: \\(3,\\; 1,\\; 6,\\; 4,\\; 9,\\; 7,\\; 12,\\; 10,\\; 15,\\; \\ldots\\)</p>",
      },
      run(g) {
        g.show("v4", "v9", "v7", "v12", "v10", "v15", "h3", "h4", "h5", "h6", "h7", "h8");
      },
    },
    {
      title: { kz: "3-қадам · Заңдылық", ru: "Шаг 3 · Закономерность" },
      html: {
        kz: "<p>Әр <b>екі</b> секіру шегірткені \\(5 - 2 = 3\\) бірлікке оңға жылжытады. Сондықтан ол екі тізбектің сандарында ғана болады:</p><p>тақ орындарда: \\(3, 6, 9, 12, 15, \\ldots\\) (3-тен бастап +3);</p><p>жұп орындарда: \\(1, 4, 7, 10, 13, \\ldots\\) (1-ден бастап +3).</p><p>Тексереміз: \\(4\\) ✓, \\(7\\) ✓, \\(9\\) ✓, \\(12\\) ✓; ал \\(2\\) мен \\(5\\) — екі тізбекте де жоқ. ✗</p>",
        ru: "<p>Каждые <b>два</b> прыжка сдвигают кузнечика на \\(5 - 2 = 3\\) единицы вправо. Поэтому он бывает только в числах двух последовательностей:</p><p>\\(3, 6, 9, 12, 15, \\ldots\\) (от 3 с шагом +3);</p><p>\\(1, 4, 7, 10, 13, \\ldots\\) (от 1 с шагом +3).</p><p>Проверяем: \\(4\\) ✓, \\(7\\) ✓, \\(9\\) ✓, \\(12\\) ✓; а \\(2\\) и \\(5\\) нет ни в одной. ✗</p>",
      },
      run(g) {
        g.col("c2", g.GRAY);
        g.col("c5", g.GRAY);
        g.cap("c2", "2 ✗"); g.show("c2");
        g.cap("c5", "5 ✗"); g.show("c5");
      },
    },
    {
      title: { kz: "Жауабы", ru: "Ответ" },
      html: {
        kz: "<div class=\"lf-answer\">Шегіртке \\(4,\\; 7,\\; 9,\\; 12\\) нүктелерінде болады; \\(2\\) мен \\(5\\) нүктелеріне ешқашан түспейді.</div><div class=\"lf-callout\">Кілт идея: жеке секірулер емес, ЕКІ секірудің қосындысы (+3) заңдылық береді.</div>",
        ru: "<div class=\"lf-answer\">Кузнечик побывает в точках \\(4,\\; 7,\\; 9,\\; 12\\); в точки \\(2\\) и \\(5\\) он не попадёт никогда.</div><div class=\"lf-callout\">Ключевая идея: закономерность даёт не отдельный прыжок, а СУММА двух прыжков (+3).</div>",
      },
    },
  ],
});
})();
