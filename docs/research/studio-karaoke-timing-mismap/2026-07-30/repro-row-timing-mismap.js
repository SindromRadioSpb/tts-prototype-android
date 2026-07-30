// Offline repro harness for STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30.
//
// ЧТО ЭТО. Исполняемое доказательство корня бага «караоке подсвечивает не ту строку»
// (docs/planning/STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30.md). Сети и LLM НЕ требует:
// «модель» — детерминированный фейк, весь остальной путь — РЕАЛЬНЫЕ прод-модули.
//
// КАК ЗАПУСТИТЬ (из корня репозитория):
//     node docs/research/studio-karaoke-timing-mismap/2026-07-30/repro-row-timing-mismap.js   # ДО фикса
//     FIXED=1 node docs/research/.../repro-row-timing-mismap.js                                # ПОСЛЕ фикса
// (переменная FIXED переключает эмуляцию гейта v3AttachAudioTiming: старый anyIdx vs новый
// AsrTranscript.validateRowSegMapping + флаг segMode.)
//
// ЧТО ДОКАЗЫВАЕТ. Сценарий A (Gemini seg-режим, чанки, модель нумерует СЕГМЕНТЫ) — тайминг
// ТОЧЕН (медиана ошибки 0 с) ⇒ чанк-математика/offsetRows/buildRowTiming не виноваты.
// Сценарий B (модель нумерует СТРОКИ) — серверная validateSegMapping срезает индексы,
// караоке честно отключается ⇒ этот путь не может дать наблюдаемый паспорт.
// Сценарий C (премиум /api/translate-table-v2) — воспроизводит паспорт владельца точь-в-точь:
// o = 0,1,2,… подряд, maxO = segments-2, медианная ошибка в десятки минут, потому что премиум
// rows[].segment_index — это 1-based номер предложения СВОЕГО сегментатора, а не ASR-сегмента.
// С FIXED=1 сценарий C честно уходит в «караоке нет», A остаётся точным.
// Сценарий D (K2, добавлен 2026-07-30 после фикса) — тот же премиум-ответ, но с НОВЫМ полем
// `source_line_index` (db/premium/segmenter.js line_index): караоке возвращается ДЕФОЛТНОМУ
// провайдеру владельца (google-free) и его медианная ошибка = 0 с на тех же 117 минутах.
// Оракул у D тот же, что у C, и он НЕ смотрит на line_index (иначе доказывал бы сам себя).
//
// Источник: сессия фикса 2026-07-30; коммит — см. git log по этому файлу.
// No network, no LLM. Uses the REAL production modules:
//   ingest/tableRows.js  (buildRowsFromGeminiPayload, keepSegmentIndex)
//   ingest/segTable.js   (validateSegMapping / segCoverage)
//   public/js/table-chunks.js (buildChunks / offsetRows / coverageForChunk)
//   public/js/asr-transcript.js (validateSegments / buildRowTiming)
//   db/premium/segmenter.js (premium sentence segmenter = /api/translate-table-v2 row identity)
"use strict";
const ROOT = require("path").resolve(__dirname, "../../../..");
const { buildRowsFromGeminiPayload } = require(ROOT + "/ingest/tableRows.js");
const segTable = require(ROOT + "/ingest/segTable.js");
const TC = require(ROOT + "/public/js/table-chunks.js");
const A = require(ROOT + "/public/js/asr-transcript.js");
const premiumSegmenter = require(ROOT + "/db/premium/segmenter.js");

// ── Ground truth: 1074 ASR segments over 117 min, ~1.54 sentences per segment ──
const SEG_COUNT = 1074;
const DURATION = 117 * 60; // 7020 s
const HE = ["הוא אמר לי שזה היה בשנת אלף תשע מאות ארבעים ושתיים",
            "אנחנו הלכנו ברגל כל הדרך עד לגבול",
            "אמא שלי לקחה את היד שלי ולא עזבה",
            "בבוקר הגיעו החיילים אל הכפר שלנו"];
const segments = [];
let t = 0;
for (let i = 0; i < SEG_COUNT; i++) {
  // realistic jitter around 6.54 s/segment so starts are strictly increasing
  const step = 4 + ((i * 7919) % 53) / 10; // 4.0 … 9.2 s
  const two = (i % 100) < 54;              // 54% of segments hold TWO sentences (→ ~1.54 rows/seg)
  const text = two ? HE[i % 4] + ". " + HE[(i + 1) % 4] + "." : HE[i % 4] + ".";
  segments.push({ start: Math.min(t, DURATION), text });
  t += step;
}
// normalize the last start to the real duration scale
const scale = (DURATION - 5) / segments[SEG_COUNT - 1].start;
segments.forEach((s) => { s.start = Math.round(s.start * scale * 100) / 100; });

