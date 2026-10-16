#!/usr/bin/env node
"use strict";
// Д8-К4 v2 · Г1 — проверка файлов пилота: каждая строка файла находит строку работы по хешу he_plain.trim() и
// order_index, и токены выравниваются с единицами ReaderMorph.placeUnits (ровно так, как их прочтёт загрузчик мест).
const fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto");
const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const TMP = path.join(REPO, ".tmp", "d8k4");
const ledger = JSON.parse(fs.readFileSync(path.join(TMP, "ledger.json"), "utf8")).works;
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
const out = {};
for (const ref of Object.keys(ledger)) {
  const L = ledger[ref]; if (!L.file) continue;
  const f = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, L.file))).toString("utf8"));
  // the work's rows, as on the device
  let rows;
  if (ref.startsWith("by:")) {
    const idx = JSON.parse(fs.readFileSync(path.join(TMP, "corpus-index-v8.json"), "utf8")).ready.find((w) => "by:" + w.id === ref);
    rows = JSON.parse(fs.readFileSync(path.join(TMP, "by", idx.file.replace(/^works\//, "")), "utf8")).library.texts[0].rows;
  } else {
    const [slug, wid] = ref.slice(3).split("/");
    const dir = path.join(TMP, "pc", slug), fn = fs.readdirSync(dir).find((x) => x.startsWith(wid));
    rows = JSON.parse(fs.readFileSync(path.join(dir, fn), "utf8")).item.snapshot.library.texts[0].rows;
  }
  const byHash = new Map(rows.map((r) => [sha(String(r.hebrew_plain || "").trim()) + ":" + r.order_index, r]));
  const s = { fileRows: f.rows.length, matched: 0, units: 0, aligned: 0, model: f.model, bytes: fs.statSync(path.join(REPO, L.file)).size };
  for (const [h, order, toks] of f.rows) {
    const r = byHash.get(h + ":" + order); if (!r) continue;
    s.matched++;
    const stored = toks.map((t) => ({ word: t[0], lemma: t[1], lemmas: [t[1]].concat(t[2]), posDicta: t[3], niqqud: t[4], binyan: t[5] || null, prefix: t[6] }));
    const pu = RM.placeUnits({ he_plain: r.hebrew_plain, he_niqqud: r.hebrew_niqqud }, stored);
    const n = pu.sk.filter(Boolean).length; s.units += n; s.aligned += pu.at.size;
  }
  s.alignedPct = s.units ? +(100 * s.aligned / s.units).toFixed(1) : 0;
  out[ref] = s;
}
console.log(JSON.stringify(out, null, 1));
