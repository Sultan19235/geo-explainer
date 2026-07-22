/* Slide 4 — narrated build-up: how a coordinate ray is drawn. */
registerSlide({
  id: "build",
  title: { kz: "Координаталық сәулені салу", ru: "Построение координатного луча" },
  html: `
  <div class="slide-head">
    <h2 data-kz="Координаталық сәуле қалай салынады?" data-ru="Как строится координатный луч?"></h2>
    <span class="tag" data-kz="1.2-сурет" data-ru="рис. 1.2"></span>
  </div>
  <div class="ray-frame"><div class="ray-host" id="bld-ray" style="--rayh:28vh"></div></div>
  <div class="row">
    <div class="card fill" style="min-height:5.4rem; display:flex; align-items:center">
      <p class="lead" id="bld-text"></p>
    </div>
    <div class="col" style="justify-content:center">
      <button class="btn go" id="bld-next"><span data-kz="Келесі қадам →" data-ru="Следующий шаг →"></span></button>
      <button class="btn small" id="bld-reset"><span data-kz="↺ Басынан" data-ru="↺ Сначала"></span></button>
    </div>
  </div>
  <div class="chips" id="bld-dots"></div>`,
  init: function(){
    var TXTS = [
      ["Бағыты белгіленген сәуле сызамыз.",
       "Проводим луч и указываем его направление."],
      ["Сәуленің басталу нүктесін O деп белгілейміз. Ол — санақ басы. Оның тұсына 0-ді жазамыз.",
       "Начало луча обозначаем точкой O — это начало отсчёта. Под ней пишем 0."],
      ["Санақ басынан бастап бірлік кесінді OA-ны саламыз. A нүктесінің тұсына 1 санын жазамыз.",
       "От начала отсчёта откладываем единичный отрезок OA. Под точкой A пишем число 1."],
      ["Бірлік кесіндіні жалғастыра салып, 2, 3, 4, 5, … сандарын кескіндейміз. Координаталық сәуле дайын!",
       "Продолжая откладывать единичный отрезок, изображаем числа 2, 3, 4, 5, … Координатный луч готов!"]
    ];
    var step = 0;
    function render(){
      var r;
      if (step === 0)
        r = new Ray("bld-ray", { min: 0, max: 8, tick: 0, labelVals: [], showOrigin: false, lanes: 1, laneGap: 60, labelFont: 30 });
      else if (step === 1)
        r = new Ray("bld-ray", { min: 0, max: 8, tick: 0, labelVals: [0], lanes: 1, laneGap: 60, labelFont: 30 });
      else if (step === 2){
        r = new Ray("bld-ray", { min: 0, max: 8, tick: 0, labelVals: [0, 1], lanes: 1, laneGap: 60, labelFont: 30 });
        r.dot(1, "var(--sun)", "A");
        r.band(0, 1, "var(--sun)", T("бірлік кесінді", "единичный отрезок"), true);
      } else {
        r = new Ray("bld-ray", { min: 0, max: 8, tick: 1, lanes: 1, laneGap: 60, labelFont: 30 });
        r.band(0, 1, "var(--sun)", T("бірлік кесінді", "единичный отрезок"), true);
        ["A", "B", "C"].forEach(function(L, i){ r.dot(i + 1, "var(--brand)", L); });
      }
      document.getElementById("bld-text").textContent = TXTS[step][LANG === "kz" ? 0 : 1];
      document.getElementById("bld-next").disabled = step === 3;
      var d = document.getElementById("bld-dots");
      d.innerHTML = "";
      TXTS.forEach(function(_, i){
        var c = document.createElement("span");
        c.className = "chip" + (i <= step ? " hit" : "");
        c.textContent = i + 1;
        d.appendChild(c);
      });
    }
    document.getElementById("bld-next").addEventListener("click", function(){
      if (step < 3){ step++; render(); }
    });
    document.getElementById("bld-reset").addEventListener("click", function(){ step = 0; render(); });
    render();
    return { reset: function(){ step = 0; render(); }, onLang: render };
  }
});