const v = A.validateSegments(segments, DURATION); // real prod validation → segs carry {i,start,text}
const V = v.segments;
console.log("ground truth: segments=" + V.length, "timingOk=" + v.timingOk,
            "lastStart=" + V[V.length - 1].start, "durationSec=" + DURATION);

// Preview text that reaches the table: one line per ASR segment (v3AudioSegmentsForRequest)
const previewText = V.map((s) => s.text).join("\n");
const lines = previewText.split("\n").map((s) => s.trim()).filter(Boolean);
console.log("preview lines=" + lines.length + " (must equal segments for seg-mode)");

// ── Fake "model" for /api/translate-table seg-mode ────────────────────────────
// mode "chunkRelative": obedient — segment_index = k of the INPUT segment (1:N split allowed)
// mode "rowOrdinal":    degenerate — segment_index = ordinal of the row inside the chunk
function fakeModelResponse(chunkSegs, mode) {
  const rows = [];
  chunkSegs.forEach((s, k) => {
    const parts = s.text.split(". ").filter(Boolean);          // 1 or 2 rows per segment
    parts.forEach((p, j) => {
      rows.push({ segment_index: mode === "rowOrdinal" ? rows.length : k,
                  he: p.replace(/\.*$/, "") + ".", he_niqqud: "", translit: "", ru: "ru " + k + "/" + j });
    });
  });
  return { segments: chunkSegs.map((s, k) => ({ index: k, he: s.text })), rows };
}

// ── Server /api/translate-table seg-mode, verbatim order of operations (server.js 6462-6483) ──
function serverSegMode(parsed, chunkSegs) {
  const prepared = buildRowsFromGeminiPayload(parsed, { direction: "he-ru" }, { keepSegmentIndex: true });
  const warnings = [];
  if (!segTable.validateSegMapping(prepared, chunkSegs.length)) {
    prepared.forEach((r) => { delete r.segment_index; });
    warnings.push("SEG_MAPPING_LOST");
  } else if (!segTable.segCoverage(prepared, chunkSegs.length).covered) {
    warnings.push("SEG_COVERAGE_PARTIAL");
  }
  return { rows: prepared, warnings };
}

// ── Client v3AttachAudioTiming gate (public/index.html), verbatim ──
// FIXED=0 → pre-fix gate (anyIdx, segMode ignored); FIXED=1 → post-fix gate.
const FIXED = process.env.FIXED === "1";
function attachTiming(res, segs, segMode, premiumLines) {
  const rows = (res && res.rows) || [];
  const resWarnings = (res && res.warnings) || [];
  const lost = resWarnings.includes("SEG_MAPPING_LOST");
  if (!FIXED) {
    const anyIdx = rows.some((r) => Number.isInteger(r.segment_index));
    if (anyIdx && !lost) {
      const timing = A.buildRowTiming(segs, rows.map((r) => (Number.isInteger(r.segment_index) ? r.segment_index : null)));
      return { timing, dropReason: timing ? null : "SEG_MAPPING_LOST" };
    }
    return { timing: null, dropReason: lost ? "SEG_MAPPING_LOST" : "NO_SEGMENT_MAPPING" };
  }
  // K2: у премиум-ветки свой мост — source_line_index, сверенный с текстом строк запроса.
  let rowSegIdx = [];
  if (segMode === true) {
    rowSegIdx = rows.map((r) => (Number.isInteger(r.segment_index) ? r.segment_index : null));
  } else if (Array.isArray(premiumLines) && premiumLines.length === (Array.isArray(segs) ? segs.length : -1)) {
    rowSegIdx = A.premiumRowLineIdx(rows, premiumLines).idx;
  }
  const mapCheck = A.validateRowSegMapping(rowSegIdx, Array.isArray(segs) ? segs.length : 0);
  if (mapCheck.ok && !lost) {
    const timing = A.buildRowTiming(segs, rowSegIdx);
    return { timing, dropReason: timing ? null : "SEG_MAPPING_LOST", mapCheck };
  }
  const noneAtAll = !lost && (mapCheck.reason === "NO_INDEX" || mapCheck.reason === "NO_SEGMENTS");
  return { timing: null, dropReason: noneAtAll ? "NO_SEGMENT_MAPPING" : "SEG_MAPPING_LOST", mapCheck };
}

