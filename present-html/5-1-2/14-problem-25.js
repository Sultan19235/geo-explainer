/* Slide 14 — problem 25: the grasshopper's parabolic hops. */
registerSlide({
  id: "problem-25",
  title: { kz: "25-есеп · Шегіртке", ru: "Задача 25 · Кузнечик" },
  html: `
  <div class="slide-head">
    <span class="num">25</span>
    <h2 data-kz="Шегірткенің секіруі" data-ru="Прыжки кузнечика"></h2>
    <span class="tag violet">C</span>
  </div>
  <div class="problem"
    data-kz="Шегіртке координаталық сәуле бойымен A(3) нүктесінен солға қарай 2 бірлік кесіндіге секірген соң, оңға қарай 5 бірлік кесіндіге секіреді. Шегіртке осылайша қозғалысты жалғастырады. Шегіртке координатасы 2, 4, 5, 7, 9 және 12 нүктелерінің қайсысында болады?"
    data-ru="По координатному лучу кузнечик из точки A(3) прыгает на 2 единичных отрезка влево, затем на 5 единичных отрезков вправо, и так продолжает. В каких из точек с координатами 2, 4, 5, 7, 9 и 12 побывает кузнечик?"></div>
  <div class="ray-frame"><div class="ray-host" id="p25-ray" style="--rayh:28vh"></div></div>
  <div class="row" style="align-items:center">
    <button class="btn go" id="p25-one"><span data-kz="Бір секіру" data-ru="Один прыжок"></span></button>
    <button class="btn primary" id="p25-auto"><span data-kz="▶ Барлығын секірт" data-ru="▶ Все прыжки"></span></button>
    <button class="btn small" id="p25-reset"><span data-kz="↺ Басына" data-ru="↺ Сначала"></span></button>
    <div class="readout sun"><span class="k" data-kz="Қазір" data-ru="Сейчас"></span><span class="v" id="p25-now">3</span></div>
    <span class="fill"></span>
    <div class="chips" id="p25-chips"></div>
  </div>
  <div class="card green tight hidden" id="p25-answer">
    <p class="lead"><b data-kz="Жауабы:" data-ru="Ответ:"></b>
      <span data-kz="Шегіртке 4, 7, 9 және 12 нүктелерінде болады. 2 мен 5 нүктелеріне ешқашан түспейді."
            data-ru="Кузнечик побывает в точках 4, 7, 9 и 12. В точки 2 и 5 он никогда не попадёт."></span></p>
    <p class="muted" style="margin-top:.3rem"
      data-kz="Себебі: жол — 3, 1, 6, 4, 9, 7, 12, 10, … Әр екі секіруден кейін 3-ке жылжиды. Сондықтан 3-ке бөлгенде қалдығы 2 болатын сандарға (2, 5, 8, 11, …) түспейді."
      data-ru="Почему: путь — 3, 1, 6, 4, 9, 7, 12, 10, … Каждые два прыжка дают сдвиг на 3. Поэтому числа, дающие при делении на 3 остаток 2 (2, 5, 8, 11, …), недостижимы."></p>
  </div>`,
  init: function(){
    /* parabolic hop animation for one marker */
    function hop(ray, id, to, ms){
      return new Promise(function(res){
        var m = ray.markers[id], from = m.v, t0 = performance.now();
        function st(ts){
          var k = Math.min(1, (ts - t0) / ms), v = from + (to - from) * k;
          m.g.setAttribute("transform", "translate(" + ray.x(v) + "," + (-Math.sin(Math.PI * k) * 60) + ")");
          ray.badge(id, inum(v));
          if (k < 1) requestAnimationFrame(st);
          else { ray.set(id, to, true); res(); }
        }
        requestAnimationFrame(st);
      });
    }
    var TARGETS = [2, 4, 5, 7, 9, 12];
    var v = 3, i = 0, busy = false, visited = new Set([3]);
    var R = new Ray("p25-ray", { min: 0, max: 20, tick: 1, lanes: 1, laneGap: 86, labelFont: 25, padR: 120 });
    R.addMarker({ id: "g", v: 3, lane: 0, emoji: "🦗", color: "var(--green)",
      badge: function(x){ return inum(x); } });
    R.dot(3, "var(--green)");

    function paint(){
      document.getElementById("p25-now").textContent = inum(v);
      var box = document.getElementById("p25-chips");
      box.innerHTML = "";
      TARGETS.forEach(function(n){
        var c = document.createElement("span");
        c.className = "chip" + (visited.has(n) ? " hit" : "");
        c.textContent = n;
        box.appendChild(c);
      });
    }
    function one(){
      var nv = v + (i % 2 === 0 ? -2 : 5);
      if (nv > 20 || nv < 0) return Promise.resolve(false);
      return hop(R, "g", nv, 380).then(function(){
        v = nv; i++; visited.add(v); R.dot(v, "var(--green)"); paint();
        return true;
      });
    }
    function reveal(){
      var box = document.getElementById("p25-chips");
      box.innerHTML = "";
      TARGETS.forEach(function(n){
        var c = document.createElement("span");
        c.className = "chip " + (visited.has(n) ? "hit" : "miss");
        c.textContent = n;
        box.appendChild(c);
      });
      document.getElementById("p25-answer").classList.remove("hidden");
    }
    document.getElementById("p25-one").addEventListener("click", function(){
      if (busy) return;
      busy = true;
      one().then(function(){ busy = false; });
    });
    document.getElementById("p25-auto").addEventListener("click", function(){
      if (busy) return;
      busy = true;
      var k = 0;
      (function next(){
        if (k++ >= 14){ reveal(); busy = false; return; }
        one().then(function(ok){ if (ok) next(); else { reveal(); busy = false; } });
      })();
    });
    function reset(){
      busy = false; v = 3; i = 0; visited = new Set([3]);
      R.clearExtra(); R.dot(3, "var(--green)"); R.set("g", 3, true);
      document.getElementById("p25-answer").classList.add("hidden");
      paint();
    }
    document.getElementById("p25-reset").addEventListener("click", reset);
    paint();
    return { reset: reset, onLang: paint };
  }
});
