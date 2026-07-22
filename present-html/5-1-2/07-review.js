/* Slide 7 — review questions, tap to reveal. */
registerSlide({
  id: "review",
  title: { kz: "Бекіту сұрақтары", ru: "Вопросы для закрепления" },
  html: `
  <div class="slide-head">
    <h2 data-kz="Сұрақтарға жауап беріңдер" data-ru="Ответьте на вопросы"></h2>
  </div>
  <div class="grid2" style="flex:1; align-content:center">
    <button class="qcard">
      <span class="q"><b>1.</b> <span data-kz="Координаталық сәуле қалай сызылады?"
        data-ru="Как проводится координатный луч?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="Көбінесе горизонталь сызылып, оңға қарай бағытталады: санақ басы O, бірлік кесінді және бағыты болады."
        data-ru="Обычно горизонтально и вправо: есть начало отсчёта O, единичный отрезок и направление."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>2.</b> <span data-kz="Координаталық сәуленің санақ басы ретінде қай нүкте алынады?"
        data-ru="Какая точка принимается за начало отсчёта?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="Сәуленің басталу нүктесі — O нүктесі." data-ru="Начальная точка луча — точка O."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>3.</b> <span data-kz="Бірлік кесінді деген не?" data-ru="Что такое единичный отрезок?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="Ұзындығы «бірлік» ретінде алынған кесінді (OA)."
        data-ru="Отрезок, длина которого принята за «единицу» (OA)."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>4.</b> <span data-kz="Нүктенің координатасы дегеніміз не? Нүкте координатасымен қалай жазылады?"
        data-ru="Что такое координата точки? Как записывают точку с координатой?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="Нүктеге сәйкес сан. Мысалы: A(1), B(2), C(3)."
        data-ru="Число, соответствующее точке. Например: A(1), B(2), C(3)."></span>
    </button>
  </div>`,
  init: function(root){
    var cards = root.querySelectorAll(".qcard");
    cards.forEach(function(c){
      c.addEventListener("click", function(){ c.classList.toggle("open"); });
    });
    return { reset: function(){ cards.forEach(function(c){ c.classList.remove("open"); }); } };
  }
});
