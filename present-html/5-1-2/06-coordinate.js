/* Slide 6 — coordinate of a point: definition + drag-M game. */
registerSlide({
  id: "coordinate",
  title: { kz: "Нүктенің координатасы", ru: "Координата точки" },
  html: `
  <div class="slide-head">
    <h2 data-kz="Нүктенің координатасы" data-ru="Координата точки"></h2>
  </div>
  <div class="def"
    data-kz="Координаталық сәуледегі берілген нүктеге сәйкес сан осы нүктенің координатасы деп аталады."
    data-ru="Число, соответствующее данной точке на координатном луче, называется координатой этой точки."></div>
  <div class="ray-frame"><div class="ray-host" id="co-ray" style="--rayh:28vh"></div></div>
  <div class="row" style="align-items:center">
    <div class="readout sun big"><span class="k" data-kz="Жазылуы" data-ru="Запись"></span><span class="v" id="co-mnot">M(5)</span></div>
    <div class="card fill" style="display:flex; align-items:center"><p class="lead" id="co-mread"></p></div>
  </div>
  <div class="row" style="align-items:center">
    <div class="card tight controls">
      <span data-kz="Тапсырма:" data-ru="Задание:"></span>
      <b data-kz="M нүктесін мына санға қой →" data-ru="Поставь точку M на число →"></b>
      <span class="chip" id="co-target">7</span>
      <button class="btn small ok" id="co-check"><span data-kz="Тексеру" data-ru="Проверить"></span></button>
      <button class="btn small" id="co-new"><span data-kz="Жаңа сан" data-ru="Новое число"></span></button>
      <b id="co-verdict"></b>
    </div>
  </div>
  <div class="row">
    <div class="card tight fill"><span class="muted" data-kz="Жазылуы:" data-ru="Запись:"></span> <b>O(0), A(1), B(2), C(3), …</b></div>
    <div class="card tight fill"><span class="muted" data-kz="Оқылуы:" data-ru="Читается:"></span> <b data-kz="«B нүктесінің координатасы 2-ге тең»" data-ru="«координата точки B равна 2»"></b></div>
  </div>`,
  init: function(){
    var target = 7;
    var R = new Ray("co-ray", { min: 0, max: 12, tick: 1, lanes: 1, laneGap: 70, labelFont: 30, padR: 120 });
    ["A", "B", "C"].forEach(function(L, i){ R.dot(i + 1, "var(--brand)", L); });
    R.addMarker({ id: "M", v: 5, lane: 0, color: "var(--sun)", draggable: true, label: "M",
      badge: function(v){ return "M(" + num(v) + ")"; },
      onMove: function(){ document.getElementById("co-verdict").textContent = ""; paint(); } });

    function el(id){ return document.getElementById(id); }
    function paint(){
      var v = R.get("M");
      el("co-mnot").textContent = "M(" + num(v) + ")";
      el("co-mread").textContent = T(
        "«M нүктесінің координатасы " + num(v) + "-ге тең»",
        "«координата точки M равна " + num(v) + "»");
      el("co-target").textContent = target;
    }
    el("co-check").addEventListener("click", function(){
      var ok = R.get("M") === target, v = el("co-verdict");
      v.textContent = ok ? T("✓ Дұрыс!", "✓ Верно!") : T("✗ Тағы көр", "✗ Попробуй ещё");
      v.className = ok ? "ok-txt" : "bad-txt";
    });
    el("co-new").addEventListener("click", function(){
      do { target = Math.floor(Math.random() * 12) + 1; } while (target === R.get("M"));
      el("co-verdict").textContent = "";
      paint();
    });

    function reset(){ R.set("M", 5, true); target = 7; el("co-verdict").textContent = ""; paint(); }
    paint();
    return { reset: reset, onLang: paint };
  }
});
