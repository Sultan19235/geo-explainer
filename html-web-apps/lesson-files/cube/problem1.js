/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "cube-volume-from-surface",
  "number": "1",
  "title": {
    "kz": "Куб — беті бойынша көлемі",
    "ru": "Куб — объём по площади поверхности"
  },
  "difficulty": "easy",
  "tags": [
    { "kz": "көлем", "ru": "объём" },
    { "kz": "беттің ауданы", "ru": "площадь поверхности" }
  ]
}
__LESSON_META__*/

// Reference example of the lesson-file format (converted from
// cube/problem1.html). True scale: S = 150 → a = 5, so the cube is built
// with edge 5 and the camera fits it via `fit`.

registerLessonProblem({
  format: 1,
  id: "cube-volume-from-surface",
  number: "1",
  title: {
    kz: "Куб — беті бойынша көлемі",
    ru: "Куб — объём по площади поверхности",
  },
  difficulty: "easy",
  tags: [
    { kz: "көлем", ru: "объём" },
    { kz: "беттің ауданы", ru: "площадь поверхности" },
  ],
  view: "3d",
  home: "(1.3,-1.6,0.7)",
  fit: [-4.5, 4.5, -4.5, 4.5, -3.5, 3.5],

  statement: {
    kz: "<p>Кубтың бетінің ауданы \\(150\\)-ге тең. Оның көлемін табыңыз.</p>",
    ru: "<p>Площадь поверхности куба равна \\(150\\). Найдите его объём.</p>",
  },

  init(g) {
    // Cube with edge a = 5 (true scale), centred at the origin: 8 vertices,
    // 12 edges, 6 faces — everything built once and hidden; steps reveal.
    var h = 2.5;
    g.P("A", -h, -h, -h, "$A$");
    g.P("B", h, -h, -h, "$B$");
    g.P("C", h, h, -h, "$C$");
    g.P("D", -h, h, -h, "$D$");
    g.P("A1", -h, -h, h, "$A_1$");
    g.P("B1", h, -h, h, "$B_1$");
    g.P("C1", h, h, h, "$C_1$");
    g.P("D1", -h, h, h, "$D_1$");

    g.SEG("eAB", "A", "B");
    g.SEG("eBC", "B", "C");
    g.SEG("eCD", "C", "D");
    g.SEG("eDA", "D", "A");
    g.SEG("eA1B1", "A1", "B1");
    g.SEG("eB1C1", "B1", "C1");
    g.SEG("eC1D1", "C1", "D1");
    g.SEG("eD1A1", "D1", "A1");
    g.SEG("eAA1", "A", "A1");
    g.SEG("eBB1", "B", "B1");
    g.SEG("eCC1", "C", "C1");
    g.SEG("eDD1", "D", "D1");

    g.POLY("fBot", ["A", "B", "C", "D"]);
    g.POLY("fTop", ["A1", "B1", "C1", "D1"]);
    g.POLY("fFront", ["A", "B", "B1", "A1"]);
    g.POLY("fRight", ["B", "C", "C1", "B1"]);
    g.POLY("fBack", ["C", "D", "D1", "C1"]);
    g.POLY("fLeft", ["D", "A", "A1", "D1"]);
    ["fBot", "fTop", "fFront", "fRight", "fBack", "fLeft"].forEach(function (n) {
      g.fill(n, 0.08);
    });

    g.hide(
      ["A", "B", "C", "D", "A1", "B1", "C1", "D1"],
      ["eAB", "eBC", "eCD", "eDA", "eA1B1", "eB1C1", "eC1D1", "eD1A1"],
      ["eAA1", "eBB1", "eCC1", "eDD1"],
      ["fBot", "fTop", "fFront", "fRight", "fBack", "fLeft"],
    );
  },

  steps: [
    {
      title: {
        kz: "Қажетті формулалар",
        ru: "Необходимые формулы",
      },
      html: {
        kz: '<p>Куб 6 тең шаршыдан тұрады. Әр шаршының ауданы \\(a^2\\), мұндағы \\(a\\) — куб қыры.</p><div class="lf-formula">\\[ S = 6a^2 \\]</div><div class="lf-formula">\\[ V = a^3 \\]</div>',
        ru: '<p>Куб состоит из 6 равных квадратов. Площадь каждого \\(a^2\\), где \\(a\\) — ребро куба.</p><div class="lf-formula">\\[ S = 6a^2 \\]</div><div class="lf-formula">\\[ V = a^3 \\]</div>',
      },
    },
    {
      title: { kz: "Табанын саламыз", ru: "Строим основание" },
      html: {
        kz: "<p>Куб — барлық қыры тең, барлық жағы шаршы болатын дұрыс көпжақ. Алдымен табанын — \\(ABCD\\) шаршысын — саламыз.</p>",
        ru: "<p>Куб — многогранник, у которого все рёбра равны, а грани — квадраты. Сначала строим основание — квадрат \\(ABCD\\).</p>",
      },
      run(g) {
        g.show(["A", "B", "C", "D"], ["eAB", "eBC", "eCD", "eDA"], "fBot");
        g.fill("fBot", 0.12);
      },
    },
    {
      title: { kz: "Тік қырлары", ru: "Вертикальные рёбра" },
      html: {
        kz: "<p>Әрбір төбеден жоғары қарай қырға тең тік қырларды (\\(AA_1\\), \\(BB_1\\), \\(CC_1\\), \\(DD_1\\)) тұрғызамыз. Олар табанға перпендикуляр.</p>",
        ru: "<p>Из каждой вершины поднимаем вертикальные рёбра \\(AA_1\\), \\(BB_1\\), \\(CC_1\\), \\(DD_1\\), равные ребру и перпендикулярные основанию.</p>",
      },
      run(g) {
        g.show(["A1", "B1", "C1", "D1"], ["eAA1", "eBB1", "eCC1", "eDD1"]);
      },
    },
    {
      title: { kz: "Үстіңгі жағы", ru: "Верхняя грань" },
      html: {
        kz: "<p>Жоғарғы төбелерді қосып, үстіңгі жақты — \\(A_1B_1C_1D_1\\) шаршысын — саламыз. Куб дайын!</p>",
        ru: "<p>Соединяем верхние вершины — получаем верхнюю грань \\(A_1B_1C_1D_1\\). Куб готов!</p>",
      },
      run(g) {
        g.show(["eA1B1", "eB1C1", "eC1D1", "eD1A1"], "fTop");
        g.fill("fTop", 0.1);
      },
    },
    {
      title: { kz: "Қырын табамыз", ru: "Находим ребро" },
      html: {
        kz: '<p>Куб 6 тең шаршыдан тұрады, әр шаршының ауданы \\(a^2\\). Беттің ауданы берілген, сондықтан:</p><div class="lf-formula">\\[ 6a^2 = 150 \\;\\Rightarrow\\; a^2 = 25 \\;\\Rightarrow\\; a = 5 \\]</div>',
        ru: '<p>Куб состоит из 6 равных квадратов площадью \\(a^2\\). Площадь поверхности дана, поэтому:</p><div class="lf-formula">\\[ 6a^2 = 150 \\;\\Rightarrow\\; a^2 = 25 \\;\\Rightarrow\\; a = 5 \\]</div>',
      },
      run(g) {
        g.col("eAB", g.ORANGE);
        g.thick("eAB", 5);
        g.cap("eAB", "$a = 5$");
      },
    },
    {
      title: { kz: "Көлемі (жауабы)", ru: "Объём (ответ)" },
      html: {
        kz: '<p>Қыры белгілі болғандықтан, көлемін табамыз:</p><div class="lf-formula">\\[ V = a^3 = 5^3 = 125 \\]</div><div class="lf-answer">Жауабы: \\( V = 125 \\)</div>',
        ru: '<p>Зная ребро, находим объём:</p><div class="lf-formula">\\[ V = a^3 = 5^3 = 125 \\]</div><div class="lf-answer">Ответ: \\( V = 125 \\)</div>',
      },
      run(g) {
        g.show(["fFront", "fRight", "fBack", "fLeft", "fBot", "fTop"]);
      },
    },
  ],
});
