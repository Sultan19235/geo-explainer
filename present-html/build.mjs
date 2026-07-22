#!/usr/bin/env node
/* ============================================================
   build.mjs — stitch slide pieces onto the shared shell.

   Usage:
     node build.mjs <topic-folder> [--theme dapter|takta|all] [--slide NN]

   Examples:
     node build.mjs demo --theme all
     node build.mjs 5-1-2 --theme dapter
     node build.mjs 5-1-2 --theme dapter --slide 03   (single-slide preview)

   Output: dist/<deck-id>-<theme>.html  (one self-contained file)
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

const FONTS = {
  dapter: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Literata:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">`,
  takta: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">`,
};

function fail(msg){ console.error("build: " + msg); process.exit(1); }

const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith("--"));
if (!folder) fail("usage: node build.mjs <topic-folder> [--theme dapter|takta|all] [--slide NN]");

function opt(name, dflt){
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const themeArg = opt("theme", "all");
const onlySlide = opt("slide", null);

const topicDir = join(ROOT, folder);
if (!existsSync(topicDir)) fail("no such folder: " + topicDir);

const meta = JSON.parse(readFileSync(join(topicDir, "deck.json"), "utf8"));
const shellDir = join(ROOT, "_shell");
const shell = readFileSync(join(shellDir, "shell.html"), "utf8");
const baseCss = readFileSync(join(shellDir, "base.css"), "utf8");
const coreJs = readFileSync(join(shellDir, "core.js"), "utf8");
const rayJs = readFileSync(join(shellDir, "ray.js"), "utf8");
const penJs = readFileSync(join(shellDir, "pen.js"), "utf8");

let pieceFiles = readdirSync(topicDir)
  .filter(f => f.endsWith(".js"))
  .sort();
if (onlySlide) pieceFiles = pieceFiles.filter(f => f.startsWith(onlySlide));
if (!pieceFiles.length) fail("no slide pieces (*.js) found in " + topicDir);

const pieces = pieceFiles
  .map(f => `<script>\n/* ==== ${f} ==== */\n${readFileSync(join(topicDir, f), "utf8")}\n</script>`)
  .join("\n");

function put(html, key, value){ return html.split("{{" + key + "}}").join(value); }

const themes = themeArg === "all" ? ["dapter", "takta"] : [themeArg];
const outDir = join(ROOT, "dist");
mkdirSync(outDir, { recursive: true });

for (const theme of themes){
  const themePath = join(shellDir, "theme-" + theme + ".css");
  if (!existsSync(themePath)) fail("unknown theme: " + theme);
  let html = shell;
  html = put(html, "DECK_ID", meta.id);
  html = put(html, "CHAPTER", meta.chapter || "");
  html = put(html, "TITLE_KZ", meta.title.kz);
  html = put(html, "TITLE_RU", meta.title.ru || meta.title.kz);
  html = put(html, "FONTS", FONTS[theme] || "");
  html = put(html, "BASE_CSS", baseCss);
  html = put(html, "THEME_CSS", readFileSync(themePath, "utf8"));
  html = put(html, "CORE_JS", coreJs);
  html = put(html, "RAY_JS", rayJs);
  html = put(html, "PEN_JS", penJs);
  html = put(html, "PIECES", pieces);

  const leftovers = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftovers) fail("unreplaced placeholders: " + leftovers.join(", "));

  const out = join(outDir, `${meta.id}-${theme}${onlySlide ? "-slide" + onlySlide : ""}.html`);
  writeFileSync(out, html, "utf8");
  console.log("built", out, "(" + pieceFiles.length + " slides, " + Math.round(html.length / 1024) + " KB)");
}
