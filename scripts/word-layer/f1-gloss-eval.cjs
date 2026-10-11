#!/usr/bin/env node
"use strict";
// Word-layer Ф1 eval: run the PRODUCTION offline reading (ReaderMorph.resolveCore, the same call the
// colour paint and the tap card's offline path use) + WordGloss.composeGloss over every word of a
// card's vocalized column, report coverage, and dump a seeded sample for manual review.
// Usage: node scripts/word-layer/f1-gloss-eval.cjs --xlsx <02_…xlsx> [--evidence <dir outside repo>]
const fs = require("fs"), path = require("path"), zlib = require("zlib"), os = require("os");
const AdmZip = require("adm-zip");
const ROOT = path.resolve(__dirname, "../..");
global.window = undefined;
const NA = require(path.join(ROOT, "public/js/notes-autogen.js"));
const RM = require(path.join(ROOT, "public/js/reader-morph.js"));
const WG = require(path.join(ROOT, "public/js/word-gloss.js"));
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
      const card = await RM.resolveCore(eng, surface, niq);
      const g = WG.composeGloss(card, niq);
      if (g && g.meaning) inc("gloss"); else inc("no_gloss");
      if (g && g.hint) inc("hint");
      if (g && g.prefix) inc("prefix");
      if (g) inc("label_" + g.label);
      rows.push([l.n, w + 1, niq, card ? card.label : "", card ? (card.paradigm ? card.paradigm.lemma : "") : "", g ? g.text : ""].join("\t"));
    }
  }
  fs.writeFileSync(path.join(EVID, "f1-gloss.tsv"), "line\tw\tniqqud\tlabel\tlemma\tgloss\n" + rows.join("\n") + "\n");
  console.log(JSON.stringify(C, null, 1));
  console.log("evidence: " + path.join(EVID, "f1-gloss.tsv"));
})().catch((e) => { console.error(e); process.exit(1); });
