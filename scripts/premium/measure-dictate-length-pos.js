#!/usr/bin/env node
"use strict";
// measure-before-code (P7.2d fork #3): характеризует РЕАЛЬНЫЙ dictate-безопасный набор
// (тот же предикат keyingService.dictateFormForItemKey, что сервер) по:
//   • длине письменной (консонантной) формы (1..N букв),
//   • POS (content vs function по notes-autogen.FUNCTION_POS).
// Отвечает: сколько items отсекает «written ≥3» vs «exclude function-POS», их пересечение.
// Вывод — в docs/research/telegram-p72d-selector/<date>/ (tracked, owner-facing).

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const keyingService = require(path.join(ROOT, "db", "keyingService"));
const NA = require(path.join(ROOT, "public", "js", "notes-autogen.js"));

(async () => {
  const b = await keyingService.ensureLoaded();
  const paradigms = (b.ds && b.ds.paradigms) || [];
  // pid → {pos, lemma} (первый по pid)
  const pidInfo = new Map();
  for (const p of paradigms) {
    if (p && p.pealim_id != null && !pidInfo.has(String(p.pealim_id))) {
      pidInfo.set(String(p.pealim_id), { pos: String(p.pos || "").toLowerCase(), lemma: p.lemma || "" });
    }
  }
  const pids = [...pidInfo.keys()];
  console.log("total distinct pids:", pids.length);

  const buckets = {};           // written-length → count
  const posCount = {};          // pos → count (dictate-safe)
  let safe = 0, funcSafe = 0, len2 = 0, len2func = 0, len2content = 0, len1 = 0;
  const len2Samples = [];
  let done = 0;
  for (const pid of pids) {
    let d = null;
    try { d = await keyingService.dictateFormForItemKey("pid:" + pid); } catch (_) { d = null; }
    if (++done % 1000 === 0) process.stderr.write("  ..." + done + "/" + pids.length + "\r");
    if (!d || !d.written) continue;
    safe++;
    const L = d.written.length;
    buckets[L] = (buckets[L] || 0) + 1;
    const info = pidInfo.get(pid) || {};
    const isFunc = NA.FUNCTION_POS.has(info.pos);
    posCount[info.pos || "(none)"] = (posCount[info.pos || "(none)"] || 0) + 1;
    if (isFunc) funcSafe++;
    if (L === 1) len1++;
    if (L <= 2) {
      len2++;
      if (isFunc) len2func++; else len2content++;
      if (len2Samples.length < 60) len2Samples.push({ w: d.written, pos: info.pos || "(none)", func: isFunc });
    }
  }
  process.stderr.write("\n");

  const lines = [];
  const P = (s) => { lines.push(s); console.log(s); };
  P("# P7.2d measure — dictate-safe set by written-length & POS");
  P("");
  P("dataset: pealim-infl-v12 (" + paradigms.length + " paradigms, " + pids.length + " distinct pids)");
  P("predicate: keyingService.dictateFormForItemKey (омофон-фильтр + vocForm-однозначность), сервер-идентичный");
  P("");
  P("dictate-SAFE lemmas: " + safe + " (" + (100 * safe / pids.length).toFixed(1) + "% of pids)");
  P("");
  P("## By written (consonantal) length");
  const lensSorted = Object.keys(buckets).map(Number).sort((a, c) => a - c);
  let cum = 0;
  for (const L of lensSorted) {
    cum += buckets[L];
    P("  len=" + L + ": " + buckets[L] + "  (cum " + cum + ", " + (100 * cum / safe).toFixed(1) + "% of safe)");
  }
  P("");
  P("## Fork #3 impact");
  P("  written === 1: " + len1 + "  (" + (100 * len1 / safe).toFixed(2) + "% of safe)");
  P("  written <= 2 : " + len2 + "  (" + (100 * len2 / safe).toFixed(2) + "% of safe)  ← «min length >=3» отсекает столько");
  P("    of which function-POS: " + len2func);
  P("    of which content-POS : " + len2content);
  P("  function-POS (ANY length): " + funcSafe + "  (" + (100 * funcSafe / safe).toFixed(2) + "% of safe)  ← «exclude function-POS» отсекает столько");
  P("");
  P("  Overlap: content-POS words with len<=2 that survive «exclude function-POS» but «min>=3» would cut: " + len2content);
  P("  Overlap: function-POS words with len>=3 that survive «min>=3» but «exclude function» would cut: " + (funcSafe - len2func));
  P("");
  P("## POS breakdown of dictate-safe set");
  for (const [pos, n] of Object.entries(posCount).sort((a, c) => c[1] - a[1])) {
    P("  " + pos + ": " + n + (NA.FUNCTION_POS.has(pos) ? "  [FUNCTION]" : ""));
  }
  P("");
  P("## Sample of written<=2 items (first 60)");
  for (const s of len2Samples) P("  «" + s.w + "»  pos=" + s.pos + (s.func ? "  [FUNCTION]" : "  [content]"));

  const outDir = path.join(ROOT, "docs", "research", "telegram-p72d-selector", "2026-07-08");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "dictate-length-pos-measure.txt"), lines.join("\n") + "\n");
  console.log("\n→ wrote " + path.join(outDir, "dictate-length-pos-measure.txt"));
})().catch((e) => { console.error(e); process.exit(1); });
