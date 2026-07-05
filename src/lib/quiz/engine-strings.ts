// UI strings of the quiz engine (student page + teacher console), KZ/RU.
// Kept next to the engine instead of the site-wide strings.ts: these labels
// only exist inside /play and the embedded console.

import type { PackLang } from "./pack";

export const ENGINE_STRINGS = {
  kz: {
    // student — join
    join_title: "Тестке қосылу",
    join_name_label: "Атың",
    join_name_placeholder: "Аты-жөніңді жаз",
    join_code_label: "Бөлме коды",
    join_code_placeholder: "Мысалы: A1B2C3",
    join_button: "Қосылу",
    join_pending: "Қосылуда...",
    err_name: "Атыңды жаз.",
    err_code: "Бөлме кодын жаз.",
    err_not_found: "Бұндай бөлме табылмады. Кодты тексер.",
    err_ended: "Бұл сабақ аяқталып қойды.",
    err_network: "Байланыс қатесі. Қайталап көр.",
    // student — waiting
    waiting_title: "Мұғалімді күтеміз...",
    waiting_desc: "Тест мұғалім бастаған кезде ашылады.",
    waiting_you: "Сен қосылдың",
    // student — quiz
    question_label: "Сұрақ",
    check_button: "Тексеру",
    next_button: "Келесі",
    finish_button: "Аяқтау",
    input_placeholder: "Жауабыңды осында жаз",
    feedback_correct: "Дұрыс! 🎉",
    feedback_wrong: "Қате",
    correct_answer_label: "Дұрыс жауап",
    solution_label: "Шешуі",
    formulas_button: "Формулалар",
    score_label: "Ұпай",
    streak_label: "Қатарынан",
    // student — done / ended
    done_title: "Барлық сұрақ аяқталды! 🏁",
    done_desc: "Нәтижең мұғалімнің экранында. Сабақ аяқталғанша күте тұр.",
    ended_title: "Сабақ аяқталды",
    ended_desc: "Мұғалім тестті аяқтады. Жарайсың!",
    result_label: "Нәтижең",
    close_button: "Жабу",
    preview_badge: "АЛДЫН АЛА ҚАРАУ",
    preview_show_answers: "Жауаптарды көрсету",
    preview_hide_answers: "Жауаптарды жасыру",
    // console — setup
    c_questions: "сұрақ",
    c_open_room: "Бөлме ашу",
    c_creating: "Ашылуда...",
    c_err_unauthorized: "Бөлме ашу үшін жүйеге кіру қажет.",
    c_err_network: "Серверге қосылу мүмкін болмады. Қайталап көріңіз.",
    // console — question picker
    c_select_hint: "Тестке кіретін сұрақтарды таңдаңыз",
    c_select_all: "Барлығын таңдау",
    c_deselect_all: "Таңдауды алу",
    c_selected: "таңдалды",
    c_none_selected: "Кемінде бір сұрақ таңдаңыз.",
    // console — lobby
    c_room_code: "Бөлме коды",
    c_scan_hint: "Оқушылар QR-кодты сканерлейді немесе кодты енгізеді",
    c_students: "Оқушылар",
    c_waiting_students: "Оқушылардың қосылуын күтеміз...",
    c_start: "Тестті бастау",
    c_back: "Артқа",
    c_show_qr: "QR үлкейту",
    c_copy_link: "Сілтемені көшіру",
    c_copied: "Көшірілді!",
    // console — live
    c_end: "Аяқтау",
    c_end_confirm: "Тестті аяқтайсыз ба?",
    c_no_students: "Әзірге ешкім қосылған жоқ.",
    c_finished_tag: "аяқтады",
    c_away_tag: "шығып кетті",
    c_answers_label: "жауап",
    c_fullscreen: "Толық экран",
    // console — results
    c_results_title: "Нәтижелер",
    c_new_session: "Жаңа сессия",
    c_results_empty: "Бұл сессияда оқушы болмады.",
    c_results_note: "Нәтижелер сақталмайды — экранды жаппас бұрын қажетін жазып алыңыз.",
  },
  ru: {
    // student — join
    join_title: "Подключение к тесту",
    join_name_label: "Твоё имя",
    join_name_placeholder: "Напиши имя и фамилию",
    join_code_label: "Код комнаты",
    join_code_placeholder: "Например: A1B2C3",
    join_button: "Подключиться",
    join_pending: "Подключение...",
    err_name: "Напиши своё имя.",
    err_code: "Введи код комнаты.",
    err_not_found: "Такая комната не найдена. Проверь код.",
    err_ended: "Этот урок уже завершён.",
    err_network: "Ошибка связи. Попробуй ещё раз.",
    // student — waiting
    waiting_title: "Ждём учителя...",
    waiting_desc: "Тест откроется, когда учитель его запустит.",
    waiting_you: "Ты подключен",
    // student — quiz
    question_label: "Вопрос",
    check_button: "Проверить",
    next_button: "Дальше",
    finish_button: "Завершить",
    input_placeholder: "Напиши ответ здесь",
    feedback_correct: "Верно! 🎉",
    feedback_wrong: "Неверно",
    correct_answer_label: "Правильный ответ",
    solution_label: "Решение",
    formulas_button: "Формулы",
    score_label: "Баллы",
    streak_label: "Подряд",
    // student — done / ended
    done_title: "Все вопросы пройдены! 🏁",
    done_desc: "Твой результат на экране учителя. Подожди окончания урока.",
    ended_title: "Урок завершён",
    ended_desc: "Учитель завершил тест. Молодец!",
    result_label: "Твой результат",
    close_button: "Закрыть",
    preview_badge: "ПРЕДПРОСМОТР",
    preview_show_answers: "Показать ответы",
    preview_hide_answers: "Скрыть ответы",
    // console — setup
    c_questions: "вопросов",
    c_open_room: "Открыть комнату",
    c_creating: "Открываем...",
    c_err_unauthorized: "Чтобы открыть комнату, войдите в систему.",
    c_err_network: "Не удалось связаться с сервером. Попробуйте ещё раз.",
    // console — question picker
    c_select_hint: "Выберите вопросы, которые войдут в тест",
    c_select_all: "Выбрать все",
    c_deselect_all: "Снять все",
    c_selected: "выбрано",
    c_none_selected: "Выберите хотя бы один вопрос.",
    // console — lobby
    c_room_code: "Код комнаты",
    c_scan_hint: "Ученики сканируют QR-код или вводят код",
    c_students: "Ученики",
    c_waiting_students: "Ждём подключения учеников...",
    c_start: "Начать тест",
    c_back: "Назад",
    c_show_qr: "Увеличить QR",
    c_copy_link: "Скопировать ссылку",
    c_copied: "Скопировано!",
    // console — live
    c_end: "Завершить",
    c_end_confirm: "Завершить тест?",
    c_no_students: "Пока никто не подключился.",
    c_finished_tag: "закончил",
    c_away_tag: "вышел",
    c_answers_label: "отв.",
    c_fullscreen: "Во весь экран",
    // console — results
    c_results_title: "Результаты",
    c_new_session: "Новая сессия",
    c_results_empty: "В этой сессии не было учеников.",
    c_results_note: "Результаты не сохраняются — запишите нужное до закрытия экрана.",
  },
} as const;

export type EngineStringKey = keyof (typeof ENGINE_STRINGS)["kz"];

export function engineT(lang: PackLang) {
  return (key: EngineStringKey): string => ENGINE_STRINGS[lang][key];
}
