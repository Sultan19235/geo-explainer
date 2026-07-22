/* ============================================================
   core.js — deck runtime: slides, language, navigation, menu,
   resume, zoom, keyboard. See docs/PRESENTATION_HTML_FORMAT.md.
   ============================================================ */
"use strict";

/* ---------- language ---------- */
var LANG = "kz";
var SITE_LANG_KEY = "geo-explainer:lang";

function T(kz, ru){ return LANG === "kz" ? kz : ru; }

/* decimal comma, as written in KZ/RU school notebooks */
function num(x){
  var r = Math.round(x * 100) / 100;
  return (Math.abs(r - Math.round(r)) < 1e-9)
    ? String(Math.round(r))
    : String(r).replace(".", ",");
}
function num1(x){ return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); }
/* coordinates & distances: always whole */
function inum(x){ return String(Math.round(x)); }
/* clock readouts: whole seconds while animating, exact when stopped */
function tnum(t, live){ return live ? String(Math.round(t)) : num(t); }

/* ---------- animation runners (one per slide module) ---------- */
var RUNNERS = [];
function loop(step){
  var raf = null, t0 = null;
  function tick(ts){
    if (t0 === null) t0 = ts;
    var dt = (ts - t0) / 1000; t0 = ts;
    if (step(dt) === false){ raf = null; return; }
    raf = requestAnimationFrame(tick);
  }
  var r = {
    start: function(){ if (raf) return; t0 = null; raf = requestAnimationFrame(tick); },
    stop: function(){ if (raf) cancelAnimationFrame(raf); raf = null; }
  };
  RUNNERS.push(r);
  return r;
}
function stopAllRunners(){ RUNNERS.forEach(function(r){ r.stop(); }); }

