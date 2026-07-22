/* ============================================================
   pen.js — classroom pen overlay: red/blue pen, eraser, undo,
   clear. P key or the ✏ button toggles. Strokes are stored in
   normalized coordinates and cleared on slide change.
   ============================================================ */
"use strict";

var Pen = (function(){
  var canvas, ctx, deck;
  var on = false;
  var color = "red";
  var strokes = [];       // {mode:'draw'|'erase', color, size, pts:[{x,y}]}
  var current = null;

  var COLORS = { red: "#c73325", blue: "#2b50e0" };

  function css(){ return canvas.getBoundingClientRect(); }

  function resize(){
    var r = css(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    redraw();
  }

  function drawStroke(s){
    if (s.pts.length < 2) return;
    var w = canvas.width, h = canvas.height;
    ctx.globalCompositeOperation = (s.mode === "erase") ? "destination-out" : "source-over";
    ctx.strokeStyle = COLORS[s.color] || s.color || "#c73325";
    ctx.lineWidth = s.size * w;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.pts[0].x * w, s.pts[0].y * h);
    for (var i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * w, s.pts[i].y * h);
    ctx.stroke();
  }
  function redraw(){
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(drawStroke);
  }

  function norm(e){
    var r = css();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function down(e){
    if (!on) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    current = {
      mode: color === "eraser" ? "erase" : "draw",
      color: color,
      size: color === "eraser" ? 0.035 : 0.0038,
      pts: [norm(e)]
    };
  }
  function move(e){
    if (!on || !current) return;
    current.pts.push(norm(e));
    /* incremental draw of just the last segment */
    var w = canvas.width, h = canvas.height;
    var a = current.pts[current.pts.length - 2], b = current.pts[current.pts.length - 1];
    ctx.globalCompositeOperation = (current.mode === "erase") ? "destination-out" : "source-over";
    ctx.strokeStyle = COLORS[current.color] || "#c73325";
    ctx.lineWidth = current.size * w;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
  function up(){
    if (current && current.pts.length > 1) strokes.push(current);
    current = null;
  }

  function setTool(t){
    if (t === "undo"){ strokes.pop(); redraw(); return; }
    if (t === "clear"){ strokes = []; redraw(); return; }
    color = t;
    document.querySelectorAll(".pen-tool").forEach(function(b){
      b.classList.toggle("active", b.dataset.pen === t);
    });
  }

  function toggle(){
    on = !on;
    document.body.classList.toggle("pen-on", on);
    document.getElementById("pen-tools").hidden = !on;
    var btn = document.querySelector('[data-action="pen"]');
    if (btn) btn.classList.toggle("active", on);
    if (on) setTool(color === "eraser" ? "red" : color);
  }

  function clear(){
    strokes = []; current = null;
    if (ctx) redraw();
  }

  function init(deckEl){
    deck = deckEl;
    canvas = document.getElementById("pen-canvas");
    ctx = canvas.getContext("2d");
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    document.querySelectorAll(".pen-tool").forEach(function(b){
      b.addEventListener("click", function(){ setTool(b.dataset.pen); });
    });
    window.addEventListener("resize", resize);
    resize();
  }

  return { init: init, toggle: toggle, clear: clear, active: function(){ return on; } };
})();

window.Pen = Pen;
