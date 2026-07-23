/*__LESSON_META__
{
  "format": 1,
  "kind": "theory",
  "id": "TEMPLATE-theory",
  "title": { "kz": "Тақырыптың аты", "ru": "Название темы" }
}
__LESSON_META__*/

// ─────────────────────────────────────────────────────────────────────────
// THEORY TEMPLATE — copy this file, rename it, and change every «TEMPLATE-…»
// id + all the KZ/RU text. A theory file with NO GeoGebra renders as PAGED
// slides (one section at a time, Алдыңғы/Келесі arrows). Each section is:
//   title  →  full-width text  →  optional JS figure  →  optional hidden part.
//
// Rules that matter:
//   • Wrap the whole file in the IIFE below (lesson files share one page
//     scope — helpers must not leak between files).
//   • id in the meta header == id in registerLessonTheory (permanent identity;
//     re-uploading the same id UPDATES in place).
//   • Every visible string is { kz, ru }. Math: \( … \) inline, \[ … \] block.
//   • Only these HTML classes are styled: lf-formula / lf-given / lf-answer /
//     lf-callout, and inline <b class="lf-find">…</b> for the goal.
// ─────────────────────────────────────────────────────────────────────────

(function () {

// ── Tiny SVG helpers (self-contained; copy them with the file) ────────────
var NS = "http://www.w3.org/2000/svg";
var DARK = "#1a1a2e", GRAY = "#6b7280", BLUE = "#2563eb", GREEN = "#16a34a", RED = "#dc2626";
function el(tag, attrs, parent) {
  var n = document.createElementNS(NS, tag);
  for (var k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function txt(parent, x, y, s, o) {
  o = o || {};
  var t = el("text", { x: x, y: y, fill: o.fill || DARK, "font-size": o.size || 15,
    "font-weight": o.weight || 500, "text-anchor": o.anchor || "middle",
    "font-family": "system-ui, -apple-system, 'Segoe UI', sans-serif" }, parent);
  t.textContent = s;
  return t;
}
// A coordinate ray 0..maxV with an arrow, ticks, and number labels.
function ray(svg, o) {
  var X = function (v) { return o.x0 + v * o.unit; };
  var end = X(o.maxV) + 26;
  el("line", { x1: X(0), y1: o.y, x2: end, y2: o.y, stroke: DARK, "stroke-width": 3, "stroke-linecap": "round" }, svg);
  el("path", { d: "M" + (end + 12) + " " + o.y + " l-14 -6 v12 z", fill: DARK }, svg);
  for (var v = 0; v <= o.maxV; v++) el("line", { x1: X(v), y1: o.y - 6, x2: X(v), y2: o.y + 6, stroke: DARK, "stroke-width": 1.6 }, svg);
  (o.labels || []).forEach(function (v) { txt(svg, X(v), o.y + 28, String(v), { size: 14, weight: 600 }); });
  txt(svg, X(0) - 9, o.y - 11, "O", { size: 15, weight: 600, anchor: "end" });
  return X;
}

registerLessonTheory({
  format: 1,
  id: "TEMPLATE-theory",
  title: { kz: "Тақырыптың аты", ru: "Название темы" },
  subtitle: { kz: "5-сынып · тарау", ru: "5 класс · глава" },

  sections: [
    // ── Slide 1: a section WITH a figure ──────────────────────────────────
    {
      title: { kz: "Кіріспе", ru: "Введение" },
      html: {
        kz: "<p>Осы жерге түсіндірме мәтін жазыңыз. Формула керек болса: \\( a + b = c \\).</p><div class=\"lf-callout\">Мұғалімге арналған ескерту немесе сұрақ.</div>",
        ru: "<p>Здесь поясняющий текст. Если нужна формула: \\( a + b = c \\).</p><div class=\"lf-callout\">Заметка или вопрос для учителя.</div>",
      },
      // Draw a plain-JS figure into `root`. Re-runs on KZ/RU switch, so read
      // ctx.lang for any text. Return a handle if you need destroy()/buttons.
      visual: function (root /*, ctx */) {
        var svg = el("svg", { viewBox: "0 0 720 130", style: "width:100%;height:auto;display:block" });
        root.appendChild(svg);
        var X = ray(svg, { x0: 60, y: 70, unit: 58, maxV: 10, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
        el("circle", { cx: X(3), cy: 70, r: 6, fill: BLUE }, svg);
        txt(svg, X(3), 48, "A", { size: 14, weight: 700, fill: BLUE });
      },
    },

    // ── Slide 2: a QUESTION section — answers hidden until the teacher reveals ─
    {
      title: { kz: "Сұрақтар", ru: "Вопросы" },
      html: {
        kz: "<p><b>1)</b> Бірінші сұрақ?</p><p><b>2)</b> Екінші сұрақ?</p>",
        ru: "<p><b>1)</b> Первый вопрос?</p><p><b>2)</b> Второй вопрос?</p>",
      },
      // Custom button label (default is «Түсіндіруді көрсету»).
      explanationLabel: { kz: "Жауаптарын көрсету", ru: "Показать ответы" },
      explanation: {
        kz: "<p><b>1)</b> Бірінші жауап.</p><p><b>2)</b> Екінші жауап.</p>",
        ru: "<p><b>1)</b> Первый ответ.</p><p><b>2)</b> Второй ответ.</p>",
      },
    },

    // ── Slide 3: text-only section (no figure, no hidden part) ────────────
    {
      title: { kz: "Түйін", ru: "Итог" },
      html: {
        kz: "<div class=\"lf-answer\">Қорытынды тұжырым осында.</div>",
        ru: "<div class=\"lf-answer\">Итоговый вывод здесь.</div>",
      },
    },
  ],
});
})();
