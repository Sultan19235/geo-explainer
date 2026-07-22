/* Slide 16 — problem 27: three rays from Astana, draggable cities.
   Unit segment = 60 km. */
registerSlide({
  id: "problem-27",
  title: { kz: "27-есеп · Қалалар", ru: "Задача 27 · Города" },
  html: `
  <div class="slide-head">
    <span class="num">27</span>
    <h2 data-kz="Астанадан қалаларға дейінгі қашықтық" data-ru="Расстояния от Астаны до городов"></h2>
    <span class="tag violet">C</span>
  </div>
  <div class="problem"
    data-kz="1.8-суретте санақ басы O нүктесі болатын, бірлік кесіндісі 60 км-ге тең координаталық сәулелер кескінделген. Қостанай, Павлодар, Жезқазған қалаларының Астанадан арақашықтықтарын (жуықтап) табыңдар."
    data-ru="На рисунке 1.8 изображены координатные лучи с началом отсчёта O и единичным отрезком 60 км. Найдите (приближённо) расстояния городов Костанай, Павлодар, Жезказган от Астаны."></div>
  <div class="row" style="flex:1;align-items:stretch">
    <div class="ray-frame fill" style="display:flex;align-items:center"><div class="ray-host" id="p27-host" style="--rayh:52vh"></div></div>
    <div class="col" style="flex:0 0 17rem;justify-content:center">
      <div class="readout brand" style="justify-content:space-between"><span class="k">Қостанай</span><span class="v" id="p27-kos">660 км</span></div>
      <div class="readout sun" style="justify-content:space-between"><span class="k">Павлодар</span><span class="v" id="p27-pav">420 км</span></div>
      <div class="readout violet" style="justify-content:space-between"><span class="k">Жезқазған</span><span class="v" id="p27-jez">600 км</span></div>
      <div class="card green tight hidden" id="p27-note" style="font-size:.95rem"></div>
      <button class="btn ok" id="p27-real"><span data-kz="Нақты жауап" data-ru="Точный ответ"></span></button>
      <div class="stat muted" data-kz="1 бірлік кесінді = 60 км" data-ru="1 единичный отрезок = 60 км"></div>
    </div>
  </div>`,
  init: function(){
    var W = 1120, H = 570, cx = 540, cy = 200, ppu = 26, MAXU = 12;
    var CIT = [
      { id: "kos", kz: "Қостанай", ru: "Костанай", ang: 154, v: 11, col: "var(--brand)", out: "p27-kos" },
      { id: "pav", kz: "Павлодар", ru: "Павлодар", ang: 20, v: 7, col: "var(--sun)", out: "p27-pav" },
      { id: "jez", kz: "Жезқазған", ru: "Жезказган", ang: 249, v: 10, col: "var(--violet)", out: "p27-jez" }
    ];
    var host = document.getElementById("p27-host");
    var note = document.getElementById("p27-note");
    var svg;
    function dir(c){ var a = c.ang * Math.PI / 180; return { x: Math.cos(a), y: -Math.sin(a) }; }

    function place(c){
      var d = dir(c);
      c.g.setAttribute("transform", "translate(" + (cx + d.x * c.v * ppu) + "," + (cy + d.y * c.v * ppu) + ")");
      var t = c.v + " " + T("бірлік", "ед.");
      c.txt.textContent = t;
      var w = Math.max(96, t.length * 15 + 28);
      c.rect.setAttribute("x", c.px * 48 - w / 2); c.rect.setAttribute("width", w);
      document.getElementById(c.out).textContent = (c.v * 60) + " км";
    }
    function drag(c){
      var on = false;
      function loc(e){
        var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
        return p.matrixTransform(svg.getScreenCTM().inverse());
      }
      c.g.addEventListener("pointerdown", function(e){
        on = true; c.g.setPointerCapture(e.pointerId); c.g.classList.add("dragging"); e.preventDefault();
      });
      c.g.addEventListener("pointermove", function(e){
        if (!on) return;
        var p = loc(e), d = dir(c);
        var u = ((p.x - cx) * d.x + (p.y - cy) * d.y) / ppu;
        u = Math.max(1, Math.min(MAXU, Math.round(u)));
        if (u !== c.v){ c.v = u; place(c); }
      });
      function end(){ on = false; c.g.classList.remove("dragging"); }
      c.g.addEventListener("pointerup", end);
      c.g.addEventListener("pointercancel", end);
    }
    function build(){
      host.innerHTML = "";
      svg = E("svg", { viewBox: "0 0 " + W + " " + H, xmlns: SVGNS });
      var defs = E("defs");
      CIT.forEach(function(c){
        defs.appendChild(E("marker", { id: "p27a-" + c.id, viewBox: "0 0 12 12", refX: 10, refY: 6,
          markerWidth: 7, markerHeight: 7, orient: "auto" }, [E("path", { d: "M0,0 L12,6 L0,12 z", fill: c.col })]));
      });
      svg.appendChild(defs);
      CIT.forEach(function(c){
        var d = dir(c), L = (MAXU + 0.9) * ppu, g = E("g");
        g.appendChild(E("line", { x1: cx, y1: cy, x2: cx + d.x * L, y2: cy + d.y * L,
          stroke: c.col, "stroke-width": 5, "marker-end": "url(#p27a-" + c.id + ")" }));
        for (var k = 1; k <= MAXU; k++){
          var px = cx + d.x * k * ppu, py = cy + d.y * k * ppu;
          g.appendChild(E("line", { x1: px + d.y * 9, y1: py - d.x * 9, x2: px - d.y * 9, y2: py + d.x * 9,
            stroke: c.col, "stroke-width": 3.5, "stroke-linecap": "round" }));
        }
        var nx = cx + d.x * (MAXU + 2) * ppu, ny = cy + d.y * (MAXU + 2) * ppu;
        g.appendChild(E("text", { x: nx, y: ny, "font-size": 27, "font-weight": 700, fill: c.col,
          "text-anchor": (d.x < -0.3 ? "end" : (d.x > 0.3 ? "start" : "middle")),
          "dominant-baseline": "central" }, [TX(LANG === "kz" ? c.kz : c.ru)]));
        svg.appendChild(g);

        var ax = -d.y, ay = d.x;
        if (ay > 0){ ax = -ax; ay = -ay; } /* perpendicular, always upward */
        c.px = ax; c.py = ay;
        c.g = E("g", { "class": "grab" });
        c.g.appendChild(E("circle", { "class": "mk-halo", cx: 0, cy: 0, r: 23, fill: c.col, opacity: 0.2 }));
        c.g.appendChild(E("line", { x1: 0, y1: 0, x2: ax * 48, y2: ay * 48, stroke: c.col,
          "stroke-width": 2.5, "stroke-dasharray": "5 5", opacity: 0.55 }));
        c.g.appendChild(E("circle", { cx: 0, cy: 0, r: 11, fill: c.col, stroke: "#fff", "stroke-width": 3 }));
        c.rect = E("rect", { y: ay * 48 - 19, height: 38, rx: 11, fill: "#fff", stroke: c.col, "stroke-width": 3 });
        c.txt = E("text", { x: ax * 48, y: ay * 48, "font-size": 26, "text-anchor": "middle",
          "dominant-baseline": "central", fill: c.col, "font-weight": 700 });
        c.g.appendChild(c.rect); c.g.appendChild(c.txt);
        c.g.appendChild(E("rect", { x: ax * 48 - 90, y: ay * 48 - 26, width: 180,
          height: Math.abs(ay * 48) + 52, fill: "transparent" }));
        svg.appendChild(c.g);
        drag(c);
      });
      svg.appendChild(E("circle", { cx: cx, cy: cy, r: 11, fill: "var(--ink)" }));
      svg.appendChild(E("text", { x: cx + 18, y: cy + 34, "font-size": 27, "font-weight": 700,
        fill: "var(--ink)" }, [TX("O · " + T("Астана", "Астана"))]));
      host.appendChild(svg);
      CIT.forEach(place);
      note.textContent = T(
        "Нақты қашықтық (шамамен): Қостанай ≈ 660 км, Павлодар ≈ 420 км, Жезқазған ≈ 600 км.",
        "Реальные расстояния (примерно): Костанай ≈ 660 км, Павлодар ≈ 420 км, Жезказган ≈ 600 км.");
    }
    document.getElementById("p27-real").addEventListener("click", function(){
      CIT[0].v = 11; CIT[1].v = 7; CIT[2].v = 10;
      CIT.forEach(place);
      note.classList.remove("hidden");
    });
    function reset(){
      CIT[0].v = 11; CIT[1].v = 7; CIT[2].v = 10;
      note.classList.add("hidden");
      build();
    }
    build();
    return { reset: reset, onLang: build };
  }
});
