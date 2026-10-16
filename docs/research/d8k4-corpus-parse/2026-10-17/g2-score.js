#!/usr/bin/env node
"use strict";
// Д8-К4 v2 · Г2 — подсчёт слепого экзамена по стратам против порога плана (записан до прогона):
// среди различимых случаев доля «верно правило» ≥ 85 % и нижняя граница 95 % ДИ Уилсона ≥ 75 %;
// доля «верен прежний ключ» ≤ 10 % точечно. Страта g (Р2/Д10.1): Д10.1 — если ошибка правила подтверждена в ≥ 70 %.
// Запуск: node g2-score.js <answers-1.json> <answers-2.json>  → .tmp/d8k4/g2/score.json
const fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const G2 = path.join(REPO, ".tmp", "d8k4", "g2");
const key = JSON.parse(fs.readFileSync(path.join(G2, "key.json"), "utf8")).key;
const ans = new Map(); process.argv.slice(2).forEach((f) => JSON.parse(fs.readFileSync(f, "utf8")).forEach((a) => ans.set(a.id, a)));
function wilson(k, n) { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [+(100 * (c - m) / d).toFixed(1), +(100 * (c + m) / d).toFixed(1)]; }
const S = {}, rows = [];
for (const id of Object.keys(key)) {
  const k = key[id], a = ans.get(id), s = S[k.stratum] || (S[k.stratum] = { n: 0, rule: 0, before: 0, both: 0, neither: 0, missing: 0 });
  s.n++;
  if (!a) { s.missing++; continue; }
  const v = a.answer === "both" ? "both" : a.answer === "neither" ? "neither" : Number(a.answer) === k.ruleOption ? "rule" : "before";
  s[v]++;
  rows.push({ id, stratum: k.stratum, verdict: v, word: k.word, before: k.before.lemma, rule: k.rule.lemma, dicta_prefix: k.dicta.prefix, reason: a.reason, work: k.work });
}
for (const s of Object.values(S)) {
  const dec = s.rule + s.before;
  s.rule_share = dec ? +(100 * s.rule / dec).toFixed(1) : 0;
  s.wilson95 = wilson(s.rule, dec);
  s.before_share_all = s.n ? +(100 * s.before / s.n).toFixed(1) : 0;
}
for (const st of ["a", "b", "c"]) if (S[st]) S[st].pass = S[st].rule_share >= 85 && S[st].wilson95[0] >= 75 && S[st].before_share_all <= 10;
if (S.g) { const dec = S.g.rule + S.g.before; S.g.rule_error_share = dec ? +(100 * S.g.before / dec).toFixed(1) : 0; S.g.d10_1 = S.g.rule_error_share >= 70; }
fs.writeFileSync(path.join(G2, "score.json"), JSON.stringify({ strata: S, rows }, null, 1));
console.log(JSON.stringify(S, null, 1));
