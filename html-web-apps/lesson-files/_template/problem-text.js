/*__LESSON_META__
{
  "format": 1,
  "kind": "problem",
  "id": "TEMPLATE-problem-text",
  "number": "2",
  "title": { "kz": "Мәтіндік есеп", "ru": "Текстовая задача" },
  "difficulty": "med",
  "tags": [ { "kz": "логика", "ru": "логика" } ]
}
__LESSON_META__*/

// ─────────────────────────────────────────────────────────────────────────
// PROBLEM TEMPLATE (TEXT ONLY — no figure). Copy, rename, change id + text.
// Same as problem-figure.js but with NO `visual`: statement on top, then the
// whole worked solution hidden behind «Түсіндіруді көрсету». Use this for
// arithmetic / logic problems that don't need a drawing.
// ─────────────────────────────────────────────────────────────────────────

(function () {

registerLessonProblem({
  format: 1,
  id: "TEMPLATE-problem-text",
  number: "2",
  title: { kz: "Мәтіндік есеп", ru: "Текстовая задача" },
  difficulty: "med",
  tags: [{ kz: "логика", ru: "логика" }],

  statement: {
    kz: "<p>Есептің шарты осында. <b class=\"lf-find\">Нені табу керек екенін жазыңыз.</b></p><div class=\"lf-callout\">Ойлануға бағыттайтын кеңес (міндетті емес).</div>",
    ru: "<p>Условие задачи здесь. <b class=\"lf-find\">Напишите, что нужно найти.</b></p><div class=\"lf-callout\">Подсказка, направляющая мысль (необязательно).</div>",
  },

  // No `visual`, no `steps` — just the hidden solution.
  explanation: {
    kz: "<p><b>Шешуі.</b> Қадамдап түсіндіріңіз: \\[ 12 : 2 = 6 \\]</p><div class=\"lf-answer\">Жауабы: 6.</div>",
    ru: "<p><b>Решение.</b> Объясните по шагам: \\[ 12 : 2 = 6 \\]</p><div class=\"lf-answer\">Ответ: 6.</div>",
  },
});
})();
