/* Slide 5 — the definition. */
registerSlide({
  id: "definition",
  title: { kz: "Анықтама", ru: "Определение" },
  html: `
  <div class="slide-head"><h2 data-kz="Анықтама" data-ru="Определение"></h2></div>
  <div class="def"
    data-kz="Сәуленің O басталу нүктесі санақ басы ретінде алынған, бірлік кесіндісі берілген, бағыты белгіленген сәуле координаталық сәуле деп аталады."
    data-ru="Луч, у которого начало O принято за начало отсчёта, задан единичный отрезок и указано направление, называется координатным лучом."></div>
  <div class="grid3">
    <div class="card brand">
      <h3 data-kz="① Санақ басы" data-ru="① Начало отсчёта"></h3>
      <p class="muted" data-kz="Сәуленің басталу нүктесі — O. Оның тұсына 0 жазылады."
         data-ru="Начальная точка луча — O. Под ней пишут 0."></p>
    </div>
    <div class="card sun">
      <h3 data-kz="② Бірлік кесінді" data-ru="② Единичный отрезок"></h3>
      <p class="muted" data-kz="Ұзындығы «бірлік» ретінде алынған OA кесіндісі."
         data-ru="Отрезок OA, длина которого принята за «единицу»."></p>
    </div>
    <div class="card">
      <h3 data-kz="③ Бағыты" data-ru="③ Направление"></h3>
      <p class="muted" data-kz="Көбінесе горизонталь сызылып, оңға қарай бағытталады."
         data-ru="Обычно проводят горизонтально и направляют вправо."></p>
    </div>
  </div>
  <div class="ray-frame"><div class="ray-host" id="def-ray" style="--rayh:19vh"></div></div>
  <div class="grid2">
    <div class="card tight" data-kz="Координаталық сәулені «сан сәулесі» деп те атайды."
         data-ru="Координатный луч называют также «числовым лучом»."></div>
    <div class="card tight" data-kz="Координаталық сәуле шектеусіз — оны шексіз жалғастыруға болады."
         data-ru="Координатный луч бесконечен — его можно продолжать без конца."></div>
  </div>`,
  init: function(){
    function paint(){
      var r = new Ray("def-ray", { min: 0, max: 7, tick: 1, lanes: 1, laneGap: 58, labelFont: 30, padR: 120 });
      r.band(0, 1, "var(--sun)", T("бірлік кесінді", "единичный отрезок"), true);
    }
    paint();
    return { onLang: paint, reset: paint };
  }
});
