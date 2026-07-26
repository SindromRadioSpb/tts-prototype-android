// ingest/tableRows.js
// Extracted from server.js (was the inline "9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ GEMINI"
// section) during W2-S4 Task 6 fix round 1, to give buildRowsFromGeminiPayload its
// own regression-test surface. Body kept byte-identical to the server.js version
// apart from the opts.keepSegmentIndex heBase fix below (R11: seg-mode review
// finding — see the inline comment at the fix site for details).
"use strict";

function buildRowsFromGeminiPayload(parsed, options, opts) {
  opts = opts || {};
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Пустой ответ от Gemini");
  }

  const direction = (options && options.direction) || "he-ru";
  const rows = Array.isArray(parsed.rows) ? parsed.rows : null;
  const segments = Array.isArray(parsed.segments) ? parsed.segments : null;

  if (!rows || rows.length === 0) {
    throw new Error("Пустой массив rows");
  }

  const segMap = new Map();
  if (segments && segments.length > 0) {
    segments.forEach((seg, idx) => {
      if (!seg || typeof seg !== "object") return;
      let index = seg.index;
      if (
        typeof index !== "number" ||
        !Number.isFinite(index) ||
        index <= 0
      ) {
        index = idx + 1;
      }
      const heBase = (seg.he || "").trim();
      if (heBase) {
        segMap.set(index, heBase);
      }
    });
  }

  let droppedEmptyHe = 0;

  const preparedRows = rows
    .map((row, idx) => {
      if (!row || typeof row !== "object") row = {};
      let segIndex = row.segment_index;
      if (
        typeof segIndex !== "number" ||
        !Number.isFinite(segIndex) ||
        segIndex <= 0
      ) {
        segIndex = idx + 1;
      }

      let heBase;
      if (opts.keepSegmentIndex) {
        // W2-S4 fix (Task 6 review round 1, Critical/R11): the seg-mode prompt
        // (ingest/segTable.js HE_RU_SEG_PROMPT) guarantees every row already
        // carries its OWN Hebrew as row.he — use it directly. The segMap/segIndex
        // lookup below exists for the legacy 1-based he-ru/any-he prompts only:
        // its "index <= 0 -> idx + 1" normalization was written for those 1-based
        // segment indices and silently collides on 0-based segment_index 0 (both
        // segment 0 and segment 1 normalize to key 1), corrupting row 0's he with
        // segment 1's text. Bypass that legacy path entirely in segMode.
        heBase = (row.he || "").trim();
      } else if (direction === "any-he") {
        // R11: in any-he, parsed.segments[].he holds the SOURCE-language
        // text (kept only for alignment, per ANY_HE_PROMPT), not Hebrew.
        // Never let it backfill the Hebrew column here — use row.he only;
        // rows with an empty Hebrew translation are dropped below instead.
        heBase = (row.he || "").trim();
      } else {
        heBase = segMap.get(segIndex);
        if (!heBase) {
          heBase = (row.he || "").trim();
        }
      }

      const out = {
        segmentId: segIndex,
        he: heBase || "",
        he_niqqud: row.he_niqqud || "",
        translit: row.translit || "",
        ru: row.ru || "",
      };
      if (opts.keepSegmentIndex && Number.isInteger(row.segment_index)) {
        out.segment_index = row.segment_index;
      }
      return out;
    })
    .filter((row) => {
      if (direction === "any-he" && !row.he) {
        droppedEmptyHe += 1;
        return false;
      }
      return true;
    });

  if (droppedEmptyHe > 0) {
    console.warn(
      `translate-table any-he: dropped ${droppedEmptyHe} row(s) with empty he (no fallback to source-language segments, R11)`
    );
  }

  return preparedRows;
}

module.exports = { buildRowsFromGeminiPayload };
