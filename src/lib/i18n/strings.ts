export type Lang = "kz" | "ru";

export const STRINGS = {
  kz: {
    // Brand
    brand: "Geo Explainer",

    // Auth
    login_button: "Кіру",
    logout_button: "Шығу",
    signup_button: "Тіркелу",
    email_label: "Электрондық пошта",
    password_label: "Құпиясөз",
    password_confirm_label: "Құпиясөзді қайталаңыз",
    login_title: "Кіру",
    login_description:
      "Аккаунтыңызға кіру үшін электрондық поштаңыз бен құпиясөзіңізді енгізіңіз.",
    signup_title: "Тіркелу",
    signup_description:
      "Жаңа аккаунт жасау үшін электрондық поштаңыз бен құпиясөзіңізді енгізіңіз.",
    login_pending: "Кіруде...",
    signup_pending: "Тіркелуде...",
    have_account: "Аккаунтыңыз бар ма?",
    no_account: "Аккаунтыңыз жоқ па?",

    // Landing
    hero_title:
      "Математика мұғалімдеріне арналған интерактивті геометрия сабақтары",
    hero_subtitle:
      "Динамикалық моделдер, интерактивті есептер және сабаққа дайын материалдар — бір жерде.",
    hero_cta_primary: "Сабақтарды қарау",
    hero_cta_secondary: "Тіркелу",
    how_it_works_title: "Қалай жұмыс істейді",
    how_step_1_title: "Тақырыпты таңдаңыз",
    how_step_1_text:
      "Сыныпқа сай тақырыпты ашыңыз, теория мен формулаларды бір көріністе көріңіз.",
    how_step_2_title: "Есептерді белгілеңіз",
    how_step_2_text:
      "Есептер банкынан бүгінгі сабаққа қажет есептерді таңдап алыңыз.",
    how_step_3_title: "Сабақты өткізіңіз",
    how_step_3_text:
      "Интерактивті моделдермен сабақты түсіндіріп, есептерді бірге шешіңіз.",
    grades_section_title: "Қол жетімді сыныптар",
    grade_badge: (n: number) => `${n}-сынып`,
    footer_copyright: "© 2026 Geo Explainer.",
    footer_contact: "Байланыс: hello@geo-explainer.kz",

    // Dashboard
    dashboard_greeting: "Сәлеметсіз бе",
    dashboard_my_lessons: "Менің сабақтарым",
    dashboard_admin_panel: "Әкімші панелі",

    // Grades catalog
    grades_title: "Сабақтар каталогы",
    grades_subtitle: "Сыныпты таңдаңыз және жарияланған тақырыптарды қараңыз.",
    grades_load_error: "Тақырыптарды жүктеу қатесі",
    grade_topics_count: (n: number) => `${n} жарияланған тақырып`,
    grade_topics_zero: "Тақырып жоқ",

    // Grade detail
    back_to_grades: "← Сыныптар",
    grade_label: (n: number) => `${n}-сынып`,
    grade_topics_subtitle: "Жарияланған тақырыптар тізімі.",
    access_required_banner: "Кіру қажет — әкімшіге хабарласыңыз.",
    no_topics_in_grade: "Бұл сыныпта әзірге жарияланған тақырып жоқ.",
    free_sample_badge: "Тегін үлгі",
    no_description: "Сипаттама қосылмаған.",
    access_required_alert: "Кіру қажет — әкімшіге хабарласыңыз",

    // Topic page
    topic_home_button: "Басты бет",
    theory_badge: "Теория",
    theory_heading_suffix: "— теория және формулалар",
    theory_not_uploaded: "Теория файлы әлі жүктелмеген.",
    bank_button: "Есептер банкы",
    bank_search_placeholder: "Іздеу...",
    bank_close: "Жабу",
    bank_today: "Бүгінгі сабаққа",
    bank_clear_all: "Барлығын алып тастау",
    bank_remove_item: (title: string) => `${title} алып тастау`,
    bank_topic_suffix: "есептері",
    bank_nothing_found: "Ештеңе табылмады.",
    bank_selected_label: "Таңдалған:",
    bank_selected_problems: "есеп",
    bank_use_button: "Осы есептерді пайдалану",
    difficulty_all: "Бәрі",
    difficulty_easy: "Жеңіл",
    difficulty_med: "Орташа",
    difficulty_hard: "Қиын",
    no_tags: "тег жоқ",
    file_missing: "Файл жоқ",
    in_preparation: "Дайындалуда",
    empty_picked_title: "Сабақ есептері таңдалмаған",
    empty_picked_text:
      "Есептер банкын ашыңыз, бүгінгі сабаққа қажет есептерді белгілеңіз.",
    open_bank: "Есептер банкын ашу",
    fullscreen: "Толық экран",
    nav_prev: "Алдыңғы",
    nav_next: "Келесі",
    nav_bank: "Банк",

    // Admin
    admin_section: "Әкімші",
    admin_nav_topics: "Тақырыптар",
    admin_nav_problems: "Есептер",
    admin_nav_teachers: "Мұғалімдер",
    admin_back_home: "← Басты бет",

    // Admin: topics list
    topics_title: "Тақырыптар",
    topics_new: "+ Жаңа тақырып",
    topics_none: "Әзірге тақырып жоқ.",
    topics_table_slug: "Slug",
    topics_table_name: "Атау",
    topics_table_published: "Жарияланған",
    topics_table_free: "Тегін үлгі",
    topics_table_theory: "Теория файлы",
    topics_table_action: "Әрекет",
    edit_action: "Өңдеу",
    error_prefix: "Қате",

    // Admin: topic form
    new_topic_title: "Жаңа тақырып",
    edit_topic_title: "Тақырыпты өңдеу",
    back_to_topics: "← Тақырыптар",
    field_grade: "Сынып",
    field_grade_choose: "Таңдаңыз",
    field_slug: "Slug",
    field_name_kz: "Атау (қаз)",
    field_name_ru: "Атау (орыс)",
    field_description_kz: "Сипаттама (қаз)",
    field_description_ru: "Сипаттама (орыс)",
    field_display_order: "Реттік нөмір",
    field_is_published: "Жарияланған",
    field_is_free_sample: "Тегін үлгі",
    field_theory_file: "Теория HTML файлы",
    current_file: "Қазіргі файл",
    submit_create: "Құру",
    submit_save: "Сақтау",
    submit_saving: "Сақталуда...",
    delete_button: "Жою",
    delete_pending: "Жойылуда...",
    delete_topic_confirm:
      "Осы тақырыпты және оның барлық есептерін жою керек пе? Бұл әрекетті қайтару мүмкін емес.",
    delete_problem_confirm:
      "Осы есепті жою керек пе? Бұл әрекетті қайтару мүмкін емес.",
    delete_error: "Жою кезінде қате.",
    unknown_error: "Белгісіз қате.",

    // Admin: problems list
    problems_title: "Есептер",
    problems_new: "+ Жаңа есеп",
    problems_none: "Әзірге есеп жоқ.",
    problems_filter_label: "Тақырып бойынша сүзгі:",
    problems_filter_all: "Барлығы",
    problems_filter_apply: "Қолдану",
    problems_table_topic: "Тақырып",
    problems_table_number: "№",
    problems_table_title: "Тақырыбы",
    problems_table_difficulty: "Қиындық",
    problems_table_file: "Файл",

    // Admin: problem form
    new_problem_title: "Жаңа есеп",
    edit_problem_title: "Есепті өңдеу",
    back_to_problems: "← Есептер",
    field_topic: "Тақырып",
    field_number: "Нөмір",
    field_title_kz: "Тақырыбы (қаз)",
    field_title_ru: "Тақырыбы (орыс)",
    field_difficulty: "Қиындық",
    field_tags_kz: "Тегтер (қаз) — үтірмен бөліңіз",
    field_tags_ru: "Тегтер (орыс) — үтірмен бөліңіз",
    field_is_ready: "Дайын",
    field_problem_file: "Есеп HTML файлы (қажет болса)",

    // Teachers stub
    teachers_stub: "Кейінірек қосылады",

    // Loading
    loading: "Жүктелуде...",
  },
  ru: {
    // Brand
    brand: "Geo Explainer",

    // Auth
    login_button: "Войти",
    logout_button: "Выйти",
    signup_button: "Регистрация",
    email_label: "Электронная почта",
    password_label: "Пароль",
    password_confirm_label: "Повторите пароль",
    login_title: "Вход",
    login_description:
      "Введите электронную почту и пароль, чтобы войти в аккаунт.",
    signup_title: "Регистрация",
    signup_description:
      "Введите электронную почту и пароль, чтобы создать новый аккаунт.",
    login_pending: "Вход...",
    signup_pending: "Регистрация...",
    have_account: "У вас уже есть аккаунт?",
    no_account: "Нет аккаунта?",

    // Landing
    hero_title:
      "Интерактивные уроки геометрии для учителей математики",
    hero_subtitle:
      "Динамические модели, интерактивные задачи и готовые материалы для урока — в одном месте.",
    hero_cta_primary: "Смотреть уроки",
    hero_cta_secondary: "Регистрация",
    how_it_works_title: "Как это работает",
    how_step_1_title: "Выберите тему",
    how_step_1_text:
      "Откройте тему вашего класса, изучите теорию и формулы в едином виде.",
    how_step_2_title: "Отметьте задачи",
    how_step_2_text:
      "Выберите из банка задач те, что нужны на сегодняшнем уроке.",
    how_step_3_title: "Проведите урок",
    how_step_3_text:
      "Объясняйте материал с интерактивными моделями и разбирайте задачи вместе с учениками.",
    grades_section_title: "Доступные классы",
    grade_badge: (n: number) => `${n} класс`,
    footer_copyright: "© 2026 Geo Explainer.",
    footer_contact: "Контакты: hello@geo-explainer.kz",

    // Dashboard
    dashboard_greeting: "Здравствуйте",
    dashboard_my_lessons: "Мои уроки",
    dashboard_admin_panel: "Панель администратора",

    // Grades catalog
    grades_title: "Каталог уроков",
    grades_subtitle: "Выберите класс и просмотрите опубликованные темы.",
    grades_load_error: "Ошибка загрузки тем",
    grade_topics_count: (n: number) => `${n} опубликованных тем`,
    grade_topics_zero: "Нет тем",

    // Grade detail
    back_to_grades: "← Классы",
    grade_label: (n: number) => `${n} класс`,
    grade_topics_subtitle: "Список опубликованных тем.",
    access_required_banner: "Требуется доступ — обратитесь к администратору.",
    no_topics_in_grade: "В этом классе пока нет опубликованных тем.",
    free_sample_badge: "Бесплатный образец",
    no_description: "Описание не добавлено.",
    access_required_alert: "Требуется доступ — обратитесь к администратору",

    // Topic page
    topic_home_button: "Главная",
    theory_badge: "Теория",
    theory_heading_suffix: "— теория и формулы",
    theory_not_uploaded: "Файл теории ещё не загружен.",
    bank_button: "Банк задач",
    bank_search_placeholder: "Поиск...",
    bank_close: "Закрыть",
    bank_today: "На сегодняшний урок",
    bank_clear_all: "Удалить все",
    bank_remove_item: (title: string) => `Удалить ${title}`,
    bank_topic_suffix: "задачи",
    bank_nothing_found: "Ничего не найдено.",
    bank_selected_label: "Выбрано:",
    bank_selected_problems: "задач",
    bank_use_button: "Использовать выбранные",
    difficulty_all: "Все",
    difficulty_easy: "Лёгкие",
    difficulty_med: "Средние",
    difficulty_hard: "Сложные",
    no_tags: "без тегов",
    file_missing: "Нет файла",
    in_preparation: "В подготовке",
    empty_picked_title: "Задачи урока не выбраны",
    empty_picked_text:
      "Откройте банк задач и отметьте задачи, нужные на сегодняшнем уроке.",
    open_bank: "Открыть банк задач",
    fullscreen: "Полный экран",
    nav_prev: "Назад",
    nav_next: "Далее",
    nav_bank: "Банк",

    // Admin
    admin_section: "Администратор",
    admin_nav_topics: "Темы",
    admin_nav_problems: "Задачи",
    admin_nav_teachers: "Учителя",
    admin_back_home: "← Главная",

    // Admin: topics list
    topics_title: "Темы",
    topics_new: "+ Новая тема",
    topics_none: "Тем пока нет.",
    topics_table_slug: "Slug",
    topics_table_name: "Название",
    topics_table_published: "Опубликовано",
    topics_table_free: "Бесплатный образец",
    topics_table_theory: "Файл теории",
    topics_table_action: "Действие",
    edit_action: "Редактировать",
    error_prefix: "Ошибка",

    // Admin: topic form
    new_topic_title: "Новая тема",
    edit_topic_title: "Редактирование темы",
    back_to_topics: "← Темы",
    field_grade: "Класс",
    field_grade_choose: "Выберите",
    field_slug: "Slug",
    field_name_kz: "Название (каз)",
    field_name_ru: "Название (рус)",
    field_description_kz: "Описание (каз)",
    field_description_ru: "Описание (рус)",
    field_display_order: "Порядковый номер",
    field_is_published: "Опубликовано",
    field_is_free_sample: "Бесплатный образец",
    field_theory_file: "HTML файл теории",
    current_file: "Текущий файл",
    submit_create: "Создать",
    submit_save: "Сохранить",
    submit_saving: "Сохранение...",
    delete_button: "Удалить",
    delete_pending: "Удаление...",
    delete_topic_confirm:
      "Удалить эту тему и все её задачи? Это действие нельзя отменить.",
    delete_problem_confirm:
      "Удалить эту задачу? Это действие нельзя отменить.",
    delete_error: "Ошибка при удалении.",
    unknown_error: "Неизвестная ошибка.",

    // Admin: problems list
    problems_title: "Задачи",
    problems_new: "+ Новая задача",
    problems_none: "Задач пока нет.",
    problems_filter_label: "Фильтр по теме:",
    problems_filter_all: "Все",
    problems_filter_apply: "Применить",
    problems_table_topic: "Тема",
    problems_table_number: "№",
    problems_table_title: "Название",
    problems_table_difficulty: "Сложность",
    problems_table_file: "Файл",

    // Admin: problem form
    new_problem_title: "Новая задача",
    edit_problem_title: "Редактирование задачи",
    back_to_problems: "← Задачи",
    field_topic: "Тема",
    field_number: "Номер",
    field_title_kz: "Название (каз)",
    field_title_ru: "Название (рус)",
    field_difficulty: "Сложность",
    field_tags_kz: "Теги (каз) — через запятую",
    field_tags_ru: "Теги (рус) — через запятую",
    field_is_ready: "Готова",
    field_problem_file: "HTML файл задачи (если нужен)",

    // Teachers stub
    teachers_stub: "Будет добавлено позже",

    // Loading
    loading: "Загрузка...",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["kz"];
