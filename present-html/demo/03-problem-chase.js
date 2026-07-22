/* Slide 3 — motion problem: the dog chases the cat.
   Live simulation: draggable actors, editable speeds, running
   clock, shrinking gap, and a formula that recomputes from the
   current numbers — including the impossible case. */
registerSlide({
  id: "problem-chase",
  title: { kz: "Есеп: ит пен мысық", ru: "Задача: собака и кошка" },
  html: `
  <div class="slide-head">
    <h2 data-kz="Есеп" data-ru="Задача"></h2>
    <span class="tag" data-kz="1.1-сурет" data-ru="рис. 1.1"></span>
  </div>
  <div class="problem"
    data-kz="Ит мысықты көріп, қуа жөнелді. Мысық одан 7 м/с жылдамдықпен қашса, ит оны 10 м/с жылдамдықпен қуды. Қанша уақытта ит мысықты қуып жетеді?"
    data-ru="Собака, увидев кошку, бросилась в погоню. Кошка убегает со скоростью 7 м/с, а собака гонится за ней со скоростью 10 м/с. Через какое время собака догонит кошку?"></div>
  <div class="ray-frame"><div class="ray-host" id="ch-ray" style="--rayh:31vh"></div></div>
  <div class="row" style="align-items:center">
    <div class="readout brand"><span class="k" data-kz="Ит" data-ru="Собака"></span><span class="v" id="ch-ro-dog">4 м</span></div>
    <div class="readout violet"><span class="k" data-kz="Мысық" data-ru="Кошка"></span><span class="v" id="ch-ro-cat">16 м</span></div>
    <div class="readout sun"><span class="k" data-kz="Ара қашықтық" data-ru="Расстояние"></span><span class="v" id="ch-ro-gap">12 м</span></div>
    <div class="readout green"><span class="k" data-kz="Уақыт" data-ru="Время"></span><span class="v" id="ch-ro-time">0,0 с</span></div>
    <span class="fill"></span>
    <button class="btn go" id="ch-run"><span data-kz="▶ Қуып жету" data-ru="▶ Погоня"></span></button>
    <button class="btn small" id="ch-reset"><span data-kz="↺ Басына" data-ru="↺ Сначала"></span></button>
  </div>
  <div class="row">
    <div class="card tight controls">
      <span class="muted" data-kz="Ит:" data-ru="Собака:"></span>
      <button class="btn small" id="ch-dog-minus">−</button>
      <b id="ch-sp-dog">10 м/с</b>
      <button class="btn small" id="ch-dog-plus">+</button>
    </div>
    <div class="card tight controls">
      <span class="muted" data-kz="Мысық:" data-ru="Кошка:"></span>
      <button class="btn small" id="ch-cat-minus">−</button>
      <b id="ch-sp-cat">7 м/с</b>
      <button class="btn small" id="ch-cat-plus">+</button>
    </div>
    <div class="card fill" style="display:flex; align-items:center">
      <div class="calc" id="ch-formula"></div>
    </div>
  </div>`,
  init: function(){
    var D0 = 4, C0 = 16, GAP = 6;
    var vD = D0, vC = C0, sD = 10, sC = 7, t = 0, animD = D0, animC = C0, live = false;

    var R = new Ray("ch-ray", {
      min: 0, max: 60, tick: 2, major: 10, labelVals: [0, 10, 20, 30, 40, 50, 60],
      lanes: 2, laneGap: 84, snap: 2, labelFont: 26, extraBottom: 62, padR: 120
    });
    R.addMarker({ id: "house", v: 0, lane: 1, emoji: "🏠", color: "var(--muted)",
      badge: function(){ return null; } });
    R.addMarker({ id: "dog", v: D0, lane: 0, emoji: "🐕", color: "var(--brand)", draggable: true,
      min: 0, max: 60 - GAP, badge: function(v){ return num(v) + " м"; },
      onMove: function(v){ vD = v; if (vD > vC - GAP){ vD = vC - GAP; R.set("dog", vD, true); } t = 0; sync(); } });
    R.addMarker({ id: "cat", v: C0, lane: 1, emoji: "🐈", color: "var(--violet)", draggable: true,
      min: GAP, max: 60, badge: function(v){ return num(v) + " м"; },
      onMove: function(v){ vC = v; if (vC < vD + GAP){ vC = vD + GAP; R.set("cat", vC, true); } t = 0; sync(); } });
    R.addSpan({ a: function(){ return R.get("dog"); }, b: function(){ return R.get("cat"); },
      color: "var(--sun)", off: 74,
      fmt: function(){ return num(R.get("cat") - R.get("dog")) + " м"; } });

    function el(id){ return document.getElementById(id); }
    function sync(){
      var d = live ? animD : vD, c = live ? animC : vC;
      el("ch-ro-dog").textContent = num(d) + " м";
      el("ch-ro-cat").textContent = num(c) + " м";
      el("ch-ro-gap").textContent = num(Math.max(0, c - d)) + " м";
      el("ch-ro-time").textContent = num1(t) + " с";
      el("ch-sp-dog").textContent = sD + " м/с";
      el("ch-sp-cat").textContent = sC + " м/с";
      var g = vC - vD, ds = sD - sC, f = el("ch-formula");
      if (ds <= 0){
        f.innerHTML = '<span class="bad-txt">' +
          T("Ит мысықты ешқашан қуып жете алмайды!", "Собака никогда не догонит кошку!") + "</span>";
        return;
      }
      f.innerHTML = "(" + num(vC) + '<span class="op">−</span>' + num(vD) + ')<span class="op">:</span>(' +
        sD + '<span class="op">−</span>' + sC + ')<span class="op">=</span>' + num(g) +
        '<span class="op">:</span>' + num(ds) +
        '<span class="op">=</span><span class="res">' + num1(g / ds) + " с</span>";
    }

    var runner = loop(function(dt){
      var ds = sD - sC; if (ds <= 0) return false;
      var total = (vC - vD) / ds, rate = Math.max(1, total / 5);
      t += dt * rate;
      animD = vD + sD * t; animC = vC + sC * t;
      if (animD >= animC || animC > 60){
        t = Math.min(t, total);
        animD = animC = Math.min(60, vD + sD * total);
        R.set("dog", animD, true); R.set("cat", animC, true);
        live = false; sync(); return false;
      }
      R.set("dog", animD, true); R.set("cat", animC, true); sync();
    });

    function reset(){
      runner.stop(); live = false; t = 0; vD = D0; vC = C0; sD = 10; sC = 7;
      R.set("dog", vD, true); R.set("cat", vC, true); sync();
    }

    el("ch-run").addEventListener("click", function(){
      if (sD <= sC){ sync(); return; }
      vD = R.get("dog"); vC = R.get("cat");
      t = 0; live = true; runner.start();
    });
    el("ch-reset").addEventListener("click", reset);
    el("ch-dog-minus").addEventListener("click", function(){ sD = Math.max(1, sD - 1); sync(); });
    el("ch-dog-plus").addEventListener("click", function(){ sD = Math.min(20, sD + 1); sync(); });
    el("ch-cat-minus").addEventListener("click", function(){ sC = Math.max(1, sC - 1); sync(); });
    el("ch-cat-plus").addEventListener("click", function(){ sC = Math.min(20, sC + 1); sync(); });

    sync();
    return { reset: reset, onLang: sync, onLeave: function(){ runner.stop(); live = false; } };
  }
});
