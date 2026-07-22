/* Slide 2 — narrated build-up: how a coordinate ray is drawn.
   The «explain» pattern: every step = one sentence + the picture changes. */
registerSlide({
  id: "theory-build",
  title: { kz: "Сәулені салу", ru: "Построение луча" },
  html: `
  <div class="slide-head">
    <h2 data-kz="Координаталық сәуле қалай салынады?" data-ru="Как строится координатный луч?"></h2>
    <span class="tag warn" data-kz="Қадаммен көрсетеміз" data-ru="Показываем по шагам"></span>
  </div>
  <div class="ray-frame"><div class="ray-host" id="th-ray" style="--rayh:26vh"></div></div>
  <div class="row">
    <div class="card fill" style="min-height:5.2rem; display:flex; align-items:center">
      <p class="lead" id="th-text"></p>
    </div>
    <div class="col" style="justify-content:center">
      <button class="btn go" id="th-next"><span data-kz="Келесі қадам →" data-ru="Следующий шаг →"></span></button>
      <button class="btn small" id="th-reset"><span data-kz="↺ Басынан" data-ru="↺ Сначала"></span></button>
    </div>
  </div>
  <div class="chips" id="th-dots"></div>
  <div class="def hidden" id="th-def"
    data-kz="Сәуленің O басталу нүктесі санақ басы ретінде алынған, бірлік кесіндісі берілген, бағыты белгіленген сәуле координаталық сәуле деп аталады."
    data-ru="Луч, у которого начало O принято за начало отсчёта, задан единичный отрезок и указано направление, называется координатным лучом."></div>`,
  init: function(root){
    var TXTS = [
      ["Бағыты белгіленген сәуле сызамыз.",
       "Проводим луч и указываем его направление."],
      ["Сәуленің басталу нүктесін O деп белгілейміз. Ол — санақ басы. Оның тұсына 0-ді жазамыз.",
       "Начало луча обозначаем точкой O — это начало отсчёта. Под ней пишем 0."],
      ["Санақ басынан бастап бірлік кесінді OA-ны саламыз. A нүктесінің тұсына 1 санын жазамыз.",
       "От начала отсчёта откладываем единичный отрезок OA. Под точкой A пишем число 1."],
      ["Бірлік кесіндіні жалғастыра салып, 2, 3, 4, 5, … сандарын кескіндейміз. Координаталық сәуле дайын!",
       "Продолжая откладывать единичный отрезок, изображаем числа 2, 3, 4, 5, … Координатный луч готов!"],
      ["Енді ережені тұжырымдаймыз:",
       "Теперь сформулируем правило:"]
    ];
    var step = 0;
    function render(){
      var r;
      if (step === 0)
        r = new Ray("th-ray", { min: 0, max: 8, tick: 0, labelVals: [], showOrigin: false, lanes: 1, laneGap: 60, labelFont: 30 });
      else if (step === 1)
        r = new Ray("th-ray", { min: 0, max: 8, tick: 0, labelVals: [0], lanes: 1, laneGap: 60, labelFont: 30 });
      else if (step === 2){
        r = new Ray("th-ray", { min: 0, max: 8, tick: 0, labelVals: [0, 1], lanes: 1, laneGap: 60, labelFont: 30 });
        r.dot(1, "var(--sun)", "A");
        r.band(0, 1, "var(--sun)", T("бірлік кесінді", "единичный отрезок"), true);
      } else {
        r = new Ray("th-ray", { min: 0, max: 8, tick: 1, lanes: 1, laneGap: 60, labelFont: 30 });
        r.band(0, 1, "var(--sun)", T("бірлік кесінді", "единичный отрезок"), true);
        ["A", "B", "C"].forEach(function(L, i){ r.dot(i + 1, "var(--brand)", L); });
      }
      document.getElementById("th-text").textContent = TXTS[step][LANG === "kz" ? 0 : 1];
      document.getElementById("th-next").disabled = step === TXTS.length - 1;
      document.getElementById("th-def").classList.toggle("hidden", step < TXTS.length - 1);
      var d = document.getElementById("th-dots");
      d.innerHTML = "";
      TXTS.forEach(function(_, i){
        var c = document.createElement("span");
        c.className = "chip" + (i <= step ? " hit" : "");
        c.textContent = i + 1;
        d.appendChild(c);
      });
    }
    document.getElementById("th-next").addEventListener("click", function(){
      if (step < TXTS.length - 1){ step++; render(); }
    });
    document.getElementById("th-reset").addEventListener("click", function(){ step = 0; render(); });
    render();
    return {
      reset: function(){ step = 0; render(); },
      onLang: render
    };
  }
});
