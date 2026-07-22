/* Slide 12 — problem 23: Aldarköse walks to Shygaibai's house.
   Unit segment = 40 m (second label row shows meters). */
registerSlide({
  id: "problem-23",
  title: { kz: "23-есеп · Алдаркөсе", ru: "Задача 23 · Алдар-Косе" },
  html: `
  <div class="slide-head">
    <span class="num">23</span>
    <h2 data-kz="Алдаркөсе Шығайбайдың үйіне бара жатыр" data-ru="Алдар-Косе идёт к дому Шыгайбая"></h2>
    <span class="tag warn">B</span>
  </div>
  <div class="problem"
    data-kz="Алдаркөсе 80 м/мин жылдамдықпен Шығайбайдың үйіне келе жатыр (1.5-сурет). Координаталық сәуледе Шығайбайдың үйі A нүктесімен кескінделген. Мұндағы бірлік кесінді 40 метрге сәйкес. 1) A нүктесінің координатасын табыңдар; 2) Алдаркөсе үйге неше минутта жетеді?"
    data-ru="Алдар-Косе идёт к дому Шыгайбая со скоростью 80 м/мин (рис. 1.5). На координатном луче дом Шыгайбая изображён точкой A. Единичный отрезок соответствует 40 метрам. 1) Найдите координату точки A; 2) За сколько минут Алдар-Косе дойдёт до дома?"></div>
  <div class="ray-frame"><div class="ray-host" id="p23-ray" style="--rayh:30vh"></div></div>
  <div class="row" style="align-items:center">
    <div class="readout sun big"><span class="k" data-kz="Үйдің координатасы" data-ru="Координата дома"></span><span class="v" id="p23-a">A(8)</span></div>
    <div class="readout brand"><span class="k" data-kz="Қашықтық" data-ru="Расстояние"></span><span class="v" id="p23-d">320 м</span></div>
    <div class="readout green"><span class="k" data-kz="Уақыт" data-ru="Время"></span><span class="v" id="p23-t">0 мин</span></div>
    <span class="fill"></span>
    <button class="btn go" id="p23-run"><span data-kz="▶ Жүру" data-ru="▶ Идти"></span></button>
    <button class="btn small" id="p23-reset"><span data-kz="↺ Басына" data-ru="↺ Сначала"></span></button>
  </div>
  <div class="card tight"><div class="calc" id="p23-formula"></div></div>`,
  init: function(){
    var t = 0, live = false;
    var R = new Ray("p23-ray", { min: 0, max: 10, tick: 1, lanes: 1, laneGap: 84, labelFont: 28,
      subFmt: function(v){ return num(v * 40); }, subLabel: "м", padR: 130 });
    R.addMarker({ id: "ald", v: 0, lane: 0, emoji: "🐎", flip: true, color: "var(--brand)",
      badge: function(){ return null; } });
    R.addMarker({ id: "A", v: 8, lane: 0, emoji: "⛺", color: "var(--sun)", draggable: true, min: 1, max: 10,
      badge: function(v){ return "A(" + inum(v) + ")"; },
      onMove: function(){ t = 0; live = false; R.set("ald", 0, true); paint(); } });

    function el(id){ return document.getElementById(id); }
    function paint(){
      var a = R.get("A"), d = a * 40, tt = d / 80;
      el("p23-a").textContent = "A(" + inum(a) + ")";
      el("p23-d").textContent = inum(d) + " м";
      el("p23-t").textContent = tnum(t, live) + " " + T("мин", "мин");
      el("p23-formula").innerHTML =
        num(a) + '<span class="op">×</span>40<span class="op">=</span><span class="hl">' + num(d) + " м</span>" +
        '<span class="op">&nbsp;&nbsp;|&nbsp;&nbsp;</span>' + num(d) + '<span class="op">:</span>80<span class="op">=</span>' +
        '<span class="res">' + num(tt) + " " + T("мин", "мин") + "</span>";
    }
    var runner = loop(function(dt){
      var a = R.get("A"), total = a / 2;
      t += dt * (total / 4);
      if (t >= total){ t = total; live = false; R.set("ald", a, true); paint(); return false; }
      R.set("ald", 2 * t, true); paint();
    });
    function reset(){ runner.stop(); live = false; t = 0; R.set("A", 8, true); R.set("ald", 0, true); paint(); }
    el("p23-run").addEventListener("click", function(){ t = 0; live = true; R.set("ald", 0, true); runner.start(); });
    el("p23-reset").addEventListener("click", reset);
    paint();
    return { reset: reset, onLang: paint, onLeave: function(){ runner.stop(); live = false; } };
  }
});
