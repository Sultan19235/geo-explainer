/* Slide 8 — problem 19: read the coordinates (tap a point to reveal). */
registerSlide({
  id: "problem-19",
  title: { kz: "19-есеп · Координаталарды оқу", ru: "Задача 19 · Чтение координат" },
  html: `
  <div class="slide-head">
    <span class="num">19</span>
    <h2 data-kz="Нүктелерге қандай сандар сәйкес келеді?" data-ru="Какие числа соответствуют точкам?"></h2>
    <span class="tag ok">A</span>
  </div>
  <div class="problem"
    data-kz="Координаталық сәуледе A, B, C және D нүктелеріне қандай сандар сәйкес келеді (1.4-сурет)? A, B, C және D нүктелерін координаталарымен жазыңдар."
    data-ru="Какие числа соответствуют точкам A, B, C и D на координатном луче (рис. 1.4)? Запишите точки A, B, C и D с их координатами."></div>
  <div class="ray-frame">
    <div class="row" style="align-items:center;gap:.5rem"><b>1)</b><span class="muted" data-kz="бірлік кесінді = 1 штрих" data-ru="единичный отрезок = 1 штрих"></span></div>
    <div class="ray-host" id="p19-ray-a" style="--rayh:20vh"></div>
  </div>
  <div class="ray-frame">
    <div class="row" style="align-items:center;gap:.5rem"><b>2)</b><span class="muted" data-kz="үлкен штрихтар 5-тен саналады" data-ru="крупные штрихи считаются по 5"></span></div>
    <div class="ray-host" id="p19-ray-b" style="--rayh:20vh"></div>
  </div>
  <div class="row" style="align-items:center">
    <button class="btn go" id="p19-show"><span data-kz="Барлық жауапты көрсету" data-ru="Показать все ответы"></span></button>
    <button class="btn small" id="p19-hide"><span data-kz="↺ Жасыру" data-ru="↺ Скрыть"></span></button>
    <div class="card fill tight hidden" id="p19-answer">
      <div class="calc"><b>1)</b> A(3), B(6), C(7), D(10) &nbsp;&nbsp; <b>2)</b> A(5), B(20), C(35), D(50)</div>
    </div>
  </div>`,
  init: function(){
    function mk(ray, id, v, color){
      ray.addMarker({ id: id, v: v, lane: 0, color: color, label: id,
        badge: function(){ return ray.markers[id]._on ? id + "(" + num(v) + ")" : id; },
        onClick: function(m){ m._on = !m._on; ray.badge(id); } });
    }
    var A = new Ray("p19-ray-a", { min: 0, max: 13, tick: 1, labelVals: [0, 1], lanes: 1, laneGap: 56, labelFont: 30, padR: 120 });
    var B = new Ray("p19-ray-b", { min: 0, max: 50, tick: 1, major: 5, labelVals: [0, 5], lanes: 1, laneGap: 56, labelFont: 30, padR: 120 });
    var COLORS = ["var(--brand)", "var(--sun)", "var(--green)", "var(--violet)"];
    [[3, 6, 7, 10], [5, 20, 35, 50]].forEach(function(set, k){
      var ray = k ? B : A;
      ["A", "B", "C", "D"].forEach(function(L, i){ mk(ray, L, set[i], COLORS[i]); });
    });
    function setAll(on){
      [A, B].forEach(function(r){
        r.order.forEach(function(id){ r.markers[id]._on = on; r.badge(id); });
      });
      document.getElementById("p19-answer").classList.toggle("hidden", !on);
    }
    document.getElementById("p19-show").addEventListener("click", function(){ setAll(true); });
    document.getElementById("p19-hide").addEventListener("click", function(){ setAll(false); });
    return { reset: function(){ setAll(false); } };
  }
});
