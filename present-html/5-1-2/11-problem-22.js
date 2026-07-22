/* Slide 11 — problem 22: balance scale, narrated steps. */
registerSlide({
  id: "problem-22",
  title: { kz: "22-есеп · Табақшалы таразы", ru: "Задача 22 · Чашечные весы" },
  html: `
  <div class="slide-head">
    <span class="num">22</span>
    <h2 data-kz="Кіртассыз бөлу" data-ru="Разделить без гирь"></h2>
    <span class="tag warn">B</span>
  </div>
  <div class="problem"
    data-kz="Табақшалы таразымен кіртастарын пайдаланбай, 12 кг қантты қалайша массалары 9 кг және 3 кг болатындай бөліктерге бөлуге болады?"
    data-ru="Как с помощью чашечных весов без гирь разделить 12 кг сахара на части массой 9 кг и 3 кг?"></div>
  <div class="row" style="flex:1; align-items:stretch">
    <div class="ray-frame fill" style="display:flex;align-items:center"><div class="ray-host" id="bal-host" style="--rayh:40vh"></div></div>
    <div class="col" style="flex:0 0 15rem">
      <div class="card fill" style="display:flex;align-items:center"><p class="lead" id="bal-text"></p></div>
      <button class="btn go" id="bal-next"><span data-kz="Келесі қадам →" data-ru="Следующий шаг →"></span></button>
      <button class="btn small" id="bal-reset"><span data-kz="↺ Басынан" data-ru="↺ Сначала"></span></button>
    </div>
  </div>
  <div class="card green tight hidden" id="bal-answer">
    <div class="calc"><span data-kz="Жауабы:" data-ru="Ответ:"></span> 12 = 6 + 6 → 6 = 3 + 3 → <span class="res">6 + 3 = 9</span> <span class="op" data-kz="және" data-ru="и"></span> <span class="res">3</span></div>
  </div>`,
  init: function(){
    var TXTS = [
      ["Табақшалы таразы бар, бірақ кіртас жоқ. 12 кг қантты қалай бөлеміз?",
       "Есть чашечные весы, но нет гирь. Как разделить 12 кг сахара?"],
      ["1-қадам. Қантты екі табаққа теңелгенше саламыз: 12 = 6 + 6.",
       "Шаг 1. Насыпаем сахар на обе чаши поровну: 12 = 6 + 6."],
      ["2-қадам. 6 кг-ның бірін дәл солай екіге бөлеміз: 6 = 3 + 3.",
       "Шаг 2. Одну из частей по 6 кг делим так же пополам: 6 = 3 + 3."],
      ["3-қадам. 6 кг мен 3 кг-ды қосамыз: 6 + 3 = 9 кг. Қалғаны — 3 кг.",
       "Шаг 3. Складываем 6 кг и 3 кг: 6 + 3 = 9 кг. Осталось — 3 кг."]
    ];
    var step = 0;
    var host = document.getElementById("bal-host");
    function pan(cx, y, txt, col){
      var g = ['<path d="M' + (cx - 62) + " " + y + " L" + (cx + 62) + " " + y + " L" + (cx + 44) + " " + (y + 30) + " L" + (cx - 44) + " " + (y + 30) + ' Z" style="fill:var(--brand-soft); stroke:var(--brand)" stroke-width="4"/>'];
      if (txt) g.push('<rect x="' + (cx - 52) + '" y="' + (y - 54) + '" width="104" height="52" rx="12" style="fill:' + col + '" opacity=".22"/>' +
        '<rect x="' + (cx - 52) + '" y="' + (y - 54) + '" width="104" height="52" rx="12" style="fill:none; stroke:' + col + '" stroke-width="4"/>' +
        '<text x="' + cx + '" y="' + (y - 22) + '" font-size="30" font-weight="700" text-anchor="middle" style="fill:' + col + '">' + txt + "</text>");
      return g.join("");
    }
    function render(){
      var tilt = step === 3 ? 20 : 0;
      var s = '<svg viewBox="0 0 720 372" style="width:100%;height:auto;max-height:var(--rayh,40vh)">';
      s += '<rect x="290" y="330" width="140" height="18" rx="9" style="fill:var(--brand)"/>';
      s += '<path d="M340 180 L380 180 L368 330 L352 330 Z" style="fill:var(--brand)" opacity=".85"/>';
      s += '<line x1="150" y1="' + (170 + tilt) + '" x2="570" y2="' + (170 - tilt) + '" style="stroke:var(--brand)" stroke-width="10" stroke-linecap="round"/>';
      s += '<circle cx="360" cy="170" r="14" style="fill:var(--brand)"/>';
      s += '<line x1="160" y1="' + (170 + tilt) + '" x2="160" y2="' + (232 + tilt) + '" style="stroke:var(--brand)" stroke-width="4"/>';
      s += '<line x1="560" y1="' + (170 - tilt) + '" x2="560" y2="' + (232 - tilt) + '" style="stroke:var(--brand)" stroke-width="4"/>';
      var L = ["", "6 кг", "3 кг", "9 кг"][step], Rr = ["", "6 кг", "3 кг", "3 кг"][step];
      s += pan(160, 232 + tilt, L, "var(--sun)");
      s += pan(560, 232 - tilt, Rr, "var(--green)");
      if (step === 0) s += '<rect x="290" y="60" width="140" height="70" rx="14" style="fill:var(--sun)" opacity=".22"/>' +
        '<rect x="290" y="60" width="140" height="70" rx="14" style="fill:none; stroke:var(--sun)" stroke-width="4"/>' +
        '<text x="360" y="105" font-size="38" font-weight="700" text-anchor="middle" style="fill:var(--sun-deep)">12 кг</text>';
      if (step === 2) s += '<rect x="20" y="290" width="120" height="58" rx="12" style="fill:var(--violet)" opacity=".18"/>' +
        '<rect x="20" y="290" width="120" height="58" rx="12" style="fill:none; stroke:var(--violet)" stroke-width="4"/>' +
        '<text x="80" y="327" font-size="30" font-weight="700" text-anchor="middle" style="fill:var(--violet)">6 кг</text>' +
        '<text x="80" y="278" font-size="22" text-anchor="middle" style="fill:var(--violet)">' + T("шетте", "в стороне") + "</text>";
      s += "</svg>";
      host.innerHTML = s;
      document.getElementById("bal-text").textContent = TXTS[step][LANG === "kz" ? 0 : 1];
      document.getElementById("bal-answer").classList.toggle("hidden", step < 3);
      document.getElementById("bal-next").disabled = step === 3;
    }
    document.getElementById("bal-next").addEventListener("click", function(){
      if (step < 3){ step++; render(); }
    });
    document.getElementById("bal-reset").addEventListener("click", function(){ step = 0; render(); });
    render();
    return { reset: function(){ step = 0; render(); }, onLang: render };
  }
});
