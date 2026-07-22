# Presentation HTML format (v1)

Classroom presentations are **standalone HTML files** — one file per topic, served
as-is, no React engine involved. They are *authored in pieces* (like the geometry
lessons: one file per problem, theory apart) and *shipped as one file*.

This doc is the contract. Follow it and every topic behaves identically in class:
same keys, same pen, same language sync, same design.

```
present-html/
  _shell/               ← shared shell: NEVER copy into topics, build injects it
    shell.html            page frame: topbar, deck, footbar, menu, toast, pen tools
    base.css              structure (layout, cards, buttons, ray, qcards…)
    theme-dapter.css      «Дәптер» skin — squared paper, red margin, Literata
    theme-takta.css       «Тақта» skin — whiteboard, marker underline, mono digits
    core.js               deck runtime (nav, lang, resume, zoom, menu, keys)
    ray.js                coordinate-ray engine
    pen.js                pen overlay
  build.mjs             ← stitches pieces onto the shell
  <topic>/              ← one folder per topic, e.g. 5-1-2/
    deck.json             {"id","chapter","title":{kz,ru}}
    01-title.js           slide pieces, sorted by filename = slide order
    02-theory.js
    03-problem-19.js
    …
  dist/                 ← built output (gitignored)
```

## Building

```bash
node present-html/build.mjs 5-1-2 --theme dapter          # one theme
node present-html/build.mjs 5-1-2 --theme all             # both themes
node present-html/build.mjs 5-1-2 --theme dapter --slide 03   # single-slide preview
```

Output: `present-html/dist/<deck-id>-<theme>.html` — one self-contained file.
Open it by double-clicking (no server needed), upload it via /admin/presentations.

## Slide piece contract

Each `NN-name.js` file registers exactly one slide:

```js
registerSlide({
  id: "problem-19",                       // unique within the deck
  title: { kz: "19-есеп", ru: "Задача 19" },  // shown in the Мазмұны menu
  html: `…inner HTML of the slide…`,      // static markup, no <section> wrapper
  init: function(root){                   // runs once at load; root = the <section>
    // build rays, wire buttons (addEventListener, not inline onclick)
    return {
      reset:   function(){},   // R key / ↺ button (optional)
      onLang:  function(){},   // re-render JS-generated text (optional)
      onLeave: function(){},   // slide hidden — stop animations (optional)
    };
  }
});
```

Rules that keep files healthy:

- **IDs must be prefixed** per slide (`th-`, `ch-`, `g-`…) — all slides share one document.
- **Bilingual static text** = `<span data-kz="…" data-ru="…"></span>`. core.js fills
  `textContent` on load and on every language switch. Text only — no HTML inside.
- **Bilingual JS-generated text** = build strings with `T(kz, ru)` and re-render in `onLang`.
- **Numbers** through `num()` / `num1()` — decimal comma, as in school notebooks.
- **Animations** through `loop(fn)` — auto-registered, auto-stopped on slide change.
- **No inline `onclick`** — wire in `init` so ids stay local and pieces stay movable.
- **Encoding**: files are UTF-8. If Kazakh letters look broken in the preview, the
  editor saved the file wrong — fix the file, not the browser.

## What the shell gives every deck for free

| Feature | How |
|---|---|
| Navigation | → ← Space PgUp/PgDn Home/End, on-screen arrows, progress bar |
| Мазмұны menu | M key or ☰ — built from piece `title`s; click to jump |
| Resume | last slide saved per deck; reopening offers «Басынан» toast; `#12` in the URL deep-links |
| Language | KZ/RU toggle top-right (mirrors the /labs/lesson header); decks open in the site's language via localStorage `geo-explainer:lang`; `?lang=ru` override |
| Pen | P key or ✏ — tools (red/blue/eraser/undo/clear) appear only while pen is active; clears on slide change |
| Reset | R key, or ↺ inside the Мазмұны overlay; also give interactive slides their own reset button |
| Zoom | A− / A+ group top-right, next to the language toggle (0.8–1.4×), remembered per device |
| Fullscreen | F key or ⛶ |
| Type scaling | whole deck scales with the screen (projector = big automatically) |

Keyboard uses `e.code`, so shortcuts work on any layout (ҚАЗ/РУС/EN).

**Design rules (user decisions 2026-07-22).** Topbar mirrors the /labs/lesson
header: chapter + topic left, then Мазмұны · ⛶ · A−/A+ · KZ/RU on the right —
same corner teachers already know from the lesson player. The Мазмұны overlay
holds slide-reset and the key reference. No instruction text on slides
("press →", "drag this") — the teacher drives, the class sees only content.
Theme: **«Тақта»** (theme-takta.css).

## Ray engine cheatsheet

```js
var R = new Ray("host-id", {
  min:0, max:60, tick:2, major:10,        // ticks every 2, tall tick every 10
  labelVals:[0,10,20],                    // which numbers to print (default: all ticks)
  lanes:2, laneGap:84,                    // vertical lanes for markers
  subFmt: v => num(v*40), subLabel:"м",   // second label row (unit conversion)
  snap:1, padR:120, extraBottom:62,
});
R.band(0, 1, "var(--sun)", "бірлік кесінді", true);   // highlighted segment + brace
R.dot(3, "var(--brand)", "A");                        // small labeled point
R.addMarker({ id:"dog", v:4, lane:0, emoji:"🐕", color:"var(--brand)",
  draggable:true, min:0, max:54, snap:2,
  badge: v => num(v)+" м",              // return null to hide the badge
  onMove: v => {…} });
R.addSpan({ a:()=>R.get("dog"), b:()=>R.get("cat"),   // distance brace under axis
  color:"var(--sun)", fmt:()=> num(R.get("cat")-R.get("dog"))+" м" });
R.set("dog", 12);  R.get("dog");  R.color("dog", "var(--green)");
```

Colors are CSS variables — always pass `var(--brand)`, `var(--sun)`, `var(--violet)`,
`var(--green)`, `var(--red)`, `var(--muted)` so both themes restyle the ray.

## CSS building blocks (from base.css)

- Layout: `.row .col .grid2 .grid3 .fill .slide-head`
- Blocks: `.card` (+`.tight .brand .sun .green`), `.problem`, `.def`, `.ray-frame`
- Controls: `.btn` (+`.primary .go .ok .small`), `.controls`
- Numbers: `.readout` (+color, `.big`), `.calc` (`.op .res .hl`), `.chip` (`.hit .miss`)
- Reveal: `.qcard` (`.q .a .tapme`, toggle class `open`)
- Text: `.eyebrow .lead .muted .ok-txt .bad-txt`, tags `.tag` (+`.warn .ok`)

## New topic checklist

1. Copy an existing topic folder (or start from `demo/`), rename, edit `deck.json`.
2. Author pieces one at a time; preview a single slide with `--slide NN`.
3. `node build.mjs <topic> --theme <chosen>` → open dist file, click through
   **in both languages**, press R on every slide.
4. Upload the dist file via /admin/presentations.
5. Commit the topic folder (source of truth); `dist/` stays out of git.
