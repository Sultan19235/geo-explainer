/* Slide 10 — problem 21: drag C to the midpoint of AB, two variants. */
registerSlide({
  id: "problem-21",
  title: { kz: "21-есеп · Кесіндінің ортасы", ru: "Задача 21 · Середина отрезка" },
  html: `
  <div class="slide-head">
    <span class="num">21</span>
    <h2 data-kz="AB кесіндісінің қақ ортасы" data-ru="Середина отрезка AB"></h2>
    <span class="tag warn">B</span>
  </div>
  <div class="problem"
    data-kz="Бірлік кесіндісі дәптердің 2 торкөзінің ұзындығына тең координаталық сәуле сызыңдар. Координаталық сәуле бойынан: 1) A(4) және B(8); 2) A(3) және B(11) нүктелерін белгілеп, AB кесіндісінің қақ ортасындағы C нүктесін координатасымен жазыңдар."
    data-ru="Начертите координатный луч, у которого единичный отрезок равен длине 2 клеток тетради. Отметьте точки: 1) A(4) и B(8); 2) A(3) и B(11), и запишите точку C — середину отрезка AB — с её координатой."></div>
  <div class="controls">
    <button class="btn primary" id="p21-t1">1) A(4), B(8)</button>
    <button class="btn" id="p21-t2">2) A(3), B(11)</button>
  </div>
  <div class="ray-frame"><div class="ray-host" id="p21-ray" style="--rayh:28vh"></div></div>
  <div class="row" style="align-items:center">
    <div class="readout brand"><span class="k">AC</span><span class="v" id="p21-ac">2</span></div>
    <div class="readout violet"><span class="k">CB</span><span class="v" id="p21-cb">2</span></div>
    <div class="readout sun"><span class="k" data-kz="Жазылуы" data-ru="Запись"></span><span class="v" id="p21-c">C(6)</span></div>
    <button class="btn ok" id="p21-check"><span data-kz="Тексеру" data-ru="Проверить"></span></button>
    <div class="fill stat" id="p21-verdict"></div>
  </div>
  <div class="card tight hidden" id="p21-hint">
    <div class="calc" id="p21-formula"></div>
  </div>`,
  init: function(){
    var SETS = { 1: [4, 8], 2: [3, 11] };
    var cvar = 1;
    var R = new Ray("p21-ray", { min: 0, max: 12, tick: 1, lanes: 2, laneGap: 54, labelFont: 30, padR: 120 });
    R.addMarker({ id: "A", v: 4, lane: 0, color: "var(--brand)", label: "A", badge: function(v){ return "A(" + num(v) + ")"; } });
    R.addMarker({ id: "B", v: 8, lane: 0, color: "var(--brand)", label: "B", badge: function(v){ return "B(" + num(v) + ")"; } });
    R.addMarker({ id: "C", v: 5, lane: 1, color: "var(--sun)", draggable: true, label: "C",
      badge: function(v){ return "C(" + num(v) + ")"; }, onMove: function(){ paint(); } });
    R.addSpan({ a: function(){ return R.get("A"); }, b: function(){ return R.get("C"); },
      color: "var(--brand)", off: 78, fmt: function(){ return num(Math.abs(R.get("C") - R.get("A"))); } });

    function el(id){ return document.getElementById(id); }
    function paint(){
      var a = R.get("A"), b = R.get("B"), c = R.get("C");
      el("p21-ac").textContent = num(Math.abs(c - a));
      el("p21-cb").textContent = num(Math.abs(b - c));
      el("p21-c").textContent = "C(" + num(c) + ")";
      R.color("C", (c - a === b - c) ? "var(--green)" : "var(--sun)");
    }
    function variant(k){
      cvar = k;
      R.set("A", SETS[k][0], true); R.set("B", SETS[k][1], true);
      R.set("C", SETS[k][0] + 1, true);
      el("p21-t1").className = "btn" + (k === 1 ? " primary" : "");
      el("p21-t2").className = "btn" + (k === 2 ? " primary" : "");
      el("p21-hint").classList.add("hidden");
      el("p21-verdict").innerHTML = "";
      paint();
    }
    el("p21-t1").addEventListener("click", function(){ variant(1); });
    el("p21-t2").addEventListener("click", function(){ variant(2); });
    el("p21-check").addEventListener("click", function(){
      var a = R.get("A"), b = R.get("B"), c = R.get("C"), mid = (a + b) / 2;
      var v = el("p21-verdict");
      if (c === mid){
        v.innerHTML = '<span class="ok-txt">' +
          T("✓ Дұрыс! C — AB кесіндісінің қақ ортасы.", "✓ Верно! C — середина отрезка AB.") + "</span>";
        el("p21-hint").classList.remove("hidden");
        el("p21-formula").innerHTML =
          "(" + a + '<span class="op">+</span>' + b + ')<span class="op">:</span>2<span class="op">=</span>' +
          (a + b) + '<span class="op">:</span>2<span class="op">=</span><span class="res">' + num(mid) + "</span>" +
          '<span class="op">&nbsp;→&nbsp;</span><span class="res">C(' + num(mid) + ")</span>";
      } else v.innerHTML = '<span class="bad-txt">' +
        T("AC пен CB тең болуы керек.", "AC и CB должны быть равны.") + "</span>";
    });
    variant(1);
    return { reset: function(){ variant(cvar); }, onLang: paint };
  }
});
