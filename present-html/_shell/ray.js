/* ============================================================
   ray.js — coordinate ray engine (SVG, pointer drag, touch).
   API: new Ray(hostId, opts) → .addMarker .addSpan .band .dot
        .set .get .badge .color .clearExtra .refresh
   Colors are CSS variables so themes restyle the ray freely.
   ============================================================ */
"use strict";

var SVGNS = "http://www.w3.org/2000/svg";
var RAY_UID = 0;

/* element helper: fill/stroke go through style so var(--x) always resolves */
function E(tag, attrs, kids){
  var e = document.createElementNS(SVGNS, tag);
  if (attrs) for (var k in attrs){
    if (attrs[k] === null || attrs[k] === undefined) continue;
    if (k === "fill" || k === "stroke") e.style[k] = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (kids) kids.forEach(function(c){ if (c) e.appendChild(c); });
  return e;
}
function TX(t){ return document.createTextNode(t); }

function Ray(hostId, opt){
  var o = this.o = Object.assign({
    min: 0, max: 10, tick: 1, major: null,
    labelVals: null, labelEvery: 1,
    labelFmt: function(v){ return num(v); }, labelFont: 30,
    subFmt: null, subVals: null, subLabel: "",
    lanes: 1, laneGap: 56,
    W: 1200, padL: 82, padR: 104,
    snap: 1, origin: "O", showOrigin: true, extraBottom: 0
  }, opt || {});
  o.axisY = 26 + o.lanes * o.laneGap;
  o.H = o.axisY + 46 + o.labelFont + (o.subFmt ? 40 : 0) + o.extraBottom;
  this.uid = ++RAY_UID;
  this.host = document.getElementById(hostId);
  this.markers = {}; this.order = []; this.spans = [];
  this.render();
}

Ray.prototype.x = function(v){
  var o = this.o;
  return o.padL + (v - o.min) / (o.max - o.min) * (o.W - o.padL - o.padR);
};
Ray.prototype.vAt = function(px){
  var o = this.o;
  return o.min + (px - o.padL) / (o.W - o.padL - o.padR) * (o.max - o.min);
};

Ray.prototype.render = function(){
  var o = this.o, ax = o.axisY, self = this;
  this.host.innerHTML = "";
  var svg = this.svg = E("svg", { viewBox: "0 0 " + o.W + " " + o.H, xmlns: SVGNS });
  svg.appendChild(E("defs", null, [
    E("marker", { id: "arw" + this.uid, viewBox: "0 0 12 12", refX: 10, refY: 6,
                  markerWidth: 7, markerHeight: 7, orient: "auto" },
      [E("path", { d: "M0,0 L12,6 L0,12 z", fill: "var(--brand)" })])
  ]));

  var gAx = E("g");
  gAx.appendChild(E("line", { x1: o.padL, y1: ax, x2: o.W - o.padR + 62, y2: ax,
    stroke: "var(--brand)", "stroke-width": 5, "marker-end": "url(#arw" + this.uid + ")" }));

  var steps = o.tick > 0 ? Math.round((o.max - o.min) / o.tick) : 0;
  for (var i = 0; o.tick > 0 && i <= steps; i++){
    var v = o.min + i * o.tick, X = this.x(v);
    var maj = o.major ? (Math.abs(v / o.major - Math.round(v / o.major)) < 1e-9) : true;
    var h = maj ? 17 : 10;
    gAx.appendChild(E("line", { x1: X, y1: ax - h, x2: X, y2: ax + h,
      stroke: "var(--brand)", "stroke-width": maj ? 4 : 3, "stroke-linecap": "round" }));
  }

  var lv = o.labelVals;
  if (!lv){ lv = []; for (var j = 0; j <= steps; j += o.labelEvery) lv.push(o.min + j * o.tick); }
  lv.forEach(function(v){
    gAx.appendChild(E("text", { x: self.x(v), y: ax + 30 + o.labelFont * 0.75,
      "font-size": o.labelFont, "text-anchor": "middle", fill: "var(--ink)",
      "font-weight": 500 }, [TX(o.labelFmt(v))]));
  });
  if (o.subFmt){
    (o.subVals || lv).forEach(function(v){
      gAx.appendChild(E("text", { x: self.x(v), y: ax + 34 + o.labelFont * 0.75 + 32,
        "font-size": o.labelFont - 5, "text-anchor": "middle",
        fill: "var(--sun-deep)", "font-weight": 600 }, [TX(o.subFmt(v))]));
    });
    if (o.subLabel) gAx.appendChild(E("text", { x: o.W - o.padR + 66,
      y: ax + 34 + o.labelFont * 0.75 + 32, "font-size": o.labelFont - 6,
      fill: "var(--sun-deep)", "font-weight": 600 }, [TX(o.subLabel)]));
  }
  if (o.showOrigin){
    gAx.appendChild(E("circle", { cx: this.x(o.min), cy: ax, r: 8, fill: "var(--brand)" }));
    /* anchored left of the origin point so it never collides with a band bracket above the axis */
    gAx.appendChild(E("text", { x: this.x(o.min) - 20, y: ax - 18, "font-size": o.labelFont + 4,
      "text-anchor": "end", fill: "var(--brand)", "font-weight": 700,
      "font-style": "italic" }, [TX(o.origin)]));
  }
  svg.appendChild(gAx);
  this.gExtra = E("g"); svg.appendChild(this.gExtra);
  this.gSpan = E("g"); svg.appendChild(this.gSpan);
  this.gMark = E("g"); svg.appendChild(this.gMark);
  this.host.appendChild(svg);
};

/* highlight a piece of the axis, e.g. the unit segment */
Ray.prototype.band = function(from, to, color, label, above){
  var ax = this.o.axisY, c = color || "var(--sun)";
  var g = E("g");
  g.appendChild(E("line", { x1: this.x(from), y1: ax, x2: this.x(to), y2: ax,
    stroke: c, "stroke-width": 11, "stroke-linecap": "round", opacity: 0.85 }));
  if (label){
    var mx = (this.x(from) + this.x(to)) / 2;
    var y1 = above ? ax - 22 : ax + 34, y2 = above ? ax - 32 : ax + 44;
    g.appendChild(E("path", { d: "M " + this.x(from) + " " + y1 + " L " + this.x(from) + " " + y2 +
      " L " + this.x(to) + " " + y2 + " L " + this.x(to) + " " + y1,
      fill: "none", stroke: c, "stroke-width": 3 }));
    g.appendChild(E("text", { x: mx, y: above ? ax - 48 : ax + 72, "font-size": 26,
      "text-anchor": "middle", fill: c, "font-weight": 700 }, [TX(label)]));
  }
  this.gExtra.appendChild(g);
  return g;
};
Ray.prototype.dot = function(v, color, label){
  var ax = this.o.axisY, g = E("g");
  g.appendChild(E("circle", { cx: this.x(v), cy: ax, r: 9, fill: color || "var(--sun)" }));
  if (label) g.appendChild(E("text", { x: this.x(v), y: ax - 20, "font-size": 28,
    "text-anchor": "middle", fill: color || "var(--sun)", "font-weight": 700 }, [TX(label)]));
  this.gExtra.appendChild(g);
  return g;
};
Ray.prototype.clearExtra = function(){ this.gExtra.innerHTML = ""; };

/* ---------- markers ---------- */
Ray.prototype.addMarker = function(cfg){
  var o = this.o, ax = o.axisY;
  var m = Object.assign({
    id: "m" + this.order.length, v: o.min, lane: 0, color: "var(--brand)",
    emoji: "", flip: false, label: "", badge: null, draggable: false, snap: o.snap,
    min: o.min, max: o.max, onMove: null, onClick: null, emojiSize: 46
  }, cfg);
  var yBody = ax - 34 - m.lane * o.laneGap;
  var g = E("g", { "class": "mk" + (m.draggable ? " grab" : "") });

  if (m.draggable) g.appendChild(E("circle", { "class": "mk-halo", cx: 0, cy: ax, r: 27, fill: m.color, opacity: 0.2 }));
  g.appendChild(E("line", { x1: 0, y1: ax, x2: 0, y2: yBody + (m.emoji ? 18 : 14),
    stroke: m.color, "stroke-width": 3, "stroke-dasharray": "7 7", opacity: 0.5 }));
  g.appendChild(E("circle", { cx: 0, cy: ax, r: 11, fill: m.color, stroke: "#fff", "stroke-width": 3 }));
  if (m.draggable){
    g.appendChild(E("path", { d: "M -24 " + (ax - 9) + " l -9 9 l 9 9", fill: "none", stroke: m.color,
      "stroke-width": 4.5, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.85 }));
    g.appendChild(E("path", { d: "M 24 " + (ax - 9) + " l 9 9 l -9 9", fill: "none", stroke: m.color,
      "stroke-width": 4.5, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.85 }));
  }
  if (m.emoji) g.appendChild(E("text", { "class": "emoji", x: 0, y: yBody, "font-size": m.emojiSize,
    "text-anchor": "middle", "dominant-baseline": "central",
    transform: m.flip ? "scale(-1,1)" : null }, [TX(m.emoji)]));

  var yBadge = m.emoji ? yBody - m.emojiSize * 0.62 - 22 : yBody;
  m._rect = E("rect", { x: -40, y: yBadge - 20, width: 80, height: 40, rx: 11,
    fill: "#fff", stroke: m.color, "stroke-width": 3 });
  m._text = E("text", { x: 0, y: yBadge, "font-size": 30, "text-anchor": "middle",
    "dominant-baseline": "central", fill: m.color, "font-weight": 700 });
  g.appendChild(m._rect); g.appendChild(m._text);

  g.appendChild(E("rect", { x: -38, y: yBadge - 26, width: 76,
    height: (ax + 20) - (yBadge - 26), fill: "transparent" }));

  m.g = g; m.yBadge = yBadge;
  this.gMark.appendChild(g);
  this.markers[m.id] = m; this.order.push(m.id);
  if (m.draggable) this._drag(m);
  if (m.onClick) g.addEventListener("click", function(){ m.onClick(m); });
  this.set(m.id, m.v, true);
  return m;
};

Ray.prototype._drag = function(m){
  var self = this, g = m.g, active = false, off = 0;
  function loc(e){
    var p = self.svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(self.svg.getScreenCTM().inverse());
  }
  g.addEventListener("pointerdown", function(e){
    active = true; g.setPointerCapture(e.pointerId); g.classList.add("dragging");
    off = loc(e).x - self.x(m.v); e.preventDefault();
  });
  g.addEventListener("pointermove", function(e){
    if (!active) return;
    var v = self.vAt(loc(e).x - off);
    if (m.snap) v = Math.round(v / m.snap) * m.snap;
    v = Math.max(m.min, Math.min(m.max, v));
    if (Math.abs(v - m.v) > 1e-9) self.set(m.id, v);
  });
  function end(){ active = false; g.classList.remove("dragging"); }
  g.addEventListener("pointerup", end);
  g.addEventListener("pointercancel", end);
};

Ray.prototype.set = function(id, v, silent){
  var m = this.markers[id]; if (!m) return;
  m.v = Math.round(v * 1e6) / 1e6;
  m.g.setAttribute("transform", "translate(" + this.x(m.v) + ",0)");
  this.badge(id);
  if (!silent && m.onMove) m.onMove(m.v, m);
  this.refresh();
};
Ray.prototype.get = function(id){ return this.markers[id].v; };

Ray.prototype.badge = function(id, text){
  var m = this.markers[id];
  var t = (text !== undefined) ? text
        : (m.badge ? m.badge(m.v, m) : (m.label ? m.label + "(" + num(m.v) + ")" : num(m.v)));
  if (t === null || t === ""){ m._rect.style.display = "none"; m._text.style.display = "none"; return; }
  m._rect.style.display = ""; m._text.style.display = "";
  m._text.textContent = t;
  var w = Math.max(62, String(t).length * 17 + 30);
  m._rect.setAttribute("x", -w / 2); m._rect.setAttribute("width", w);
};

Ray.prototype.color = function(id, c){
  var m = this.markers[id]; m.color = c;
  m._rect.style.stroke = c; m._text.style.fill = c;
  m.g.querySelectorAll("circle,line,path").forEach(function(el){
    var f = el.style.fill, s = el.style.stroke;
    if (f && f !== "none" && f !== "transparent" && f !== "rgb(255, 255, 255)" && f !== "#fff") el.style.fill = c;
    if (s && s !== "#fff" && s !== "rgb(255, 255, 255)") el.style.stroke = c;
  });
};

/* ---------- distance span under the axis ---------- */
Ray.prototype.addSpan = function(cfg){
  var s = Object.assign({ a: function(){ return 0; }, b: function(){ return 1; },
    color: "var(--sun)", off: 74, fmt: null }, cfg);
  s.g = E("g");
  s.line = E("line", { stroke: s.color, "stroke-width": 4, "stroke-linecap": "round" });
  s.c1 = E("line", { stroke: s.color, "stroke-width": 4, "stroke-linecap": "round" });
  s.c2 = E("line", { stroke: s.color, "stroke-width": 4, "stroke-linecap": "round" });
  s.rect = E("rect", { rx: 10, fill: "#fff", stroke: s.color, "stroke-width": 3 });
  s.text = E("text", { "font-size": 28, "text-anchor": "middle",
    "dominant-baseline": "central", fill: s.color, "font-weight": 700 });
  [s.line, s.c1, s.c2, s.rect, s.text].forEach(function(e){ s.g.appendChild(e); });
  this.gSpan.appendChild(s.g);
  this.spans.push(s); this.updateSpan(s);
  return s;
};
Ray.prototype.updateSpan = function(s){
  var ax = this.o.axisY, y = ax + s.off;
  var xa = this.x(s.a()), xb = this.x(s.b());
  s.line.setAttribute("x1", xa); s.line.setAttribute("x2", xb);
  s.line.setAttribute("y1", y); s.line.setAttribute("y2", y);
  s.c1.setAttribute("x1", xa); s.c1.setAttribute("x2", xa); s.c1.setAttribute("y1", y - 12); s.c1.setAttribute("y2", y + 12);
  s.c2.setAttribute("x1", xb); s.c2.setAttribute("x2", xb); s.c2.setAttribute("y1", y - 12); s.c2.setAttribute("y2", y + 12);
  var t = s.fmt ? s.fmt() : "";
  s.text.textContent = t;
  var w = Math.max(58, t.length * 16 + 26), mx = (xa + xb) / 2;
  s.rect.setAttribute("x", mx - w / 2); s.rect.setAttribute("y", y - 20);
  s.rect.setAttribute("width", w); s.rect.setAttribute("height", 40);
  s.text.setAttribute("x", mx); s.text.setAttribute("y", y);
  s.g.style.display = (Math.abs(xb - xa) > 4 && t !== "") ? "" : "none";
};
Ray.prototype.refresh = function(){
  var self = this;
  this.spans.forEach(function(s){ self.updateSpan(s); });
  this.order.forEach(function(id){ self.badge(id); });
};
