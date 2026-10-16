#!/usr/bin/env node
"use strict";
// Д8-К4 v2 · Г2 — калибровка экзаменатора на архаике: человеческая эталонная выборка Бен-Иегуды
// (docs/research/reader-morph-gold/2026-06-25/reader-morph-gold-worksheet.tsv, разметка владельца gold_pos/gold_lemma).
// Экзаменатор видит предложение и слово, отвечает леммой и частью речи (открытый ответ, как O4 аудита 2026-10-16).
// Выход: .tmp/d8k4/g2/calib.json (лист) и calib-key.json (эталон).
const fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const TSV = path.join(REPO, "docs", "research", "reader-morph-gold", "2026-06-25", "reader-morph-gold-worksheet.tsv");
const OUT = path.join(REPO, ".tmp", "d8k4", "g2");
function parseTsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  const head = lines.shift().split("\t");
  return lines.map((l) => { const c = l.split("\t"); const o = {}; head.forEach((h, i) => { o[h] = (c[i] || "").replace(/^"|"$/g, "").replace(/""/g, '"'); }); return o; });
}
const rows = parseTsv(fs.readFileSync(TSV, "utf8")).filter((r) => r.gold_lemma && r.gold_pos && r.verdict !== "skip");
const sheet = [], key = {};
rows.forEach((r, i) => { const id = "cal" + String(i + 1).padStart(3, "0"); sheet.push({ id, sentence: r.sentence, word: r.niqqud || r.surface }); key[id] = { gold_pos: r.gold_pos, gold_lemma: r.gold_lemma, stratum: r.stratum, work: r.work }; });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "calib.json"), JSON.stringify(sheet, null, 1));
fs.writeFileSync(path.join(OUT, "calib-key.json"), JSON.stringify(key, null, 1));
console.log("calibration items", sheet.length);
