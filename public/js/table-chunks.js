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

  function coverageForRows(rows, segmentCount) {
    var total = Math.max(0, Number(segmentCount) || 0), seen = new Set();
    (rows || []).forEach(function (row) {
      var index = row && row.segment_index;
      if (Number.isInteger(index) && index >= 0 && index < total) seen.add(index);
    });
    var missing = [];
    for (var i = 0; i < total; i++) if (!seen.has(i)) missing.push(i);
    return { covered: seen.size, missing: missing };
  }

  function buildRepairChunks(segments, missingIndexes, size) {
    var source = Array.isArray(segments) ? segments : [], limit = Math.max(1, Number(size) || CHUNK_SIZE);
    var indexes = Array.from(new Set((missingIndexes || []).filter(function (index) {
      return Number.isInteger(index) && index >= 0 && index < source.length;
    }))).sort(function (a, b) { return a - b; });
    var out = [];
    for (var base = 0; base < indexes.length; base += limit) {
      var part = indexes.slice(base, base + limit);
      out.push({ indexes: part, segs: part.map(function (globalIndex, localIndex) {
        return { i: localIndex, text: String(source[globalIndex] && source[globalIndex].text || '') };
      }) });
    }
    return out;
  }

  function restoreRepairRows(rows, indexes) {
    var map = Array.isArray(indexes) ? indexes : [];
    return (rows || []).filter(function (row) {
      return row && Number.isInteger(row.segment_index) && Number.isInteger(map[row.segment_index]);
    }).map(function (row) {
      var copy = Object.assign({}, row); copy.segment_index = map[row.segment_index]; return copy;
    });
  }

  function mergeRepairRows(existing, repaired) {
    var out = (existing || []).slice(), covered = new Set();
    out.forEach(function (row) { if (row && Number.isInteger(row.segment_index)) covered.add(row.segment_index); });
    (repaired || []).forEach(function (row) {
      if (!row || !Number.isInteger(row.segment_index) || covered.has(row.segment_index)) return;
      // One source segment may legitimately produce multiple learning rows. `covered` describes
      // the pre-repair table only, so retain every returned row for a previously missing segment.
      out.push(row);
    });
    return out.map(function (row, order) { return { row: row, order: order }; })
      .sort(function (a, b) {
        var ai = Number.isInteger(a.row && a.row.segment_index) ? a.row.segment_index : Number.MAX_SAFE_INTEGER;
        var bi = Number.isInteger(b.row && b.row.segment_index) ? b.row.segment_index : Number.MAX_SAFE_INTEGER;
        return ai - bi || a.order - b.order;
      }).map(function (entry) { return entry.row; });
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
              coverageForRows: coverageForRows, buildRepairChunks: buildRepairChunks,
              restoreRepairRows: restoreRepairRows, mergeRepairRows: mergeRepairRows,
              estimatePlainRows: estimatePlainRows };
  if (typeof window !== "undefined") window.TableChunks = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
