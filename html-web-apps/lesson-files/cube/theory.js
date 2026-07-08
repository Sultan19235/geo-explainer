/*__LESSON_META__
{
  "format": 1,
  "kind": "theory",
  "id": "cube-theory",
  "title": {
    "kz": "Куб — анықтамасы және формулалары",
    "ru": "Куб — определение и формулы"
  }
}
__LESSON_META__*/

// Reference example of a theory lesson file (cube, two sections).

registerLessonTheory({
  format: 1,
  id: "cube-theory",
  title: {
    kz: "Куб — анықтамасы және формулалары",
    ru: "Куб — определение и формулы",
  },
  subtitle: { kz: "10-сынып · Стереометрия", ru: "10 класс · Стереометрия" },

  sections: [
    {
      title: { kz: "Анықтамасы", ru: "Определение" },
      html: {
        kz: "<p><b>Куб</b> — барлық қыры тең, барлық жағы шаршы болатын дұрыс көпжақ. Кубтың 8 төбесі, 12 қыры және 6 жағы бар.</p><p>Қыры \\(a\\) деп белгіленеді.</p>",
        ru: "<p><b>Куб</b> — правильный многогранник, у которого все рёбра равны, а все грани — квадраты. У куба 8 вершин, 12 рёбер и 6 граней.</p><p>Ребро обозначается \\(a\\).</p>",
      },
      view: "3d",
      home: "(1.3,-1.6,0.7)",
      fit: [-3.5, 3.5, -3.5, 3.5, -2.8, 2.8],
      ggb(g) {
        var h = 2;
        g.P("A", -h, -h, -h, "$A$");
        g.P("B", h, -h, -h, "$B$");
        g.P("C", h, h, -h, "$C$");
        g.P("D", -h, h, -h, "$D$");
        g.P("A1", -h, -h, h, "$A_1$");
        g.P("B1", h, -h, h, "$B_1$");
        g.P("C1", h, h, h, "$C_1$");
        g.P("D1", -h, h, h, "$D_1$");
        [
          ["eAB", "A", "B"], ["eBC", "B", "C"], ["eCD", "C", "D"], ["eDA", "D", "A"],
          ["eA1B1", "A1", "B1"], ["eB1C1", "B1", "C1"], ["eC1D1", "C1", "D1"], ["eD1A1", "D1", "A1"],
          ["eAA1", "A", "A1"], ["eBB1", "B", "B1"], ["eCC1", "C", "C1"], ["eDD1", "D", "D1"],
        ].forEach(function (e) {
          g.SEG(e[0], e[1], e[2]);
        });
        g.cap("eAB", "$a$");
      },
    },
    {
      title: { kz: "Негізгі формулалары", ru: "Основные формулы" },
      html: {
        kz: '<div class="lf-formula">\\[ S = 6a^2 \\]<div class="lf-formula-label">Толық бетінің ауданы</div></div><div class="lf-formula">\\[ V = a^3 \\]<div class="lf-formula-label">Көлемі</div></div><div class="lf-formula">\\[ d = a\\sqrt{3} \\]<div class="lf-formula-label">Диагоналы</div></div>',
        ru: '<div class="lf-formula">\\[ S = 6a^2 \\]<div class="lf-formula-label">Площадь полной поверхности</div></div><div class="lf-formula">\\[ V = a^3 \\]<div class="lf-formula-label">Объём</div></div><div class="lf-formula">\\[ d = a\\sqrt{3} \\]<div class="lf-formula-label">Диагональ</div></div>',
      },
      view: "3d",
      home: "(1.3,-1.6,0.7)",
      fit: [-3.5, 3.5, -3.5, 3.5, -2.8, 2.8],
      ggb(g) {
        var h = 2;
        g.P("A", -h, -h, -h, "$A$");
        g.P("B", h, -h, -h, "$B$");
        g.P("C", h, h, -h, "$C$");
        g.P("D", -h, h, -h, "$D$");
        g.P("A1", -h, -h, h, "$A_1$");
        g.P("B1", h, -h, h, "$B_1$");
        g.P("C1", h, h, h, "$C_1$");
        g.P("D1", -h, h, h, "$D_1$");
        [
          ["eAB", "A", "B"], ["eBC", "B", "C"], ["eCD", "C", "D"], ["eDA", "D", "A"],
          ["eA1B1", "A1", "B1"], ["eB1C1", "B1", "C1"], ["eC1D1", "C1", "D1"], ["eD1A1", "D1", "A1"],
          ["eAA1", "A", "A1"], ["eBB1", "B", "B1"], ["eCC1", "C", "C1"], ["eDD1", "D", "D1"],
        ].forEach(function (e) {
          g.SEG(e[0], e[1], e[2]);
        });
        g.DIAG("diag", "A", "C1");
        g.cap("diag", "$d = a\\sqrt{3}$");
        g.cap("eAB", "$a$");
      },
    },
  ],
});
