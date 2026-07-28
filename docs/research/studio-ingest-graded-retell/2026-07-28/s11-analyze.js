// S11 пост-хок анализ выходов M1: компрессия, частотный coverage, лемма-резолв,
// кандидаты выдуманных форм (UNRESOLVED контент-токены), комплаенс списку P2.
"use strict";
const path = require("path");
const fs = require("fs");
const PROJ = "E:\\projects\\tts-prototype-android";
const OUT = __dirname;
const RM = require(path.join(PROJ, "public", "js", "reader-morph.js"));
const morph = require(path.join(PROJ, "agent", "access", "wordMorphologyResolver.js"));

const freq = JSON.parse(fs.readFileSync(path.join(OUT, "freq-ranked.json"), "utf8"));
const rank = new Map(freq.top.map(([w], i) => [w, i]));
const allow = new Set(freq.top.slice(0, 1200).map(([w]) => w));

const strip = (w) => RM.stripNiqqud(w).replace(/^["'׳״-]+|["'׳״-]+$/g, "");
function tokens(text) {
  return text.split(/[^\u0590-\u05FF'"׳״-]+/).map(strip).filter(t => t.length >= 1 && /[\u05D0-\u05EA]/.test(t));
}

async function analyzeOne(textKey, varKey) {
  const p = path.join(OUT, `retell-${textKey}-${varKey}.txt`);
  if (!fs.existsSync(p)) return null;
  let out = fs.readFileSync(p, "utf8");
  let newLine = null;
  const m = out.match(/^NEW:\s*(.*)$/m);
  if (m) { newLine = m[1].trim(); out = out.replace(/^NEW:.*$/m, ""); }
  const src = fs.readFileSync(path.join(OUT, `text-${textKey}.txt`), "utf8");
  const srcTok = tokens(src), outTok = tokens(out);
  const res = {
    textKey, varKey,
    srcWords: srcTok.length, outWords: outTok.length,
    ratio: +(outTok.length / srcTok.length).toFixed(2),
    sentences: out.split(/\n+/).filter(l => l.trim()).length,
  };
  // частотный coverage (по типам употреблений/токенам)
  let in1500 = 0, in3000 = 0, oov = 0;
  const oovTypes = new Map();
  for (const t of outTok) {
    const r = rank.get(t);
    if (r != null && r < 1500) in1500++;
    if (r != null && r < 3000) in3000++;
    if (r == null) { oov++; oovTypes.set(t, (oovTypes.get(t) || 0) + 1); }
  }
  res.pctTop1500 = +(in1500 / outTok.length * 100).toFixed(1);
  res.pctTop3000 = +(in3000 / outTok.length * 100).toFixed(1);
  res.pctCorpusOov = +(oov / outTok.length * 100).toFixed(1);
  // лемма-резолв контент-токенов: EXACT / AMBIGUOUS / UNRESOLVED
  const seen = new Set();
  let exact = 0, ambig = 0, unres = 0, func = 0, proper = 0, content = 0;
  const unresolvedTypes = [];
  for (const t of outTok) {
    const g = RM.functionGate ? RM.functionGate(t) : null;
    if (g && g.isFunc && g.pos === "propernoun") { proper++; continue; }
    if (g && g.isFunc) { func++; continue; }
    content++;
    if (seen.has(t)) continue;
    seen.add(t);
    const r = await morph.resolveCoverageToken({ word: t });
    if (r && r.resolution === "EXACT") exact++;
    else if (r && r.resolution === "AMBIGUOUS") ambig++;
    else { unres++; unresolvedTypes.push(t); }
  }
  res.contentTypes = seen.size;
  res.exactTypes = exact; res.ambigTypes = ambig; res.unresTypes = unres;
  res.unresolvedSample = unresolvedTypes.slice(0, 25);
  // комплаенс P2: доля токенов в allow-set
  if (varKey === "list") {
    let inAllow = 0;
    for (const t of outTok) if (allow.has(t)) inAllow++;
    res.pctInAllowList = +(inAllow / outTok.length * 100).toFixed(1);
    res.newDeclared = newLine;
  }
  return res;
}

(async () => {
  const all = [];
  for (const t of ["ted", "literary", "article"]) {
    for (const v of ["cefr", "list", "freq"]) {
      const r = await analyzeOne(t, v);
      if (r) { all.push(r); console.log(JSON.stringify(r)); }
    }
  }
  fs.writeFileSync(path.join(OUT, "m1-analysis.json"), JSON.stringify(all, null, 2));
  console.log("DONE " + all.length);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
