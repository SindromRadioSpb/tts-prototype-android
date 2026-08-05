// Pure row mapping for Studio local MT. No network or storage authority lives here.
(function () {
  "use strict";

  function segmentText(raw) {
    var lines = String(raw == null ? "" : raw).replace(/\r\n?/g, "\n").split("\n");
    var segments = [];
    lines.forEach(function (line, lineIndex) {
      if (!line.trim()) {
        segments.push({ index: segments.length, source_line_index: lineIndex, text: "" });
        return;
      }
      var pieces = line.match(/[^.!?…׃]+[.!?…׃]*|[.!?…׃]+/gu) || [line];
      pieces.map(function (piece) { return piece.trim(); }).filter(Boolean).forEach(function (piece) {
        segments.push({ index: segments.length, source_line_index: lineIndex, text: piece });
      });
    });
    return segments;
  }

  function buildRows(segments, result, sourceLang, targetLang, generatedAt) {
    if (!result || !Array.isArray(result.results) || result.results.length !== segments.length) {
      throw new Error("LOCAL_MT_RESULT_CARDINALITY_MISMATCH");
    }
    var model = result.model || {};
    return segments.map(function (segment, index) {
      var translated = result.results[index];
      if (!translated || translated.index !== index || typeof translated.text !== "string") {
        throw new Error("LOCAL_MT_RESULT_MAPPING_INVALID");
      }
      var meta = {
        provider: "madlad",
        model: model.identity || "",
        model_id: model.id || "",
        model_revision: model.revision || "",
        local_execution: true,
        request_id: result.request_id || "",
        input_checksum: result.input_checksum || "",
        source_lang: sourceLang,
        target_lang: targetLang,
        generatedAt: generatedAt,
        quality_positioning: "LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION",
      };
      return {
        segment_index: index,
        source_line_index: segment.source_line_index,
        he: sourceLang === "he" ? segment.text : translated.text,
        niqqud: "",
        translit: "",
        translit_sbl: "",
        translit_ru: "",
        ru: sourceLang === "ru" ? segment.text : translated.text,
        translation_provider: "madlad",
        translation_meta_json: JSON.stringify(meta),
      };
    });
  }

  async function translateSegments(options) {
    options = options || {};
    var client = options.client;
    var segments = Array.isArray(options.segments) ? options.segments : [];
    var sourceLang = String(options.sourceLang || "");
    var targetLang = String(options.targetLang || "");
    var batchSize = Math.max(1, Math.min(120, Number(options.batchSize) || 120));
    if (!client || typeof client.translate !== "function") throw new Error("LOCAL_MT_CLIENT_UNAVAILABLE");
    if (!((sourceLang === "he" && targetLang === "ru") || (sourceLang === "ru" && targetLang === "he"))) {
      throw new Error("LOCAL_MT_DIRECTION_UNSUPPORTED");
    }
    var rows = [];
    var lastResult = null;
    for (var offset = 0; offset < segments.length; offset += batchSize) {
      var chunk = segments.slice(offset, offset + batchSize);
      if (typeof options.onBatch === "function") options.onBatch({ offset: offset, size: chunk.length, total: segments.length });
      var result = await client.translate(
        chunk.map(function (segment) { return String(segment.text == null ? "" : segment.text); }),
        sourceLang,
        targetLang,
        { signal: options.signal, onStatus: options.onStatus }
      );
      var chunkRows = buildRows(chunk, result, sourceLang, targetLang, new Date().toISOString());
      chunkRows.forEach(function (row, localIndex) {
        row.segment_index = offset + localIndex;
        rows.push(row);
      });
      lastResult = result;
    }
    if (rows.length !== segments.length) throw new Error("LOCAL_MT_RESULT_CARDINALITY_MISMATCH");
    return { rows: rows, result: lastResult };
  }

  function persistTableCache(storage, key, payload) {
    try {
      storage.setItem(String(key), JSON.stringify(payload));
      return { stored: true, error_code: null };
    } catch (error) {
      var name = String(error && error.name || "").trim();
      var code = name && name !== "Error"
        ? name
        : String(error && error.code || "LOCAL_MT_TABLE_CACHE_WRITE_FAILED");
      return { stored: false, error_code: code };
    }
  }

  var API = {
    segmentText: segmentText,
    buildRows: buildRows,
    translateSegments: translateSegments,
    persistTableCache: persistTableCache,
  };
  if (typeof window !== "undefined") window.LocalMtTable = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
