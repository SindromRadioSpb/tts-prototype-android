// public/js/table-chunks.js
// W2-S12 · Pure чанк-математика таблицы (dual-export по образцу asr-transcript.js).
// Канон: docs/planning/STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md §4.4.
// Стена: 65,536 out-ток/вызов при ~220 ток/строку ≈ 287 строк (замер 2026-07-28).
(function () {
  "use strict";

  // ~26k out-ток на кусок ≈ 2.4× запас до лимита. Смена размера инвалидирует серверный
  // кэш кусков (другой cleanText) — менять только осознанно, с новым замером.
  var CHUNK_SIZE = 120;
  // Gemini 3.7 Flash has a 65,536-token output ceiling.  The measured table
  // envelope is about 220 output tokens per semantic source segment, so 250
  // remains the single-request safety budget.  It is NOT a document limit:
  // larger flat documents are routed through the resumable chunk path below.
  var SINGLE_REQUEST_SAFE_SEGMENTS = 250;
  var MAX_SEGMENT_TEXT = 2000;

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

  // PDF OCR keeps visual line wrapping.  Those wraps are layout, not semantic
  // rows.  Preserve blank-paragraph boundaries while joining only the lines
  // inside each paragraph.  Provider evidence remains untouched; this is the
  // deterministic table-input projection recorded in import provenance.
  function reflowDocumentText(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n")
      .split(/\n\s*\n+/)
      .map(function (paragraph) {
        return paragraph.split("\n").map(function (line) { return line.trim(); })
          .filter(Boolean).join(" ");
      })
      .filter(Boolean).join("\n");
  }

  function splitOversizeSegment(text, maxText) {
    var limit = Math.max(200, Number(maxText) || MAX_SEGMENT_TEXT);
    var rest = String(text || "").trim(), out = [];
    while (rest.length > limit) {
      var cut = rest.lastIndexOf(" ", limit);
      if (cut < Math.floor(limit * 0.6)) cut = limit;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out;
  }

  // Build semantic flat-text segments for capacity planning and, only when
  // needed, for the existing resumable Gemini chunk cycle.  A PDF paragraph
  // is already the owner-visible semantic row after visual-wrap reflow; do not
  // explode it into sentences, which would turn an ordinary 14-page worksheet
  // into several paid requests.  Only an individually oversized paragraph is
  // split to stay inside the server's per-segment input contract.
  function buildPlainSegments(text, opts) {
    var maxText = opts && opts.maxSegmentText;
    var normalized = String(text == null ? "" : text).replace(/\r\n?/g, "\n"), pieces = [];
    normalized.split("\n").forEach(function (paragraph) {
      splitOversizeSegment(paragraph, maxText).forEach(function (part) {
        if (part) pieces.push(part);
      });
    });
    return pieces.map(function (piece, index) { return { i: index, text: piece }; });
  }

  function plainRequestPlan(text) {
    // PDF layout normalization belongs to StudioImport, where source provenance
    // proves that the text is OCR-derived.  At this generic table boundary a
    // single newline may be an intentional owner-authored semantic row, so a
    // second reflow would merge valid rows and is forbidden.
    var reflowedText = String(text == null ? "" : text).replace(/\r\n?/g, "\n").trim();
    var segments = buildPlainSegments(reflowedText);
    return {
      reflowedText: reflowedText,
      segments: segments,
      semanticSegments: segments.length,
      requiresChunking: segments.length > SINGLE_REQUEST_SAFE_SEGMENTS,
      expectedRequests: segments.length > SINGLE_REQUEST_SAFE_SEGMENTS
        ? Math.ceil(segments.length / CHUNK_SIZE) : (segments.length ? 1 : 0),
    };
  }

  var API = { CHUNK_SIZE: CHUNK_SIZE, buildChunks: buildChunks, offsetRows: offsetRows,
              coverageForChunk: coverageForChunk, aggregateMissing: aggregateMissing,
              coverageForRows: coverageForRows, buildRepairChunks: buildRepairChunks,
              restoreRepairRows: restoreRepairRows, mergeRepairRows: mergeRepairRows,
              estimatePlainRows: estimatePlainRows,
              SINGLE_REQUEST_SAFE_SEGMENTS: SINGLE_REQUEST_SAFE_SEGMENTS,
              MAX_SEGMENT_TEXT: MAX_SEGMENT_TEXT,
              reflowDocumentText: reflowDocumentText,
              buildPlainSegments: buildPlainSegments,
              plainRequestPlan: plainRequestPlan };
  if (typeof window !== "undefined") window.TableChunks = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
