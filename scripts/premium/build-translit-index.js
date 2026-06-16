#!/usr/bin/env node
"use strict";
// build:translit — BRR-S18 authoritative reverse-transliteration index (рус → иврит).
// Source = the AUTHORITATIVE per-row transliterations already in the baked bodies (works/<id>.json:
// `translit_ru`), word-aligned to `hebrew_plain`. Each translit token is folded to a coarse phonetic
// skeleton (so a learner's typed spelling matches the producer's convention — PARITY: the client's
// `foldCyrLib` in library-ui.js MUST stay byte-identical to foldCyr here) and the top-K Hebrew surface
// forms by frequency are kept. NO guessed map (R1) — only real transliterations of real words. Output
// committed to git (small, immutable-cached, lazy-loaded), NO volume push / token. (v1 = cyrillic only;
// latin/SBL is digraph-mismatched — documented follow-up.)
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const WORKS_DIR = path.join(ROOT, "public/data/benyehuda/works");
const TOPK = 3, MIN_COUNT = 2;

function foldCyr(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[^а-яё]/g, "")
    .replace(/ё/g, "е").replace(/э/g, "е")   // collapse ё/э → е (typed-spelling variance)
    .replace(/[ъь]/g, "")                      // drop hard/soft signs
    .replace(/(.)\1+/g, "$1");                 // collapse doubles
}
function isHeb(s) { return /[א-ת]/.test(String(s || "")); }
function cleanHeb(s) { return String(s || "").replace(/[^א-ת־-]+/g, "").replace(/^[־-]+|[־-]+$/g, ""); }

// buildIndex(rowsList) → { fold: [topK Hebrew surface forms] }. rowsList = [{hebrew_plain, translit_ru}, …]
// (across all works). Pure → unit-tested by smoke:translit.
function buildIndex(rowsList) {
  const map = new Map();
  let pairs = 0, mismatched = 0;
  for (const r of (rowsList || [])) {
    const he = String(r.hebrew_plain || "").trim().split(/\s+/).filter(Boolean);
    const ru = String(r.translit_ru || "").trim().split(/\s+/).filter(Boolean);
    if (he.length && he.length === ru.length) {
      for (let i = 0; i < he.length; i++) {
        const key = foldCyr(ru[i]), heb = cleanHeb(he[i]);
        if (!key || !heb || !isHeb(heb)) continue;
        let m = map.get(key); if (!m) { m = new Map(); map.set(key, m); }
        m.set(heb, (m.get(heb) || 0) + 1); pairs++;
      }
    } else if (he.length && ru.length) mismatched++;
  }
  const out = {};
  for (const [k, m] of map) {
    const ranked = [...m.entries()].filter((e) => e[1] >= MIN_COUNT).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length) out[k] = ranked.slice(0, TOPK).map((e) => e[0]);
  }
  return { cyr: out, pairs: pairs, mismatched: mismatched };
}

function main() {
  const VERSION = (() => { const i = process.argv.indexOf("--version"); return i >= 0 ? Number(process.argv[i + 1]) : 7; })();
  if (!fs.existsSync(WORKS_DIR)) { console.error("no works dir: " + WORKS_DIR); process.exit(1); }
  const files = fs.readdirSync(WORKS_DIR).filter((f) => f.endsWith(".json"));
  const rowsList = [];
  let rows = 0;
  for (const f of files) {
    let bundle; try { bundle = JSON.parse(fs.readFileSync(path.join(WORKS_DIR, f), "utf8")); } catch (_) { continue; }
    const texts = bundle && bundle.library && bundle.library.texts;
    if (!texts || !texts[0] || !Array.isArray(texts[0].rows)) continue;
    for (const r of texts[0].rows) { rows++; rowsList.push({ hebrew_plain: r.hebrew_plain, translit_ru: r.translit_ru }); }
  }
  const built = buildIndex(rowsList);
  const payload = { schema: 1, version: VERSION, cyr: built.cyr };
  const outFile = path.join(ROOT, "public/data/benyehuda/translit-ru-v" + VERSION + ".json");
  fs.writeFileSync(outFile, JSON.stringify(payload));
  const bytes = fs.statSync(outFile).size;
  console.log("build:translit → " + path.relative(ROOT, outFile));
  console.log("  works=" + files.length + " rows=" + rows + " aligned-pairs=" + built.pairs + " mismatched-rows=" + built.mismatched);
  console.log("  cyr-keys=" + Object.keys(built.cyr).length + " · " + (bytes / 1024).toFixed(0) + " KB");
}

if (require.main === module) main();
module.exports = { foldCyr: foldCyr, cleanHeb: cleanHeb, isHeb: isHeb, buildIndex: buildIndex };
