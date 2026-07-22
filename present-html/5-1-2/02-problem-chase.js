/* Slide 2 — the chase problem (dog & cat): live simulation with a
   time scrub slider, draggable actors and editable speeds. */
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
  <div class="ray-frame">
    <div class="ray-host" id="ch2-ray" style="--rayh:34vh"></div>
    <div class="slider-row">
      <span class="s-end">0 с</span>
      <input class="tslider" type="range" id="ch2-t" min="0" max="4" step="1" value="0" aria-label="time">
      <span class="s-end" id="ch2-tmax">4 с</span>
    </div>
  </div>
  <div class="row" style="align-items:center">
    <div class="readout brand"><span class="k" data-kz="Ит" data-ru="Собака"></span><span class="v" id="ch2-ro-dog">4 м</span></div>
    <div class="readout violet"><span class="k" data-kz="Мысық" data-ru="Кошка"></span><span class="v" id="ch2-ro-cat">16 м</span></div>
    <div class="readout sun"><span class="k" data-kz="Ара қашықтық" data-ru="Расстояние"></span><span class="v" id="ch2-ro-gap">12 м</span></div>
    <div class="readout green"><span class="k" data-kz="Уақыт" data-ru="Время"></span><span class="v" id="ch2-ro-time">0 с</span></div>
    <span class="fill"></span>
    <button class="btn go" id="ch2-run"><span data-kz="▶ Қуып жету" data-ru="▶ Погоня"></span></button>
    <button class="btn small" id="ch2-reset"><span data-kz="↺ Басына" data-ru="↺ Сначала"></span></button>
  </div>
  <div class="row">
    <div class="card tight controls">
      <span class="muted" data-kz="Ит:" data-ru="Собака:"></span>
      <button class="btn small" id="ch2-dog-minus">−</button>
      <b id="ch2-sp-dog">10 м/с</b>
      <button class="btn small" id="ch2-dog-plus">+</button>
    </div>
    <div class="card tight controls">
      <span class="muted" data-kz="Мысық:" data-ru="Кошка:"></span>
      <button class="btn small" id="ch2-cat-minus">−</button>
      <b id="ch2-sp-cat">7 м/с</b>
      <button class="btn small" id="ch2-cat-plus">+</button>
    </div>
    <div class="card fill" style="display:flex;align-items:center">
      <div class="calc" id="ch2-formula"></div>
    </div>
  </div>`,
  init: function(){
    var D0 = 4, C0 = 16, GAP = 2;
    var vD = D0, vC = C0, sD = 10, sC = 7, t = 0, live = false;

    var R = new Ray("ch2-ray", {
      min: 0, max: 60, tick: 1, major: 5, labelVals: [0, 10, 20, 30, 40, 50, 60],
      lanes: 2, laneGap: 78, snap: 1, labelFont: 27, extraBottom: 44, padR: 120
    });
    R.addMarker({ id: "house", v: 0, lane: 1, emoji: "🏠", color: "var(--muted)",
      badge: function(){ return null; } });
    R.addMarker({ id: "dog", v: D0, lane: 0, emoji: "🐕", flip: true, color: "var(--brand)", draggable: true,
      min: 0, max: 60 - GAP, badge: function(v){ return inum(v) + " м"; },
      onMove: function(v){ vD = v; if (vD > vC - GAP){ vD = vC - GAP; R.set("dog", vD, true); } rescale(); } });
    R.addMarker({ id: "cat", v: C0, lane: 1, emoji: "🐈", flip: true, color: "var(--violet)", draggable: true,
      min: 3, max: 60, badge: function(v){ return inum(v) + " м"; },
      onMove: function(v){ vC = v; if (vC < vD + GAP){ vC = vD + GAP; R.set("cat", vC, true); } rescale(); } });
    R.addSpan({ a: function(){ return R.get("dog"); }, b: function(){ return R.get("cat"); },
      color: "var(--sun)", off: 74,
      fmt: function(){ return inum(R.get("cat") - R.get("dog")) + " м"; } });

    function el(id){ return document.getElementById(id); }
    var slider = function(){ return el("ch2-t"); };
    /* seconds until the dog catches up; if it never does, offer a 6-second demo window */
    function total(){ var ds = sD - sC; return ds > 0 ? (vC - vD) / ds : 6; }

    function apply(){
      var tt = Math.min(t, total());
      R.set("dog", Math.min(60, vD + sD * tt), true);
      R.set("cat", Math.min(60, vC + sC * tt), true);
      sync();
    }
    /* after a drag or speed change: rewind and rebuild the slider range */
    function rescale(){
      t = 0; live = false; runner.stop();
      var tot = total(), s = slider();
      s.max = Math.max(1, Math.ceil(tot)); s.value = 0;
      el("ch2-tmax").textContent = num(tot) + " с";
      apply();
    }
    function sync(){
      var d = R.get("dog"), c = R.get("cat");
      el("ch2-ro-dog").textContent = inum(d) + " м";
      el("ch2-ro-cat").textContent = inum(c) + " м";
      el("ch2-ro-gap").textContent = inum(Math.max(0, c - d)) + " м";
      el("ch2-ro-time").textContent = tnum(t, live) + " с";
      el("ch2-sp-dog").textContent = sD + " м/с";
      el("ch2-sp-cat").textContent = sC + " м/с";
      var g = vC - vD, ds = sD - sC, f = el("ch2-formula");
      if (ds <= 0){
        f.innerHTML = '<span class="bad-txt">' +
          T("Ит мысықты ешқашан қуып жете алмайды!", "Собака никогда не догонит кошку!") + "</span>";
        return;
      }
      f.innerHTML = "(" + num(vC) + '<span class="op">−</span>' + num(vD) + ')<span class="op">:</span>(' +
        sD + '<span class="op">−</span>' + sC + ')<span class="op">=</span>' + num(g) +
        '<span class="op">:</span>' + num(ds) +
        '<span class="op">=</span><span class="res">' + num(g / ds) + " с</span>";
    }
    var runner = loop(function(dt){
      var tot = total();
      t += dt * Math.max(1, tot / 5);
      if (t >= tot){ t = tot; live = false; apply(); slider().value = slider().max; return false; }
      apply(); slider().value = t;
    });

    function reset(){ runner.stop(); live = false; vD = D0; vC = C0; sD = 10; sC = 7; rescale(); }

    slider().addEventListener("input", function(){
      runner.stop(); live = false; t = Math.min(Number(this.value), total()); apply();
    });
    el("ch2-run").addEventListener("click", function(){ t = 0; live = true; slider().value = 0; runner.start(); });
    el("ch2-reset").addEventListener("click", reset);
    el("ch2-dog-minus").addEventListener("click", function(){ sD = Math.max(1, sD - 1); rescale(); });
    el("ch2-dog-plus").addEventListener("click", function(){ sD = Math.min(20, sD + 1); rescale(); });
    el("ch2-cat-minus").addEventListener("click", function(){ sC = Math.max(1, sC - 1); rescale(); });
    el("ch2-cat-plus").addEventListener("click", function(){ sC = Math.min(20, sC + 1); rescale(); });

    rescale();
    return { reset: reset, onLang: sync, onLeave: function(){ runner.stop(); live = false; } };
  }
});
