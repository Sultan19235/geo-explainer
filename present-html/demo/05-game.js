/* Slide 5 — class game: drag point M onto the named number. */
registerSlide({
  id: "game-place-m",
  title: { kz: "Ойын: нүктені қой", ru: "Игра: поставь точку" },
  html: `
  <div class="slide-head">
    <h2 data-kz="Нүктені өз орнына қой" data-ru="Поставь точку на её место"></h2>
  </div>
  <div class="ray-frame"><div class="ray-host" id="g-ray" style="--rayh:27vh"></div></div>
  <div class="row" style="align-items:center">
    <div class="readout sun big"><span class="k" data-kz="Жазылуы" data-ru="Запись"></span><span class="v" id="g-mnot">M(5)</span></div>
    <div class="card fill" style="display:flex; align-items:center"><p class="lead" id="g-read"></p></div>
  </div>
  <div class="row" style="align-items:center">
    <div class="card tight controls">
      <b data-kz="M нүктесін мына санға қой →" data-ru="Поставь точку M на число →"></b>
      <span class="chip" id="g-target">7</span>
      <button class="btn small ok" id="g-check"><span data-kz="Тексеру" data-ru="Проверить"></span></button>
      <button class="btn small" id="g-new"><span data-kz="Жаңа сан" data-ru="Новое число"></span></button>
      <b id="g-verdict"></b>
    </div>
  </div>`,
  init: function(){
    var target = 7;
    var R = new Ray("g-ray", { min: 0, max: 12, tick: 1, lanes: 1, laneGap: 70, labelFont: 30, padR: 120 });
    ["A", "B", "C"].forEach(function(L, i){ R.dot(i + 1, "var(--brand)", L); });
    R.addMarker({ id: "M", v: 5, lane: 0, color: "var(--sun)", draggable: true, label: "M",
      badge: function(v){ return "M(" + num(v) + ")"; },
      onMove: function(){ el("g-verdict").textContent = ""; paint(); } });

    function el(id){ return document.getElementById(id); }
    function paint(){
      var v = R.get("M");
      el("g-mnot").textContent = "M(" + num(v) + ")";
      el("g-read").textContent = T(
        "«M нүктесінің координатасы " + num(v) + "-ге тең»",
        "«координата точки M равна " + num(v) + "»");
      el("g-target").textContent = target;
    }
    el("g-check").addEventListener("click", function(){
      var ok = R.get("M") === target, v = el("g-verdict");
      v.textContent = ok ? T("✔ Дұрыс!", "✔ Верно!") : T("✖ Тағы көр", "✖ Попробуй ещё");
      v.className = ok ? "ok-txt" : "bad-txt";
    });
    el("g-new").addEventListener("click", function(){
      do { target = Math.floor(Math.random() * 12) + 1; } while (target === R.get("M"));
      el("g-verdict").textContent = "";
      paint();
    });

    function reset(){ R.set("M", 5, true); target = 7; el("g-verdict").textContent = ""; paint(); }
    paint();
    return { reset: reset, onLang: paint };
  }
});
