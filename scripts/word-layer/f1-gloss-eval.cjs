#!/usr/bin/env node
"use strict";
// Word-layer Ф1 eval: run the PRODUCTION offline reading (ReaderMorph.resolveCore, the same call the
// colour paint and the tap card's offline path use) + WordGloss.composeGloss over every word of a
// card's vocalized column, report coverage, and dump a seeded sample for manual review.
// Ф2: also loads the shipped Russian form translations (RuForms) and counts glosses that show the
// translation of the FORM («она писала»); --sample N dumps a seeded sample of those for review.
// Usage: node scripts/word-layer/f1-gloss-eval.cjs --xlsx <02_…xlsx> [--evidence <dir outside repo>] [--sample 60]
const fs = require("fs"), path = require("path"), zlib = require("zlib"), os = require("os");
const AdmZip = require("adm-zip");
const ROOT = path.resolve(__dirname, "../..");
global.window = undefined;
const NA = require(path.join(ROOT, "public/js/notes-autogen.js"));
const RM = require(path.join(ROOT, "public/js/reader-morph.js"));
const WG = require(path.join(ROOT, "public/js/word-gloss.js"));
const RF = require(path.join(ROOT, "public/js/ru-forms.js"));
RF.setData(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/ru-forms-v1.json.gz"))).toString("utf8")));
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const XLSX = arg("xlsx"), EVID = arg("evidence", path.join(os.tmpdir(), "word-layer-f1"));
fs.mkdirSync(EVID, { recursive: true });

function sourceLines(file) {
  const zip = new AdmZip(file);
  const wb = zip.readAsText("xl/workbook.xml", "utf8");
  const rels = zip.readAsText("xl/_rels/workbook.xml.rels", "utf8");
  const rid = /<x:sheet name="Исходник" sheetId="\d+" r:id="([^"]+)"/.exec(wb)[1];
  const tgt = new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="' + rid + '"').exec(rels);
  const x = zip.readAsText((tgt[1] || tgt[2]).replace(/^\//, "").replace(/^(?!xl\/)/, "xl/"), "utf8");
  const un = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const out = [];
  for (const m of x.matchAll(/<x:row\b[^>]*>([\s\S]*?)<\/x:row>/g)) {
    const row = {};
    for (const c of m[1].matchAll(/<x:c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/x:c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[1]);
      const v = /<x:(?:v|t)[^>]*>([\s\S]*?)<\/x:(?:v|t)>/.exec(c[2] || "");
      if (ref) row[ref[1]] = v ? un(v[1]) : "";
    }
    if (/^\d+$/.test(row.A || "")) out.push({ n: +row.A, he: row.B || "", niq: row.C || "" });
  }
  return out;
}

(async () => {
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz"))).toString("utf8"));
  const maps = NA.buildResolverMaps(ds.paradigms);
  const pidMap = new Map(); ds.paradigms.forEach((p) => { if (p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p); });
  const lookup = (k, b) => { const i = ds.index[String(k) + " " + String(b || "")]; return i != null ? ds.paradigms[i] : null; };
  const eng = { NA, maps, pidMap, lookup };
  const lines = sourceLines(XLSX);
  console.log("source lines: " + lines.length);
  const C = {}; const inc = (k) => (C[k] = (C[k] || 0) + 1);
  const rows = [];
  for (const l of lines) {
    const toks = RM.tokenize(l.niq).filter((t) => t.isWord);
    for (let w = 0; w < toks.length; w++) {
      const niq = toks[w].text, surface = RM.stripNiqqud(niq);
      if (!surface) continue;
      inc("words");
      const card = RM.enrichReading(eng, await RM.resolveCore(eng, surface, niq), surface, niq);   // == resolveForGloss
      const g = WG.composeGloss(card, niq);
      if (g && g.meaning) inc("gloss"); else inc("no_gloss");
      if (g && g.hint) inc("hint");
      if (g && g.prefix) inc("prefix");
      if (g && g.form) inc("form");
      if (g) inc("label_" + g.label);
      if (card && card.channel && /^(enrich|form-canonical)/.test(card.channel)) inc("ch_" + card.channel);
      rows.push([l.n, w + 1, niq, card ? card.label : "", card ? (card.paradigm ? card.paradigm.lemma : "") : "", g ? g.text : "", g && g.form ? "1" : ""].join("\t"));
    }
  }
  fs.writeFileSync(path.join(EVID, "f1-gloss.tsv"), "line\tw\tniqqud\tlabel\tlemma\tgloss\tform\n" + rows.join("\n") + "\n");
  const N = +arg("sample", 0);
  if (N) {   // seeded (mulberry32) sample of form glosses, unique by (word, gloss)
    let a = +arg("seed", 20261011);
    const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const seen = new Set();
    const pool = rows.map((r) => r.split("\t")).filter((r) => r[6] === "1" && !seen.has(r[2] + r[5]) && seen.add(r[2] + r[5]));
    const pick = [];
    while (pick.length < N && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    fs.writeFileSync(path.join(EVID, "f2-form-sample.md"), "| # | строка | слово | лемма | подпись | вердикт |\n|---|---|---|---|---|---|\n" +
      pick.map((r, i) => `| ${i + 1} | ${r[0]} | ${r[2]} | ${r[4]} | ${r[5]} |  |`).join("\n") + "\n");
  }
  console.log(JSON.stringify(C, null, 1));
  console.log("evidence: " + path.join(EVID, "f1-gloss.tsv"));
})().catch((e) => { console.error(e); process.exit(1); });
