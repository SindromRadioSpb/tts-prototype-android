// S11 замер 2: скорость known-coverage на длинном тексте (Node-путь textCoverageResolver).
// Датасет-загрузка + throughput на ~22k токенов (TED ×10).
"use strict";
const path = require("path");
const fs = require("fs");
const PROJ = "E:\\projects\\tts-prototype-android";
const cov = require(path.join(PROJ, "agent", "access", "textCoverageResolver.js"));

const ted = fs.readFileSync(path.join(__dirname, "text-ted.txt"), "utf8");
const lines = ted.split(/(?<=\.)\s+/);
const rows = [];
for (let k = 0; k < 10; k++) for (const l of lines) if (l.trim()) rows.push({ he: l, he_niqqud: "" });

(async () => {
  const t0 = Date.now();
  const warm = await cov.calculate(rows.slice(0, 5), { version: "x", generated_at_ms: 0, manual: {}, scheduled: [] });
  const tLoad = Date.now() - t0; // включает ленивую загрузку словаря
  const t1 = Date.now();
  const full = await cov.calculate(rows, { version: "x", generated_at_ms: 0, manual: {}, scheduled: [] });
  const tFull = Date.now() - t1;
  console.log(JSON.stringify({
    datasetLoadFirstCallMs: tLoad,
    rows: rows.length,
    tokens: full.token_total,
    lemmaTypes: full.lemma_total,
    fullCalcMs: tFull,
    tokensPerSec: Math.round(full.token_total / (tFull / 1000)),
    band: full.recommendation_band,
  }, null, 2));
})().catch(e => { console.error("FAIL", e); process.exit(1); });
