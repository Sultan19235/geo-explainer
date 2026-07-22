/* Slide 13 — problem 24: boy and dog run towards each other.
   Unit segment = 30 m. */
registerSlide({
  id: "problem-24",
  title: { kz: "24-есеп · Бала мен ит", ru: "Задача 24 · Мальчик и собака" },
  html: `
  <div class="slide-head">
    <span class="num">24</span>
    <h2 data-kz="Бір-біріне қарсы жүгіру" data-ru="Движение навстречу друг другу"></h2>
    <span class="tag violet">C</span>
  </div>
  <div class="problem"
    data-kz="1.6-суреттегі баланың және оның итінің тұрған орындарына сәйкес нүктелердің координаталарын табыңдар. 1) Егер бірлік кесінді 30 м-ге тең болса, олар неше метр қашықтықтан бір-біріне қарсы жүгіріп келеді? 2) Бала мен ит неше секундтан соң кездеседі?"
    data-ru="Найдите координаты точек, где стоят мальчик и его собака (рис. 1.6). 1) Если единичный отрезок равен 30 м, с какого расстояния они бегут навстречу друг другу? 2) Через сколько секунд мальчик и собака встретятся?"></div>
  <div class="ray-frame"><div class="ray-host" id="p24-ray" style="--rayh:29vh"></div></div>
  <div class="row" style="align-items:center">
    <div class="readout brand"><span class="k" data-kz="Бала" data-ru="Мальчик"></span><span class="v" id="p24-boy">3</span></div>
    <div class="readout violet"><span class="k" data-kz="Ит" data-ru="Собака"></span><span class="v" id="p24-dog">11</span></div>
    <div class="readout sun"><span class="k" data-kz="Ара қашықтық" data-ru="Расстояние"></span><span class="v" id="p24-gap">240 м</span></div>
    <div class="readout green"><span class="k" data-kz="Уақыт" data-ru="Время"></span><span class="v" id="p24-t">0 с</span></div>
    <span class="fill"></span>
    <button class="btn go" id="p24-run"><span data-kz="▶ Жүгіру" data-ru="▶ Бежать"></span></button>
    <button class="btn small" id="p24-reset"><span data-kz="↺ Басына" data-ru="↺ Сначала"></span></button>
  </div>
  <div class="card tight"><div class="calc" id="p24-formula"></div></div>`,
  init: function(){
    var B0 = 3, D0 = 11;
    var vB = B0, vD = D0, t = 0, live = false;
    var R = new Ray("p24-ray", { min: 0, max: 14, tick: 1, lanes: 1, laneGap: 84, labelFont: 25,
      subFmt: function(v){ return num(v * 30); }, subVals: [0, 2, 4, 6, 8, 10, 12, 14],
      subLabel: "м", extraBottom: 60, padR: 130 });
    R.addMarker({ id: "boy", v: B0, lane: 0, emoji: "🏃", flip: true, color: "var(--brand)", draggable: true, min: 0, max: 13,
      badge: function(v){ return inum(v); },
      onMove: function(v){ vB = v; if (vB > vD - 1){ vB = vD - 1; R.set("boy", vB, true); } t = 0; live = false; paint(); } });
    R.addMarker({ id: "dog", v: D0, lane: 0, emoji: "🐕", color: "var(--violet)", draggable: true, min: 1, max: 14,
      badge: function(v){ return inum(v); },
      onMove: function(v){ vD = v; if (vD < vB + 1){ vD = vB + 1; R.set("dog", vD, true); } t = 0; live = false; paint(); } });
    R.addSpan({ a: function(){ return R.get("boy"); }, b: function(){ return R.get("dog"); },
      color: "var(--sun)", off: 112,
      fmt: function(){ return inum((R.get("dog") - R.get("boy")) * 30) + " м"; } });

    function el(id){ return document.getElementById(id); }
    function paint(){
      el("p24-boy").textContent = inum(R.get("boy"));
      el("p24-dog").textContent = inum(R.get("dog"));
      el("p24-gap").textContent = inum((R.get("dog") - R.get("boy")) * 30) + " м";
      el("p24-t").textContent = tnum(t, live) + " с";
      var dist = (vD - vB) * 30;
      el("p24-formula").innerHTML =
        T("Бала 3 м/с →", "Мальчик 3 м/с →") + '<span class="op">&nbsp;&nbsp;</span>' + T("← Ит 5 м/с", "← Собака 5 м/с") +
        '<span class="op">&nbsp;&nbsp;|&nbsp;&nbsp;</span>(' + num(vD) + '<span class="op">−</span>' + num(vB) +
        ')<span class="op">×</span>30<span class="op">=</span><span class="hl">' + num(dist) + " м</span>" +
        '<span class="op">&nbsp;&nbsp;|&nbsp;&nbsp;</span>' + num(dist) + '<span class="op">:</span>(3<span class="op">+</span>5)' +
        '<span class="op">=</span><span class="res">' + num(dist / 8) + " с</span>";
    }
    var runner = loop(function(dt){
      var dist = (vD - vB) * 30, total = dist / 8;
      t += dt * Math.max(1, total / 5);
      if (t >= total){
        t = total; live = false;
        var meet = vB + 3 * total / 30;
        R.set("boy", meet, true); R.set("dog", meet, true); paint(); return false;
      }
      R.set("boy", vB + 3 * t / 30, true); R.set("dog", vD - 5 * t / 30, true); paint();
    });
    function reset(){ runner.stop(); live = false; t = 0; vB = B0; vD = D0; R.set("boy", vB, true); R.set("dog", vD, true); paint(); }
    el("p24-run").addEventListener("click", function(){ t = 0; live = true; R.set("boy", vB, true); R.set("dog", vD, true); runner.start(); });
    el("p24-reset").addEventListener("click", reset);
    paint();
    return { reset: reset, onLang: paint, onLeave: function(){ runner.stop(); live = false; } };
  }
});
