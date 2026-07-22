/* Slide 4 — tap-to-reveal questions about the picture. */
registerSlide({
  id: "questions",
  title: { kz: "Сурет бойынша сұрақтар", ru: "Вопросы по рисунку" },
  html: `
  <div class="slide-head">
    <h2 data-kz="Сурет бойынша сұрақтарға жауап беріңдер" data-ru="Ответьте на вопросы по рисунку"></h2>
  </div>
  <div class="ray-frame"><div class="ray-host" id="q-ray" style="--rayh:24vh"></div></div>
  <div class="grid3">
    <button class="qcard">
      <span class="q"><b>1)</b> <span data-kz="Штрихтар арасындағы қашықтық қандай ұзындыққа сәйкес?"
        data-ru="Какой длине соответствует расстояние между штрихами?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a" data-kz="2 метрге." data-ru="2 метрам."></span>
    </button>
    <button class="qcard">
      <span class="q"><b>2)</b> <span data-kz="Ит пен мысық арасындағы қашықтық неше метр?"
        data-ru="Каково расстояние между собакой и кошкой?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a">16 − 4 = 12 м</span>
    </button>
    <button class="qcard">
      <span class="q"><b>3)</b> <span data-kz="Қанша уақытта ит мысықты қуып жетеді?"
        data-ru="Через какое время собака догонит кошку?"></span></span>
      <span class="tapme" data-kz="жауабы →" data-ru="ответ →"></span>
      <span class="a">(16 − 4) : (10 − 7) = 4 с</span>
    </button>
  </div>`,
  init: function(root){
    function paint(){
      var r = new Ray("q-ray", { min: 0, max: 20, tick: 2, lanes: 1, laneGap: 82,
        labelVals: [0], labelFmt: function(){ return "O"; }, showOrigin: false,
        extraBottom: 52, padR: 120 });
      r.addMarker({ id: "h", v: 0, lane: 0, emoji: "🏠", color: "var(--muted)",
        badge: function(){ return null; } });
      r.addMarker({ id: "d", v: 4, lane: 0, emoji: "🐕", color: "var(--brand)",
        badge: function(){ return "4 м"; } });
      r.addMarker({ id: "c", v: 16, lane: 0, emoji: "🐈", color: "var(--violet)",
        badge: function(){ return "? м"; } });
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
