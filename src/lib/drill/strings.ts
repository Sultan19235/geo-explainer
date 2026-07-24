// Drill engine UI copy (KZ/RU) — same pattern as quiz/engine-strings.ts.
// Topic content (prompts, solutions) lives in the topic modules themselves;
// this file is only the shared chrome around it.

import type { DrillText } from "./types";

export const DRILL_STRINGS = {
  kz: {
    setup_title: "Баптау",
    setup_start: "Бастау",
    setup_hint: "Кемінде бір нұсқа таңдалуы керек",
    check_button: "Тексеру",
    next_button: "Келесі",
    correct: "Дұрыс!",
    wrong: "Қате",
    right_answer: "Дұрыс жауап:",
    retry_badge: "Қайталау",
    invalid_input: "Жауапты толық теріңіз",
    stat_done: "Есеп",
    stat_correct: "Дұрыс",
    stat_streak: "Қатарынан",
    settings_button: "Баптау",
    input_empty: "Жауап",
    levels_title: "Деңгейлер",
    levels_custom: "Өз баптауым",
  },
  ru: {
    setup_title: "Настройка",
    setup_start: "Начать",
    setup_hint: "Выберите хотя бы один вариант",
    check_button: "Проверить",
    next_button: "Далее",
    correct: "Верно!",
    wrong: "Ошибка",
    right_answer: "Правильный ответ:",
    retry_badge: "Повтор",
    invalid_input: "Введите ответ полностью",
    stat_done: "Задач",
    stat_correct: "Верно",
    stat_streak: "Подряд",
    settings_button: "Настройка",
    input_empty: "Ответ",
    levels_title: "Уровни",
    levels_custom: "Своя настройка",
  },
} as const;

export type DrillStringKey = keyof (typeof DRILL_STRINGS)["kz"];

export function drillT(lang: "kz" | "ru") {
  return (key: DrillStringKey): string => DRILL_STRINGS[lang][key];
}

export function locDrill(text: DrillText, lang: "kz" | "ru"): string {
  return lang === "ru" ? text.ru : text.kz;
}