// ── Oracle: for every row, the TRUE time = start of the ASR segment it came from ──
function scoreTiming(timing, rowTrueTime, label) {
  if (!timing) { console.log(label + ": NO TIMING (honest degradation)"); return; }
  const e = timing.entries;
  const errs = [];
  let covered = 0;
  // entry {o,t} paints rows [o, next.o)
  for (let k = 0; k < e.length; k++) {
    const from = e[k].o, to = k + 1 < e.length ? e[k + 1].o : rowTrueTime.length;
    for (let r = from; r < to && r < rowTrueTime.length; r++) { errs.push(Math.abs(e[k].t - rowTrueTime[r])); covered++; }
  }
  errs.sort((x, y) => x - y);
  const med = errs.length ? errs[Math.floor(errs.length / 2)] : NaN;
  const le5 = errs.filter((x) => x <= 5).length / (errs.length || 1);
  const gt60 = errs.filter((x) => x > 60).length / (errs.length || 1);
  console.log(label + ": entries=" + e.length + " o[0..4]=" + e.slice(0, 5).map((x) => x.o).join(",") +
    " maxO=" + e[e.length - 1].o + " rowsCovered=" + covered + "/" + rowTrueTime.length +
    " rowsNoTiming=" + (rowTrueTime.length - covered) +
    " medianErr=" + med.toFixed(1) + "s maxErr=" + errs[errs.length - 1].toFixed(0) + "s" +
    " err<=5s=" + (le5 * 100).toFixed(1) + "% err>60s=" + (gt60 * 100).toFixed(1) + "%");
  const identity = e.every((x, k) => x.o === (e[0].o + k)) ;
  console.log("   consecutive-o (degenerate 1:1 fingerprint): " + identity);
}

// ══ SCENARIO A: Gemini seg-mode, chunked, model returns CORRECT chunk-relative indices ══
function scenarioGemini(mode) {
  const segsForChunks = lines.map((tx, k) => ({ i: k, text: tx }));
  const chunks = TC.buildChunks(segsForChunks);
  const accum = [];
  const missingPerChunk = [];
  let lostChunks = 0;
  for (let k = 0; k < chunks.length; k++) {
    const res = serverSegMode(fakeModelResponse(chunks[k].segs, mode), chunks[k].segs);
    if (res.warnings.includes("SEG_MAPPING_LOST")) lostChunks++;
    accum.push(...TC.offsetRows(res.rows, chunks[k].base));
    missingPerChunk.push({ base: chunks[k].base, missing: TC.coverageForChunk(res.rows, chunks[k].segs.length).missing });
  }
  const missingGlobal = TC.aggregateMissing(missingPerChunk);
  // rowTrueTime from the fake model's construction (row j of segment s → start of s)
  const rowTrueTime = [];
  const rowSeg = [];
  let g = 0;
  for (let k = 0; k < chunks.length; k++) {
    chunks[k].segs.forEach((s, j) => {
      const parts = s.text.split(". ").filter(Boolean);
      parts.forEach(() => { rowTrueTime.push(V[chunks[k].base + j].start); rowSeg.push(chunks[k].base + j); g++; });
    });
  }
  console.log("\n=== SCENARIO " + (mode === "rowOrdinal" ? "B (model numbers ROWS)" : "A (model numbers SEGMENTS, obedient)") + " ===");
  console.log("chunks=" + chunks.length + " rows=" + accum.length + " (" + (accum.length / SEG_COUNT).toFixed(2) +
              " rows/segment) chunksWithSEG_MAPPING_LOST=" + lostChunks + "/" + chunks.length +
              " missingSegments=" + missingGlobal.length);
  const out = attachTiming({ rows: accum, warnings: missingGlobal.length ? ["SEG_COVERAGE_PARTIAL"] : [] }, V, true);
  scoreTiming(out.timing, rowTrueTime, "  timing");
  if (!out.timing) console.log("  dropReason=" + out.dropReason + " mapCheck=" + JSON.stringify(out.mapCheck||null));
  // strict per-entry oracle: entry for segment s must point at the FIRST row of segment s
  if (out.timing) {
    let bad = 0;
    out.timing.entries.forEach((en) => {
      const s = rowSeg[en.o];
      if (V[s] == null || V[s].start !== en.t) bad++;
    });
    console.log("  entries pointing at a row of the WRONG segment: " + bad + "/" + out.timing.entries.length);
  }
  return accum.length;
}

