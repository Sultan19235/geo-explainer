/* Slide 1 — title */
registerSlide({
  id: "title",
  title: { kz: "Тақырып", ru: "Тема" },
  html: `
  <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:1rem; max-width:58rem">
    <div class="eyebrow" data-kz="Математика · 5-сынып · 1-тарау" data-ru="Математика · 5 класс · Глава 1"></div>
    <h1><span data-kz="Координаталық сәуле" data-ru="Координатный луч"></span></h1>
    <p class="lead muted" data-kz="Натурал сандарды және нөлді координаталық сәуледе кескіндейміз"
       data-ru="Изображаем натуральные числа и нуль на координатном луче"></p>
    <div class="ray-host" id="ttl-ray" style="--rayh:20vh"></div>
    <div class="row">
      <div class="card tight"><b data-kz="① Санақ басы" data-ru="① Начало отсчёта"></b></div>
      <div class="card tight"><b data-kz="② Бірлік кесінді" data-ru="② Единичный отрезок"></b></div>
      <div class="card tight"><b data-kz="③ Бағыт" data-ru="③ Направление"></b></div>
    </div>
  </div>`,
  init: function(){
    function paint(){
      var r = new Ray("ttl-ray", { min: 0, max: 8, tick: 1, lanes: 1, laneGap: 44, labelFont: 28, padR: 120 });
      r.band(0, 1, "var(--sun)", T("бірлік кесінді", "единичный отрезок"), true);
    }
    paint();
    return { onLang: paint, reset: paint };
  }
});