/* ---------- deck ---------- */
var Deck = (function(){
  var defs = [];      // registerSlide() definitions, in file order
  var hooks = [];     // per-slide {reset, onLang, onLeave}
  var cur = 0;
  var deckId = "deck";

  function registerSlide(def){ defs.push(def); }

  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* -- language -- */
  function applyLang(){
    $all("[data-kz]").forEach(function(el){
      el.textContent = el.dataset[LANG] || el.dataset.kz;
    });
    $all(".lang-btn").forEach(function(b){
      b.classList.toggle("active", b.dataset.lang === LANG);
    });
    document.documentElement.lang = (LANG === "kz" ? "kk" : "ru");
  }
  function setLang(l, persist){
    if (l !== "kz" && l !== "ru") return;
    LANG = l;
    applyLang();
    buildMenu();
    hooks.forEach(function(h){ if (h && h.onLang) try { h.onLang(); } catch(e){} });
    if (persist !== false){
      try { window.localStorage.setItem(SITE_LANG_KEY, l); } catch(e){}
    }
  }
  function initialLang(){
    var q = new URLSearchParams(window.location.search).get("lang");
    if (q === "kz" || q === "ru") return q;
    try {
      var s = window.localStorage.getItem(SITE_LANG_KEY);
      if (s === "kz" || s === "ru") return s;
    } catch(e){}
    return "kz";
  }

  /* -- navigation -- */
  function slideEls(){ return $all(".slide"); }
  function show(i, keepPen){
    var els = slideEls();
    i = Math.max(0, Math.min(els.length - 1, i));
    if (hooks[cur] && hooks[cur].onLeave) try { hooks[cur].onLeave(); } catch(e){}
    stopAllRunners();
    els.forEach(function(s){ s.classList.remove("active"); });
    els[i].classList.add("active");
    cur = i;
    $("#counter").textContent = (i + 1) + " / " + els.length;
    $("#pbar").style.width = ((i + 1) / els.length * 100) + "%";
    try { history.replaceState(null, "", "#" + (i + 1)); } catch(e){}
    try { window.localStorage.setItem("present:" + deckId + ":pos", String(i)); } catch(e){}
    $all(".menu-item").forEach(function(m, k){ m.classList.toggle("current", k === i); });
    if (!keepPen && window.Pen) window.Pen.clear(false);
  }
  function go(d){ show(cur + d); }
  function resetSlide(){
    if (hooks[cur] && hooks[cur].reset) try { hooks[cur].reset(); } catch(e){}
    if (window.Pen) window.Pen.clear(false);
  }

  /* -- menu -- */
  function buildMenu(){
    var g = $("#menu-grid");
    if (!g) return;
    g.innerHTML = "";
    defs.forEach(function(d, i){
      var b = document.createElement("button");
      b.className = "menu-item" + (i === cur ? " current" : "");
      var n = document.createElement("span");
      n.className = "mi-n"; n.textContent = String(i + 1);
      b.appendChild(n);
      b.appendChild(document.createTextNode(
        (d.title && (d.title[LANG] || d.title.kz)) || ("Слайд " + (i + 1))));
      b.onclick = function(){ show(i); toggleMenu(false); };
      g.appendChild(b);
    });
  }
  function toggleMenu(force){
    var m = $("#menu");
    var open = (force === undefined) ? m.hidden : !!force;
    m.hidden = !open;
  }

  /* -- zoom -- */
  var zoom = 1;
  function applyZoom(){
    document.documentElement.style.setProperty("--zoom", String(zoom));
    try { window.localStorage.setItem("present:zoom", String(zoom)); } catch(e){}
  }
  function bumpZoom(d){
    zoom = Math.round(Math.max(0.8, Math.min(1.4, zoom + d)) * 100) / 100;
    applyZoom();
  }

  /* -- toast -- */
  var toastTimer = null;
  function toast(text, btnText, onBtn){
    var t = $("#toast");
    $("#toast-text").textContent = text;
    var b = $("#toast-action");
    b.textContent = btnText || "";
    b.style.display = btnText ? "" : "none";
    b.onclick = function(){ t.hidden = true; if (onBtn) onBtn(); };
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.hidden = true; }, 8000);
  }

  /* -- fullscreen -- */
  function toggleFS(){
    if (!document.fullscreenElement){
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) document.exitFullscreen();
  }

  /* -- boot -- */
  function boot(meta){
    deckId = (meta && meta.id) || "deck";
    var deck = $("#deck");

    defs.forEach(function(d, i){
      var s = document.createElement("section");
      s.className = "slide";
      s.setAttribute("data-num", String(i + 1));
      s.innerHTML = d.html || "";
      deck.appendChild(s);
    });

    setLang(initialLang(), false);

    defs.forEach(function(d, i){
      var s = slideEls()[i];
      var h = null;
      if (d.init) try { h = d.init(s) || null; } catch(e){ console.error("slide init failed:", d.id, e); }
      hooks[i] = h;
    });

    applyLang(); /* re-apply over anything init() rendered */
    buildMenu();

    /* controls */
    $all("[data-action]").forEach(function(b){
      var a = b.dataset.action;
      b.addEventListener("click", function(){
        if (a === "next") go(1);
        else if (a === "prev") go(-1);
        else if (a === "menu") toggleMenu();
        else if (a === "fullscreen") toggleFS();
        else if (a === "reset"){ resetSlide(); toggleMenu(false); }
        else if (a === "zoom-in") bumpZoom(0.05);
        else if (a === "zoom-out") bumpZoom(-0.05);
        else if (a === "pen" && window.Pen) window.Pen.toggle();
      });
    });
    $all(".lang-btn").forEach(function(b){
      b.addEventListener("click", function(){ setLang(b.dataset.lang); });
    });
    $("#menu").addEventListener("click", function(e){
      if (e.target === $("#menu")) toggleMenu(false);
    });

    /* keyboard — via e.code so it works on any layout */
    document.addEventListener("keydown", function(e){
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      switch (e.code){
        case "ArrowRight": case "PageDown": case "Space": go(1); e.preventDefault(); break;
        case "ArrowLeft": case "PageUp": go(-1); e.preventDefault(); break;
        case "Home": show(0); break;
        case "End": show(slideEls().length - 1); break;
        case "KeyM": toggleMenu(); break;
        case "KeyF": toggleFS(); break;
        case "KeyR": resetSlide(); break;
        case "KeyP": if (window.Pen) window.Pen.toggle(); break;
        case "Escape":
          if (!$("#menu").hidden) toggleMenu(false);
          else if (window.Pen && window.Pen.active()) window.Pen.toggle();
          break;
      }
    });

    /* zoom restore */
    try {
      var z = parseFloat(window.localStorage.getItem("present:zoom"));
      if (z >= 0.8 && z <= 1.4) zoom = z;
    } catch(e){}
    applyZoom();

    if (window.Pen) window.Pen.init(deck);

    /* start position: #hash wins, then saved resume point */
    var start = 0;
    var m = window.location.hash.match(/^#(\d+)$/);
    if (m){
      start = parseInt(m[1], 10) - 1;
    } else {
      var saved = 0;
      try { saved = parseInt(window.localStorage.getItem("present:" + deckId + ":pos") || "0", 10); } catch(e){}
      if (saved > 0 && saved < defs.length){
        start = saved;
        toast(
          T((saved + 1) + "-слайдтан жалғасты", "Продолжено со слайда " + (saved + 1)),
          T("Басынан", "Сначала"),
          function(){ show(0); }
        );
      }
    }
    show(start, true);

    window.addEventListener("hashchange", function(){
      var mm = window.location.hash.match(/^#(\d+)$/);
      if (mm) show(parseInt(mm[1], 10) - 1);
    });
  }

  return { boot: boot, registerSlide: registerSlide, show: show, go: go, toast: toast };
})();

var registerSlide = Deck.registerSlide;