// ══ SCENARIO C: PREMIUM /api/translate-table-v2 (gcp / madlad / google-free) ══
function scenarioPremium() {
  console.log("\n=== SCENARIO C (premium /api/translate-table-v2) ===");
  const segMeta = premiumSegmenter.segment(previewText);            // REAL premium segmenter
  const rows = segMeta.map((m) => ({ segment_index: m.index, he: m.he, he_niqqud: "", translit: "", ru: "ru" }));
  console.log("premium rows=" + rows.length + " (" + (rows.length / SEG_COUNT).toFixed(2) +
              " rows/segment) segment_index range=" + rows[0].segment_index + ".." + rows[rows.length - 1].segment_index +
              " (premium segmenter index is 1-based = row ordinal, NOT the ASR segment)");
  // true time of each premium row: which ASR line did this sentence come from
  const rowTrueTime = [];
  {
    let li = 0, consumed = 0;
    for (const m of segMeta) {
      const parts = V[li].text.split(". ").filter(Boolean).length;
      rowTrueTime.push(V[li].start);
      consumed++;
      if (consumed >= parts) { li++; consumed = 0; }
    }
  }
  const out = attachTiming({ rows, warnings: [] }, V, false);       // premium is NEVER seg-mode
  scoreTiming(out.timing, rowTrueTime, "  timing");
  if (out.mapCheck) console.log("  gate(segMode=false): dropReason=" + out.dropReason + " " + JSON.stringify(out.mapCheck));
  // defense in depth: even if someone DID mislabel this response as seg-mode
  const out2 = attachTiming({ rows, warnings: [] }, V, true);
  if (out2.mapCheck) console.log("  gate(segMode=true, defense-in-depth): dropReason=" + out2.dropReason + " " + JSON.stringify(out2.mapCheck));
}

// ══ SCENARIO D (K2): PREMIUM с source_line_index — караоке вернулось и оно верное ══
// Тот же реальный премиум-сегментатор и тот же оракул, что в C. Разница ровно одна: строки
// ответа несут line_index исходной строки. При FIXED=0 (эмуляция ДО-фиксного клиента) поле
// просто игнорируется и результат совпадает с C — тем и показано, что чинит именно гейт.
function scenarioPremiumK2() {
  console.log("\n=== SCENARIO D (K2: premium + source_line_index) ===");
  const segMeta = premiumSegmenter.segment(previewText);            // REAL premium segmenter
  const rows = segMeta.map((m) => ({ segment_index: m.index, source_line_index: m.line_index,
                                     he: m.he, he_niqqud: "", translit: "", ru: "ru" }));
  console.log("premium rows=" + rows.length + " (" + (rows.length / SEG_COUNT).toFixed(2) +
              " rows/segment) source_line_index range=" + rows[0].source_line_index + ".." +
              rows[rows.length - 1].source_line_index + " (0-based номер ИСХОДНОЙ строки = ASR-сегмента)");
  // Оракул — ТОТ ЖЕ, что в сценарии C, и он НЕ использует line_index: время строки выводится из
  // того, на сколько предложений делится текст своего ASR-сегмента (независимость оракула).
  const rowTrueTime = [], rowSeg = [];
  {
    let li = 0, consumed = 0;
    for (let n = 0; n < rows.length; n++) {
      const parts = V[li].text.split(". ").filter(Boolean).length;
      rowTrueTime.push(V[li].start); rowSeg.push(li);
      consumed++;
      if (consumed >= parts) { li++; consumed = 0; }
    }
  }
  const out = attachTiming({ rows, warnings: [] }, V, false, lines);
  scoreTiming(out.timing, rowTrueTime, "  timing");
  if (!out.timing) console.log("  dropReason=" + out.dropReason + " " + JSON.stringify(out.mapCheck || null));
  if (out.timing) {
    let bad = 0;
    out.timing.entries.forEach((en) => { const s = rowSeg[en.o]; if (V[s] == null || V[s].start !== en.t) bad++; });
    console.log("  entries pointing at a row of the WRONG segment: " + bad + "/" + out.timing.entries.length);
  }
  // и то же поле при переразбитом тексте (строк больше сегментов) — караоке обязано исчезнуть
  const editedLines = lines.concat(["שורה שהמשתמש הוסיף אחרי הייבוא"]);
  const outEdited = attachTiming({ rows, warnings: [] }, V, false, editedLines);
  console.log("  re-split text (lines=" + editedLines.length + " vs segments=" + V.length + "): " +
              (outEdited.timing ? "TIMING KEPT — BUG" : "no timing (" + outEdited.dropReason + ")"));
}

scenarioGemini("chunkRelative");
scenarioGemini("rowOrdinal");
scenarioPremium();
scenarioPremiumK2();
