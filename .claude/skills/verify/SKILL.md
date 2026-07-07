---
name: verify
description: Build, run, and drive geo-explainer end-to-end to verify changes at the surface (Next.js app, GeoGebra lesson/quiz pages)
---

# Verify geo-explainer changes

- Type-check: `npx tsc --noEmit`. If it reports errors in files that look
  already-fixed, delete `tsconfig.tsbuildinfo` (stale incremental cache) and rerun.
- Build: `npm run build` (turbopack).
- Run: `PORT=3100 npm run dev` in background, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/<route>` until 200.
- Drive with Playwright: chromium is cached in `~/Library/Caches/ms-playwright`.
  In the scratchpad: `npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.61.1`,
  then a script using `chromium.launch()` + screenshots as evidence.
  Collect `page.on("pageerror")` and console errors.
- GeoGebra pages (/labs/lesson, quiz pages with figures): engine loads from
  geogebra.org (needs network). Wait for `document.querySelectorAll("canvas").length >= 1`
  plus ~2.5s settle. First load ~10–30s, later applets are fast (script cached).
- Gotcha: GeoGebra "3d" applets mount an algebra sidebar unless hidden via
  `setPerspective("T")` + `setVisible("algebra", false)` (GgbView handles this —
  if a white construction list appears inside a model panel, that logic broke).
- Language toggle: KZ/RU is client state (localStorage `geo-explainer:lang`);
  switching must NOT remount GeoGebra applets on native lesson pages.
