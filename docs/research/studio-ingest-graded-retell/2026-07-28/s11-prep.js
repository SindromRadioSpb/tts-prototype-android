// S11 замер-подготовка: тексты + частотный псевдо-профиль ученика (без LLM-вызовов).
"use strict";
const path = require("path");
const fs = require("fs");
const PROJ = "E:\\projects\\tts-prototype-android";
const OUT = __dirname;
const CP = require(path.join(PROJ, "public", "js", "captions-parse.js"));
const LC = require(path.join(PROJ, "public", "js", "lemma-canon.js"));

// 1. TED-транскрипт (устный регистр)
const vtt = fs.readFileSync(path.join(PROJ, "scripts/premium/fixtures/captions/ted-hebrew-manual.vtt"), "utf8");
const segs = CP.parse(vtt).segments.map(s => s.text.replace(/\s+/g, " ").trim())
  .filter(t => t && !/^\[.*\]$/.test(t) && !/^(תרגום|עריכה):/.test(t.split("\n")[0]));
const ted = segs.join(" ");
fs.writeFileSync(path.join(OUT, "text-ted.txt"), ted);

// 2. Литературный сложный текст: «חצי-נחמה» (Ахад ха-Ам)
function workText(id) {
  const j = JSON.parse(fs.readFileSync(path.join(PROJ, "public/data/benyehuda/works", id + ".json"), "utf8"));
  const t = j.library.texts[0];
  return { title: t.title, text: t.rows.map(r => r.hebrew_plain).filter(Boolean).join("\n") };
}
const w10 = workText("10");
fs.writeFileSync(path.join(OUT, "text-literary.txt"), w10.text);

// 3. Статья среднего размера: «קח־ותן»
const w11774 = workText("11774");
fs.writeFileSync(path.join(OUT, "text-article.txt"), w11774.text);

// 4. Частотный псевдо-профиль: частоты niqqud-stripped токенов по ВСЕМ локальным работам
const freq = new Map();
const worksDir = path.join(PROJ, "public/data/benyehuda/works");
let works = 0, tokens = 0;
for (const f of fs.readdirSync(worksDir)) {
  if (!f.endsWith(".json")) continue;
  let j; try { j = JSON.parse(fs.readFileSync(path.join(worksDir, f), "utf8")); } catch { continue; }
  const rows = ((j.library || {}).texts || [{}])[0].rows || [];
  works++;
  for (const r of rows) {
    for (const w of String(r.hebrew_plain || "").split(/[^\u0590-\u05FF'"׳״-]+/)) {
      const t = LC.stripNiqqud(w).replace(/^["'׳״-]+|["'׳״-]+$/g, "");
      if (t.length < 2 || !/[\u05D0-\u05EA]/.test(t)) continue;
      freq.set(t, (freq.get(t) || 0) + 1);
      tokens++;
    }
  }
}
const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
fs.writeFileSync(path.join(OUT, "freq-ranked.json"), JSON.stringify({ works, tokens, types: ranked.length, top: ranked.slice(0, 4000) }));

console.log(JSON.stringify({
  ted: { chars: ted.length, words: ted.split(/\s+/).length, segs: segs.length },
  literary: { title: w10.title, chars: w10.text.length, words: w10.text.split(/\s+/).length },
  article: { title: w11774.title, chars: w11774.text.length, words: w11774.text.split(/\s+/).length },
  freq: { works, tokens, types: ranked.length, top5: ranked.slice(0, 5) },
}, null, 2));
