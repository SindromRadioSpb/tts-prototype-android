// public/js/table-chunks.js
// W2-S12 · Pure чанк-математика таблицы (dual-export по образцу asr-transcript.js).
// Канон: docs/planning/STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md §4.4.
// Стена: 65,536 out-ток/вызов при ~220 ток/строку ≈ 287 строк (замер 2026-07-28).
(function () {
  "use strict";

  // ~26k out-ток на кусок ≈ 2.4× запас до лимита. Смена размера инвалидирует серверный
  // кэш кусков (другой cleanText) — менять только осознанно, с новым замером.
  var CHUNK_SIZE = 120;

  function buildChunks(segments) {
    var out = [];
    var list = Array.isArray(segments) ? segments : [];
    for (var a = 0; a < list.length; a += CHUNK_SIZE) {
      var slice = list.slice(a, a + CHUNK_SIZE);
      out.push({ base: a, segs: slice.map(function (s, j) { return { i: j, text: s.text }; }) });
    }
    return out;
  }

  function offsetRows(rows, base) {
    return (rows || []).map(function (r) {
      if (r && Number.isInteger(r.segment_index)) {
        var c = Object.assign({}, r);
        c.segment_index = r.segment_index + base;
        return c;
      }
      return r;
    });
  }

  // Серверный warning SEG_COVERAGE_PARTIAL не несёт списка пропусков — клиент считает сам
  // (independent-oracle: по фактическим строкам, не по чужому флагу).
  function coverageForChunk(rows, chunkLen) {
    var seen = new Set();
    (rows || []).forEach(function (r) {
      if (r && Number.isInteger(r.segment_index)) seen.add(r.segment_index);
    });
    var missing = [];
    for (var i = 0; i < chunkLen; i++) if (!seen.has(i)) missing.push(i);
    return { missing: missing };
  }

  function aggregateMissing(perChunk) {
    var out = [];
    (perChunk || []).forEach(function (c) {
      (c.missing || []).forEach(function (m) { out.push(m + c.base); });
    });
    return out;
  }

  // Guard плоского пути (без сегментов): оценка строк будущей таблицы.
  // ~100 символов на строку — консервативно к замеренным 58 символам субтитровой реплики.
  function estimatePlainRows(text) {
    var t = String(text == null ? "" : text);
    var lines = t.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).length;
    var chars = t.replace(/\s+/g, " ").trim().length;
    return Math.max(lines, Math.ceil(chars / 100));
  }

  var API = { CHUNK_SIZE: CHUNK_SIZE, buildChunks: buildChunks, offsetRows: offsetRows,
              coverageForChunk: coverageForChunk, aggregateMissing: aggregateMissing,
              estimatePlainRows: estimatePlainRows };
  if (typeof window !== "undefined") window.TableChunks = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
