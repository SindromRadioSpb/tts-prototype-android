#!/usr/bin/env node
"use strict";
// P7.2a reverse:tg eligibility измерение (R10, owner-запрос 2026-07-07): насколько русский глосс
// однозначно указывает на ОДНО ивритское слово. Замер на pealim-infl-v12 (9279 парадигм).
const zlib = require("zlib"), fs = require("fs"), path = require("path");
const REPO = "E:\\projects\\tts-prototype-android";
const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public/data/inflection/pealim-infl-v12.json.gz"))));
const P = (ds.paradigms || []).filter((p) => p && p.lemma);

// нормализация RU-глосса: lowercase, ё→е, убрать скобки-пояснения, трим, схлопнуть пробелы
function normGloss(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е")
    .replace(/\([^)]*\)/g, " ")        // (пояснения) выкинуть
    .replace(/[. ]/g, " ")
    .replace(/\s+/g, " ").trim();
}
// разбить перечисление на сенсы
const ENUM_RE = /[\/,;]| или | и | либо /;
function senses(g) { return normGloss(g).split(ENUM_RE).map((x) => x.trim()).filter(Boolean); }

const total = P.length;
const withMeaning = P.filter((p) => String(p.meaning || "").trim());
const contentPos = new Set(["verb", "noun", "adjective", "adj", "adverb"]);
const content = P.filter((p) => contentPos.has(String(p.pos || "").toLowerCase()));
const contentWithMeaning = content.filter((p) => String(p.meaning || "").trim());

// (1) покрытие
console.log("═══ P7.2a reverse:tg — измерение неоднозначности RU-глосса ═══\n");
console.log(`[1] Покрытие meaning:`);
console.log(`    всего парадигм: ${total}`);
console.log(`    с непустым meaning: ${withMeaning.length} (${(100 * withMeaning.length / total).toFixed(1)}%)`);
console.log(`    контентные (verb/noun/adj/adv): ${content.length}, из них с meaning: ${contentWithMeaning.length} (${(100 * contentWithMeaning.length / (content.length || 1)).toFixed(1)}%)\n`);

// (2) перечисления
const enumerated = withMeaning.filter((p) => senses(p.meaning).length > 1);
console.log(`[2] Глоссы-перечисления (несколько сенсов через /,;或или):`);
console.log(`    ${enumerated.length} (${(100 * enumerated.length / withMeaning.length).toFixed(1)}% от с-meaning)`);
console.log(`    примеры: ${enumerated.slice(0, 5).map((p) => `«${p.meaning}»`).join(" · ")}\n`);

// (3) коллизия: один нормализованный сенс → сколько РАЗНЫХ лемм (RU→много HE)
// строим карту sense → Set(lemma)
const senseToLemmas = new Map();
for (const p of withMeaning) {
  for (const sn of senses(p.meaning)) {
    if (!sn || sn.length < 2) continue;
    let set = senseToLemmas.get(sn); if (!set) { set = new Set(); senseToLemmas.set(sn, set); }
    set.add(p.lemma);
  }
}
// для каждой парадигмы: есть ли у неё сенс, коллизирующий с ДРУГОЙ леммой
let collidingParadigms = 0;
const collisionExamples = [];
for (const p of withMeaning) {
  const cols = senses(p.meaning).filter((sn) => sn.length >= 2 && (senseToLemmas.get(sn) || new Set()).size > 1);
  if (cols.length) {
    collidingParadigms++;
    if (collisionExamples.length < 8) {
      const sn = cols[0]; const lemmas = [...senseToLemmas.get(sn)].slice(0, 4);
      collisionExamples.push(`«${sn}» → ${lemmas.join(", ")}${senseToLemmas.get(sn).size > 4 ? " …" : ""}`);
    }
  }
}
console.log(`[3] Коллизия RU→HE (сенс глосса указывает на >1 РАЗНУЮ лемму):`);
console.log(`    парадигм с коллизирующим сенсом: ${collidingParadigms} (${(100 * collidingParadigms / withMeaning.length).toFixed(1)}% от с-meaning)`);
console.log(`    примеры коллизий:`);
for (const e of collisionExamples) console.log(`      ${e}`);
console.log();

// (4) широкие глоссы: топ по частоте нормализованного ПОЛНОГО глосса (одно слово)
const fullFreq = new Map();
for (const p of withMeaning) {
  const g = normGloss(p.meaning);
  fullFreq.set(g, (fullFreq.get(g) || 0) + 1);
}
const topBroad = [...fullFreq.entries()].filter(([g]) => g && !ENUM_RE.test(g)).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(`[4] Самые частые (широкие/коллизирующие) глоссы:`);
for (const [g, n] of topBroad) if (n > 1) console.log(`      «${g}» ×${n}`);
console.log();

// (5) «безопасный reverse»-кандидат: непустой meaning · НЕ перечисление · сенс НЕ коллизирует
// с другой леммой · одно-два слова (не фраза)
let safe = 0;
for (const p of withMeaning) {
  const sns = senses(p.meaning);
  if (sns.length !== 1) continue;                       // не перечисление
  const sn = sns[0];
  if (sn.split(" ").length > 3) continue;               // не длинная фраза
  if ((senseToLemmas.get(sn) || new Set()).size > 1) continue;  // не коллизирует
  safe++;
}
console.log(`[5] «Безопасный reverse»-кандидат (meaning · один сенс · ≤3 слов · без коллизии):`);
console.log(`    ${safe} парадигм (${(100 * safe / total).toFixed(1)}% всех, ${(100 * safe / withMeaning.length).toFixed(1)}% от с-meaning)`);
console.log(`\n─── Вывод: доля due-слов, годных для честного reverse:tg БЕЗ доп.контекста ≈ ${(100 * safe / withMeaning.length).toFixed(0)}% от слов с глоссом.`);
console.log(`    Остальные (перечисления/коллизии/широкие) → cloze/аудио/Зал (fallback), НЕ строгий grade.`);
