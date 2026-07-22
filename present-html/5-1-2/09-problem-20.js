/* Slide 9 — problem 20: drag A, B, C, D to their numbers. */
registerSlide({
  id: "problem-20",
  title: { kz: "20-есеп · Нүктелерді белгілеу", ru: "Задача 20 · Отметить точки" },
  html: `
  <div class="slide-head">
    <span class="num">20</span>
    <h2 data-kz="Нүктелерді өз орнына қой" data-ru="Поставь точки на свои места"></h2>
    <span class="tag ok">A</span>
  </div>
  <div class="problem"
    data-kz="Бірлік кесінді ретінде ұзындығы 1 см кесіндіні алып, координаталық сәуле сызыңдар. Оның бойында 2, 6, 8 және 9 сандарын кескіндейтін A, B, C және D нүктелерін белгілеңдер. OA, OB, OC және OD кесінділерінің ұзындықтарын сантиметр есебімен табыңдар."
    data-ru="Приняв за единичный отрезок отрезок длиной 1 см, начертите координатный луч. Отметьте на нём точки A, B, C и D, изображающие числа 2, 6, 8 и 9. Найдите длины отрезков OA, OB, OC и OD в сантиметрах."></div>
  <div class="ray-frame"><div class="ray-host" id="p20-ray" style="--rayh:28vh"></div></div>
  <div class="row" style="align-items:center">
    <div class="card tight"><span class="muted" data-kz="Мақсат:" data-ru="Цель:"></span> <b>A → 2 &nbsp; B → 6 &nbsp; C → 8 &nbsp; D → 9</b></div>
    <button class="btn ok" id="p20-check"><span data-kz="Тексеру" data-ru="Проверить"></span></button>
    <button class="btn small" id="p20-reset"><span data-kz="↺ Қайта" data-ru="↺ Заново"></span></button>
    <div class="fill stat" id="p20-verdict"></div>
  </div>
  <div class="grid2">
    <div class="card tight"><div class="calc" id="p20-len1">OA = ?&nbsp;&nbsp; OB = ?</div></div>
    <div class="card tight"><div class="calc" id="p20-len2">OC = ?&nbsp;&nbsp; OD = ?</div></div>
  </div>`,
  init: function(){
    var START = { A: 1, B: 4, C: 7, D: 10 }, GOAL = { A: 2, B: 6, C: 8, D: 9 };
    var COL = { A: "var(--brand)", B: "var(--sun)", C: "var(--green)", D: "var(--violet)" };
    var R = new Ray("p20-ray", { min: 0, max: 12, tick: 1, lanes: 2, laneGap: 54, labelFont: 30, padR: 120 });
    ["A", "B", "C", "D"].forEach(function(L, i){
      R.addMarker({ id: L, v: START[L], lane: i % 2, color: COL[L],
        draggable: true, label: L, badge: function(v){ return L + "(" + num(v) + ")"; },
        onMove: paint });
    });
    function el(id){ return document.getElementById(id); }
    function paint(){
      el("p20-len1").innerHTML = "OA = " + num(R.get("A")) + " см&nbsp;&nbsp;&nbsp; OB = " + num(R.get("B")) + " см";
      el("p20-len2").innerHTML = "OC = " + num(R.get("C")) + " см&nbsp;&nbsp;&nbsp; OD = " + num(R.get("D")) + " см";
    }
    el("p20-check").addEventListener("click", function(){
      var bad = [];
      ["A", "B", "C", "D"].forEach(function(L){
        if (R.get(L) !== GOAL[L]) bad.push(L);
        R.color(L, R.get(L) === GOAL[L] ? "var(--green)" : "var(--red)");
      });
      var v = el("p20-verdict");
      if (!bad.length) v.innerHTML = '<span class="ok-txt">' +
        T("✓ Барлығы дұрыс! OA = 2 см, OB = 6 см, OC = 8 см, OD = 9 см",
          "✓ Всё верно! OA = 2 см, OB = 6 см, OC = 8 см, OD = 9 см") + "</span>";
      else v.innerHTML = '<span class="bad-txt">' + T("Тексер: ", "Проверь: ") + bad.join(", ") + "</span>";
    });
    function reset(){
      ["A", "B", "C", "D"].forEach(function(L){ R.set(L, START[L], true); R.color(L, COL[L]); });
      el("p20-verdict").innerHTML = "";
      paint();
    }
    el("p20-reset").addEventListener("click", reset);
    paint();
    return { reset: reset, onLang: function(){ paint(); el("p20-verdict").innerHTML = ""; } };
  }
});
