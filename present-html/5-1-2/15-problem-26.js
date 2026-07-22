/* Slide 15 — problem 26: the old money problem, solved backwards
   with a growing bar model. */
registerSlide({
  id: "problem-26",
  title: { kz: "26-есеп · Ертедегі есеп", ru: "Задача 26 · Старинная задача" },
  html: `
  <div class="slide-head">
    <span class="num">26</span>
    <h2 data-kz="Ертедегі орыс есебі" data-ru="Старинная русская задача"></h2>
    <span class="tag violet">C</span>
  </div>
  <div class="problem"
    data-kz="Әкесі балаларына ақша берді. Ол үлкен ұлына барлық ақшасының жартысын және 1 рубль, ортаншы ұлына қалған ақшасының жартысын және 1 рубль, кіші ұлына қалған ақшасының жартысын және қалған 3 рубльді берді. Әкесі балаларына барлығы қанша ақша берді?"
    data-ru="Отец дал денег сыновьям. Старшему — половину всех денег и ещё 1 рубль, среднему — половину остатка и ещё 1 рубль, младшему — половину остатка и оставшиеся 3 рубля. Сколько всего денег отец дал сыновьям?"></div>
  <div class="card">
    <div id="mn-bar" style="display:flex;height:3.2rem;border-radius:10px;overflow:hidden;border:var(--card-border);background:var(--brand-soft)"></div>
    <div id="mn-legend" class="row" style="margin-top:.5rem;font-size:.95rem"></div>
  </div>
  <div class="row" style="flex:1;align-items:stretch">
    <div class="card fill" style="display:flex;align-items:center"><p class="lead" id="mn-text"></p></div>
    <div class="col" style="flex:0 0 13rem;justify-content:center">
      <button class="btn go" id="mn-next"><span data-kz="Келесі қадам →" data-ru="Следующий шаг →"></span></button>
      <button class="btn small" id="mn-reset"><span data-kz="↺ Басынан" data-ru="↺ Сначала"></span></button>
    </div>
  </div>`,
  init: function(){
    var SEG = [
      { w: 16, c: "var(--brand)", kz: "Үлкен ұл: 15 + 1 = 16 руб", ru: "Старший: 15 + 1 = 16 руб" },
      { w: 8, c: "var(--violet)", kz: "Ортаншы ұл: 7 + 1 = 8 руб", ru: "Средний: 7 + 1 = 8 руб" },
      { w: 6, c: "var(--sun)", kz: "Кіші ұл: 3 + 3 = 6 руб", ru: "Младший: 3 + 3 = 6 руб" }
    ];
    var TXTS = [
      ["Есепті кері қарай — соңынан бастап шешеміз.", "Решаем задачу с конца."],
      ["Кіші ұл қалған ақшаның жартысын және қалған 3 рубльді алды. Демек, 3 рубль — сол қалғанның екінші жартысы. Сонда кіші ұлға 3 + 3 = 6 рубль қалған.",
       "Младший получил половину остатка и оставшиеся 3 рубля. Значит, 3 рубля — это вторая половина остатка. Тогда до младшего оставалось 3 + 3 = 6 рублей."],
      ["Ортаншы ұл жартысын және 1 рубльді алды, одан кейін 6 рубль қалды. Демек, оған дейін (6 + 1) · 2 = 14 рубль болған.",
       "Средний получил половину и ещё 1 рубль, после него осталось 6 рублей. Значит, до него было (6 + 1) · 2 = 14 рублей."],
      ["Үлкен ұл жартысын және 1 рубльді алды, одан кейін 14 рубль қалды. Демек, барлығы (14 + 1) · 2 = 30 рубль. Жауабы: 30 рубль.",
       "Старший получил половину и ещё 1 рубль, после него осталось 14 рублей. Значит, всего было (14 + 1) · 2 = 30 рублей. Ответ: 30 рублей."]
    ];
    var step = 0;
    function render(){
      var bar = document.getElementById("mn-bar"), leg = document.getElementById("mn-legend");
      bar.innerHTML = ""; leg.innerHTML = "";
      SEG.forEach(function(s, i){
        var on = i >= 3 - step;
        var d = document.createElement("div");
        d.style.cssText = "flex:0 0 " + (s.w / 30 * 100) + "%;background:" + s.c +
          ";opacity:" + (on ? ".9" : "0") + ";display:flex;align-items:center;justify-content:center;" +
          "color:#fff;font-weight:700;font-size:1.05rem;transition:opacity .35s ease;border-right:2px solid #fff";
        d.textContent = on ? s.w : "";
        bar.appendChild(d);
        if (on){
          var c = document.createElement("span");
          c.className = "chip";
          c.style.borderColor = s.c; c.style.color = s.c; c.style.fontSize = ".95rem";
          c.textContent = LANG === "kz" ? s.kz : s.ru;
          leg.appendChild(c);
        }
      });
      if (step === 3){
        var c = document.createElement("span");
        c.className = "chip hit";
        c.textContent = T("Барлығы: 30 рубль", "Всего: 30 рублей");
        leg.appendChild(c);
      }
      document.getElementById("mn-text").textContent = TXTS[step][LANG === "kz" ? 0 : 1];
      document.getElementById("mn-next").disabled = step === 3;
    }
    document.getElementById("mn-next").addEventListener("click", function(){
      if (step < 3){ step++; render(); }
    });
    document.getElementById("mn-reset").addEventListener("click", function(){ step = 0; render(); });
    render();
    return { reset: function(){ step = 0; render(); }, onLang: render };
  }
});
