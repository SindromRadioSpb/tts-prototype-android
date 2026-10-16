#!/usr/bin/env node
"use strict";
// Д8-К4 v2 · Г2 — оценка калибровки экзаменатора на человеческом эталоне архаики (g2-calib.js).
// Совпадение леммы: скелет без огласовки и конечных форм; «мягкое» — ещё и без букв-помощниц ו/י (полное/дефектное
// написание) и с инфинитивом ↔ 3 л. м. р. прош. (ל+корень). Часть речи — как есть.
const fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const KEY = path.join(REPO, ".tmp", "d8k4", "g2", "calib-key.json");
const ANS = process.argv[2];
const FIN = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const sk = (s) => String(s || "").replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "").replace(/[ךםןףץ]/g, (c) => FIN[c]);
const soft = (s) => { s = sk(s); if (/^ל/.test(s) && s.length >= 4) s = s.slice(1); return s.replace(/[וי]/g, ""); };
const key = JSON.parse(fs.readFileSync(KEY, "utf8")), ans = JSON.parse(fs.readFileSync(ANS, "utf8"));
const by = new Map(ans.map((a) => [a.id, a]));
let n = 0, strict = 0, loose = 0, pos = 0; const miss = [], perStratum = {};
for (const id of Object.keys(key)) {
  const g = key[id], a = by.get(id); n++;
  const st = perStratum[g.stratum] || (perStratum[g.stratum] = { n: 0, lemma: 0 }); st.n++;
  if (!a) { miss.push({ id, missing: true }); continue; }
  const s1 = sk(a.lemma) === sk(g.gold_lemma), s2 = s1 || soft(a.lemma) === soft(g.gold_lemma);
  if (s1) strict++; if (s2) { loose++; st.lemma++; } else miss.push({ id, gold: g.gold_lemma + "/" + g.gold_pos, exam: a.lemma + "/" + a.pos });
  if (String(a.pos) === String(g.gold_pos)) pos++;
}
const pct = (x) => +(100 * x / n).toFixed(1);
const out = { n, lemma_strict: pct(strict), lemma_soft: pct(loose), pos: pct(pos), perStratum, misses: miss };
console.log(JSON.stringify(out, null, 1));
