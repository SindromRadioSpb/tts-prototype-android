#!/usr/bin/env node
"use strict";
// Atlas P4 W2 fallback (owner decision E5): accept the AI agent's «В контексте (ИИ)» answer for the atlas.
// Input: a folder (or .zip) of <section>.json files in word-gloss-ai-layer-v1 (format: FORMAT.ru.md of the export).
// Every row is re-proved by the reader's own code (WordGlossAI.remember over AtlasWords.glossRows): a row whose key
// does not match the current text, whose gloss count differs from the word count, or whose mwe leaves the row is
// rejected; only accepted rows are written, to <data>/context-ai/<section>.json — the file the reader loads.
//   node scripts/atlas/import-context.cjs --answers=<dir|zip> [--data=data/atlas/a97002] [--sections=…] [--dry-run]
// Publishing to production is a separate, explicit step (data first, no deploy needed; back up the folder first):
//   ssh … 'sudo cp -a <vol>/atlas/a97002/context-ai <vol>/atlas/a97002/context-ai-backup-<date>'   (if present)
//   scp <data>/context-ai/*.json …  → <vol>/atlas/a97002/context-ai/   (vol = the app data volume, see PROD_OPS_PRIVATE)
const fs = require("fs");
const path = require("path");
const { parseHTML } = require("linkedom");

const REPO = path.resolve(__dirname, "..", "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
const DATA = path.resolve(REPO, opt("data", "data/atlas/a97002"));

function reader() {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  global.window = window; global.document = document; window.indexedDB = undefined;
  window.ReaderMorph = require(path.join(REPO, "public/js/reader-morph.js"));
  require(path.join(REPO, "public/js/word-gloss-ai.js"));
  return { RM: window.ReaderMorph, AI: window.WordGlossAI, AW: require(path.join(REPO, "public/js/atlas-words.js")) };
}

async function answers(src) {
  const out = new Map();
  if (/\.zip$/i.test(src)) {
    const zip = await require("jszip").loadAsync(fs.readFileSync(src));
    for (const name of Object.keys(zip.files)) {
      const m = /(?:^|\/)([a-z0-9-]+)\.json$/i.exec(name);
      if (m && !zip.files[name].dir) out.set(m[1], JSON.parse(await zip.files[name].async("string")));
    }
  } else {
    for (const f of fs.readdirSync(src)) { const m = /^([a-z0-9-]+)\.json$/i.exec(f); if (m) out.set(m[1], JSON.parse(fs.readFileSync(path.join(src, f), "utf8"))); }
  }
  return out;
}

async function main() {
  const src = opt("answers", "");
  if (!src) throw new Error("--answers=<dir|zip> is required");
  const { RM, AI, AW } = reader();
  const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
  const only = (opt("sections", "") || "").split(",").filter(Boolean);
  const got = await answers(path.resolve(src));
  const report = [];
  for (const s of index.sections) {
    if (only.length && !only.includes(s.id)) continue;
    const layer = got.get(s.id);
    if (!layer) { report.push({ section: s.id, status: "no answer" }); continue; }
    const data = JSON.parse(fs.readFileSync(path.join(DATA, "sections", s.id + ".json"), "utf8"));
    const rows = AW.glossRows(AW.sectionContext(index.atlas_id || "a97002", data, RM));
    AI._mem.clear();
    const res = await AI.remember(layer, rows);
    // keep exactly the rows the reader accepted: re-check each one alone (remember counts, it does not list)
    const accepted = [];
    for (const r of Array.isArray(layer.rows) ? layer.rows : []) {
      AI._mem.clear();
      const one = await AI.remember({ schema: layer.schema, rows: [r] }, rows);
      if (one.stored === 1) accepted.push({ order_index: r.order_index, key: r.key, model: String(r.model || ""),
        glosses: r.glosses.map((g) => Object.assign({ gloss: g.gloss }, g.wrong_hint ? { wrong_hint: true } : {})),
        mwe: (r.mwe || []).map((m) => ({ from: m.from, to: m.to, gloss: m.gloss })) });
    }
    const words = rows.reduce((a, r) => { const p = AI.rowPayloadFromData(r); return a + (p ? p.words.length : 0); }, 0);
    const covered = accepted.reduce((a, r) => a + r.glosses.length, 0);
    report.push({ section: s.id, rows: rows.length, answered: (layer.rows || []).length, stored: res.stored, rejected: res.rejected,
      wordsCovered: covered + " / " + words });
    if (!has("dry-run") && accepted.length) {
      fs.mkdirSync(path.join(DATA, "context-ai"), { recursive: true });
      fs.writeFileSync(path.join(DATA, "context-ai", s.id + ".json"),
        JSON.stringify({ schema: AI.LAYER_SCHEMA, atlas: index.atlas_id || "a97002", section: s.id,
          content_pack_sha256: data.content_pack_sha256 || "", imported_at: new Date().toISOString(), rows: accepted }));
    }
  }
  console.log(JSON.stringify(report, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
