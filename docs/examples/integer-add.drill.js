// Drill generator: сложение и вычитание целых чисел (6 класс) — the
// reference example for docs/DRILL_GENERATOR_FORMAT.md. Integer sums and
// differences in [−20, 20] with a number line that reveals the hops after
// answering. Passes the validation harness as-is.

registerDrillTopic({
  apiVersion: 1,
  id: "integer-add",
  title: {
    kz: "Бүтін сандарды қосу және азайту",
    ru: "Сложение и вычитание целых чисел",
  },
  subtitle: { kz: "6-сынып · арифметика", ru: "6 класс · арифметика" },
  options: [
    {
      id: "ops",
      label: { kz: "Амал", ru: "Действие" },
      choices: [
        { id: "add", label: { kz: "Қосу", ru: "Сложение" } },
        { id: "sub", label: { kz: "Азайту", ru: "Вычитание" } },
      ],
      defaults: ["add", "sub"],
    },
    {
      id: "range",
      label: { kz: "Сандар", ru: "Числа" },
      choices: [
        { id: "small", label: { kz: "−10 … 10", ru: "−10 … 10" } },
        { id: "big", label: { kz: "−20 … 20", ru: "−20 … 20" } },
      ],
      defaults: ["small"],
    },
  ],

  // Difficulty ladder for level-mode rooms: each rung is a preset of the
  // option ticks above (omitted groups run on defaults). Easiest first.
  levels: [
    { label: { kz: "Қосу", ru: "Сложение" }, config: { ops: ["add"], range: ["small"] } },
    { label: { kz: "Азайту", ru: "Вычитание" }, config: { ops: ["sub"], range: ["small"] } },
    { label: { kz: "Аралас", ru: "Смешанный" }, config: { ops: ["add", "sub"], range: ["small"] } },
    { label: { kz: "Үлкен сандар", ru: "Большие числа" }, config: { ops: ["add", "sub"], range: ["big"] } },
  ],

  generate(rng, config) {
    const limit = pick(rng, config.range) === "big" ? 20 : 10;
    const op = pick(rng, config.ops);

    // Both numbers non-zero, result stays on the visible line.
    let a = 0;
    let b = 0;
    let result = 0;
    for (let tries = 0; tries < 50; tries++) {
      a = randInt(rng, -limit, limit);
      b = randInt(rng, -limit, limit);
      if (a === 0 || b === 0) continue;
      result = op === "add" ? a + b : a - b;
      if (Math.abs(result) <= limit) break;
    }
    if (a === 0 || b === 0 || Math.abs(result) > limit) {
      // Unreachable in practice; keeps the invariant airtight regardless.
      a = 3;
      b = 2;
      result = op === "add" ? 5 : 1;
    }

    // Textbook writing: negative numbers in brackets after an operator.
    const wrap = (n) => (n < 0 ? `(${n})` : `${n}`);
    const sign = op === "add" ? "+" : "-";
    const body = `${wrap(a)} ${sign} ${wrap(b)}`;

    // The hop picture: stand on a, then hop by ±b to the result.
    const answer = exact(result);
    return {
      prompt: {
        kz: `Есепте: $${body}$`,
        ru: `Вычислите: $${body}$`,
      },
      answer,
      answerStyle: "fraction",
      keys: keysForAnswer(toPlain(answer)),
      solution: {
        kz: `$${body} = ${result}$`,
        ru: `$${body} = ${result}$`,
      },
      variant: op,
      visual: {
        type: "number-line",
        min: -limit,
        max: limit,
        points: [a],
        arrows: a === result ? [] : [{ from: a, to: result }],
      },
    };
  },
});
