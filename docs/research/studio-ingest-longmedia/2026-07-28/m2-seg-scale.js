// M2 (S12 brainstorm, R10 measure-before-code): где рвётся ОДИН вызов seg-режима translate-table.
// Прямые вызовы generateContent (gemini-flash-latest, temperature 0 — как прод) с HE_RU_SEG_PROMPT
// на N сегментов, N растёт. Источник сегментов: реальная TED-иврит фикстура (218 сегментов),
// тайлится с продолжением индексов. Замеряем: wall time, usageMetadata, finishReason,
// JSON-parse, validateSegMapping, segCoverage.
// Запуск: node m2-seg-scale.js  (ключ из .env проекта)
"use strict";
const path = require("path");
const fs = require("fs");
const PROJ = "E:\\projects\\tts-prototype-android";
require(path.join(PROJ, "node_modules", "dotenv")).config({ path: path.join(PROJ, ".env") });
const segTable = require(path.join(PROJ, "ingest", "segTable.js"));
const CP = require(path.join(PROJ, "public", "js", "captions-parse.js"));

const KEY = process.env.GEMINI_API_KEY || "";
if (!/^(AIza|AQ\.)/.test(KEY)) { console.error("no key"); process.exit(1); }
const GL = "https://generativelanguage.googleapis.com";
const MODEL = "gemini-flash-latest";

const fixture = CP.parse(fs.readFileSync(path.join(PROJ, "scripts/premium/fixtures/captions/ted-hebrew-manual.vtt"), "utf8"));
const base = fixture.segments.map((s) => s.text);

function buildSegments(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ i, text: base[i % base.length] });
  return out;
}

async function runOne(n) {
  const segs = buildSegments(n);
  const sv = segTable.validateSegmentsInput(segs);
  const segInput = segTable.buildSegInput(segs);
  const prompt = segTable.HE_RU_SEG_PROMPT(segInput);
  const t0 = Date.now();
  let resp, http = null, err = null;
  try {
    resp = await fetch(GL + "/v1beta/models/" + MODEL + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    });
    http = resp.status;
  } catch (e) { err = "fetch: " + e.message; }
  const wallMs = Date.now() - t0;
  const rec = { n, serverValid: sv.ok, promptChars: prompt.length, wallMs, http, err };
  if (!resp || !resp.ok) {
    if (resp) rec.body = (await resp.text()).slice(0, 500);
    return rec;
  }
  const data = await resp.json();
  const cand = (data.candidates || [])[0] || {};
  rec.finishReason = cand.finishReason;
  rec.usage = data.usageMetadata || null;
  const raw = ((cand.content || {}).parts || []).map((p) => p.text || "").join("");
  rec.rawChars = raw.length;
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    rec.jsonOk = true;
    rec.rows = rows.length;
    rec.mappingValid = segTable.validateSegMapping(rows, n);
    const cov = segTable.segCoverage(rows, n);
    rec.covered = cov.covered;
    rec.missingCount = cov.missing.length;
    if (cov.missing.length) rec.missingSample = cov.missing.slice(0, 10);
    // качество полей: доля строк со всеми 4 полями непустыми
    const full = rows.filter((r) => r && r.he && r.he_niqqud && r.translit && r.ru).length;
    rec.rowsAllFields = full;
  } catch (e) {
    rec.jsonOk = false;
    rec.parseErr = e.message.slice(0, 120);
    rec.rawTail = cleaned.slice(-200);
  }
  return rec;
}

(async () => {
  const sizes = process.argv.slice(2).map(Number).filter(Boolean);
  const NS = sizes.length ? sizes : [150, 250, 400];
  const results = [];
  for (const n of NS) {
    console.log(`--- N=${n} ...`);
    const r = await runOne(n);
    console.log(JSON.stringify(r));
    results.push(r);
    fs.writeFileSync(path.join(__dirname, "m2-results.json"), JSON.stringify(results, null, 2));
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log("DONE");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
