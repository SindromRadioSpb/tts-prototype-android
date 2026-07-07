#!/usr/bin/env node
"use strict";
// P7.2c dictate homophone coverage (R10, критика wf_6732a80f BLOCKER): сколько лемм звук→написание
// ОДНОЗНАЧНЫ (нет омофоничной леммы с ДРУГИМ написанием). Аудио-диктант принципиально не задаёт
// написание для омофон-неоднозначных слов → ложный lapse. Фонемная транскрипция = коллапс
// омофон-согласных классов + niqqud-гласные. Две леммы = омофоны, если транскрипция совпадает.
const zlib = require("zlib"), fs = require("fs"), path = require("path");
const REPO = "E:\\projects\\tts-prototype-android";
const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public/data/inflection/pealim-infl-v12.json.gz"))));
const P = (ds.paradigms || []).filter((p) => p && p.lemma_niqqud);

// niqqud → гласная фонема
const VOWEL = { "ָ": "a", "ַ": "a", "ֵ": "e", "ֶ": "e", "ִ": "i", "ֹ": "o", "ֻ": "u", "ְ": "" };
// финальные формы → базовые
const FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
// согласный → фонема-класс (коллапс известных омофон-путаниц; консервативно over-merge)
function consPhon(ch) {
  if (ch === "ט" || ch === "ת") return "t";          // ט,ת → /t/
  if (ch === "ק" || ch === "כ" || ch === "ח") return "k"; // ק,כ,ח (kaf-family, over-merge)
  if (ch === "ס" || ch === "ש") return "s";          // ס,ש → /s/ (over-merge shin)
  if (ch === "א" || ch === "ע" || ch === "ה") return "";  // א,ע,ה глоттали/немые → drop
  if (ch === "ב" || ch === "ו") return "v";          // ב,ו → /v/ (ו mater тоже, over-merge)
  if (ch === "י") return "";                              // י mater → drop
  return ch;                                                    // остальные согласные — как есть
}
function phon(vocalized) {
  let out = "";
  for (let ch of String(vocalized || "")) {
    if (FINAL[ch]) ch = FINAL[ch];
    if (VOWEL[ch] != null) { out += VOWEL[ch]; continue; }
    if (ch === "ּ" || ch === "ֽ" || /[֑-֯׀-ׇ]/.test(ch)) continue; // dagesh/teamim/пункт
    if (/[א-ת]/.test(ch)) { out += consPhon(ch); continue; }
    // прочее (пробел и т.п.) — drop
  }
  return out;
}
function stripNiqqud(s) { return String(s || "").replace(/[֑-ׇ]/g, "").trim(); }
function normVoc(s) { return String(s || "").normalize("NFC").replace(/\s+/g, "").trim(); }

// vocForm-однозначность (как в keyingService dictateFormForItemKey): огласованная лемма → один pid
const vocIndex = new Map();
for (const p of P) { const v = normVoc(p.lemma_niqqud); if (!v) continue; let s = vocIndex.get(v); if (!s) { s = new Set(); vocIndex.set(v, s); } s.add(String(p.pealim_id)); }

// декисив-леммы (vocForm уникальна) — кандидаты dictate ДО омофон-фильтра
const decisive = P.filter((p) => { const v = normVoc(p.lemma_niqqud); const s = vocIndex.get(v); return s && s.size === 1 && stripNiqqud(v).length >= 2; });

// фонема → множество РАЗНЫХ написаний (консонантных скелетов)
const phonToSpellings = new Map();
for (const p of P) {
  const v = normVoc(p.lemma_niqqud); const ph = phon(v); const sk = stripNiqqud(v);
  if (!ph || !sk) continue;
  let s = phonToSpellings.get(ph); if (!s) { s = new Set(); phonToSpellings.set(ph, s); }
  s.add(sk);
}

// dictate-safe: декисив-лемма, чья фонема даёт РОВНО одно написание в лексиконе
let safe = 0; const collisionExamples = [];
for (const p of decisive) {
  const v = normVoc(p.lemma_niqqud); const ph = phon(v); const sk = stripNiqqud(v);
  const spellings = phonToSpellings.get(ph) || new Set();
  if (spellings.size <= 1) safe++;
  else if (collisionExamples.length < 10) collisionExamples.push(`${sk} /${ph}/ ↔ ${[...spellings].filter((x) => x !== sk).slice(0, 3).join(",")}`);
}

console.log("═══ P7.2c dictate — омофон-однозначность (звук→написание) ═══\n");
console.log(`Всего парадигм с lemma_niqqud: ${P.length}`);
console.log(`Decisive (vocForm уникальна, ≥2 буквы): ${decisive.length} (${(100 * decisive.length / P.length).toFixed(1)}%)`);
console.log(`\nDictate-SAFE (decisive И фонема → РОВНО одно написание): ${safe} (${(100 * safe / P.length).toFixed(1)}% всех, ${(100 * safe / decisive.length).toFixed(1)}% от decisive)`);
console.log(`\nПримеры омофон-КОЛЛИЗИЙ (звук не задаёт написание → dictate НЕБЕЗОПАСЕН):`);
for (const e of collisionExamples) console.log(`   ${e}`);
console.log(`\n─── Вывод: dictate честно применим к ≈${(100 * safe / P.length).toFixed(0)}% лемм (омофон-фильтр). Транскрипция консервативна (over-merge → это НИЖНЯЯ граница безопасных; реальная доля может быть выше). Остальные → reverse/cloze/Зал.`);
