/* Slide 3 — six questions about figure 1.1, tap to reveal. */
registerSlide({
  id: "questions-6",
  title: { kz: "1.1-сурет бойынша сұрақтар", ru: "Вопросы по рис. 1.1" },
  html: `
  <div class="slide-head">
    <h2 data-kz="1.1-сурет бойынша сұрақтарға жауап беріңдер" data-ru="Ответьте на вопросы по рисунку 1.1"></h2>
  </div>
  <div class="ray-frame"><div class="ray-host" id="q6-ray" style="--rayh:30vh"></div></div>
  <div class="grid3">
    <button class="qcard">
      <span class="q"><b>1)</b> <span data-kz="Солдан оңға қарай бағытталған сәуле нені көрсетеді?"
        data-ru="Что показывает луч, направленный слева направо?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="Қозғалыс бағытын көрсетеді." data-ru="Направление движения."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>2)</b> <span data-kz="Штрихтар арасындағы қашықтық қандай ұзындыққа сәйкес?"
        data-ru="Какой длине соответствует расстояние между штрихами?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="2 метрге." data-ru="2 метрам."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>3)</b> <span data-kz="Мысық үйден (O нүктесінен) неше метр қашықтықта отырды?"
        data-ru="На каком расстоянии от дома (точки O) сидела кошка?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="16 метр (8 штрих × 2 м)." data-ru="16 метров (8 штрихов × 2 м)."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>4)</b> <span data-kz="Санақ басы қай нүктеге сәйкес?"
        data-ru="Какой точке соответствует начало отсчёта?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="O нүктесіне — үйге." data-ru="Точке O — дому."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>5)</b> <span data-kz="Ит пен мысық арасындағы қашықтық неше метр?"
        data-ru="Каково расстояние между собакой и кошкой?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a">16 − 4 = 12 м</span>
    </button>
    <button class="qcard">
      <span class="q"><b>6)</b> <span data-kz="Қанша уақытта ит мысықты қуып жетеді?"
        data-ru="Через какое время собака догонит кошку?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a">(16 − 4) : (10 − 7) = 4 с</span>
    </button>
  </div>`,
  init: function(root){
    function paint(){
      var r = new Ray("q6-ray", { min: 0, max: 20, tick: 2, lanes: 1, laneGap: 82,
        labelVals: [0], labelFmt: function(){ return "O"; }, showOrigin: false,
        extraBottom: 52, padR: 120 });
      r.addMarker({ id: "h", v: 0, lane: 0, emoji: "🏠", color: "var(--muted)",
        badge: function(){ return null; } });
      r.addMarker({ id: "d", v: 4, lane: 0, emoji: "🐕", flip: true, color: "var(--brand)",
        badge: function(){ return "4 м"; } });
      r.addMarker({ id: "c", v: 16, lane: 0, emoji: "🐈", flip: true, color: "var(--violet)",
        badge: function(){ return "? (м)"; } });
      r.addSpan({ a: function(){ return 0; }, b: function(){ return 4; },
        color: "var(--sun)", off: 62, fmt: function(){ return "4 м"; } });
    }
    var cards = root.querySelectorAll(".qcard");
    cards.forEach(function(c){
      c.addEventListener("click", function(){ c.classList.toggle("open"); });
    });
    paint();
    return {
      reset: function(){ cards.forEach(function(c){ c.classList.remove("open"); }); paint(); },
      onLang: paint
    };
  }
});
