// ingest/tableRows.js
// Extracted from server.js (was the inline "9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ GEMINI"
// section) during W2-S4 Task 6 fix round 1, to give buildRowsFromGeminiPayload its
// own regression-test surface. Body kept byte-identical to the server.js version
// apart from the opts.keepSegmentIndex heBase fix below (R11: seg-mode review
// finding — see the inline comment at the fix site for details).
"use strict";

const HEBREW_MARKS_RE = /[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g;
const HEBREW_TOKEN_RE = /[א-ת\u0591-\u05c7]+/g;

// Small, reviewable local lexicon for terms whose machine niqqud has already
// failed owner QA. The plain Hebrew remains source truth; only the derived
// niqqud layer is replaced. Exact prefixed forms are intentional: Hebrew
// proclitic vowels are context-sensitive, so guessing arbitrary prefixes here
// would be less safe than extending this audited map when a new case appears.
const KNOWN_NIQQUD_CANONICAL = new Map([
  ["אופנוע", { term: "אופנוע", plain: "אופנוע", value: "אוֹפַנּוֹעַ" }],
  ["האופנוע", { term: "האופנוע", plain: "האופנוע", value: "הָאוֹפַנּוֹעַ" }],
  ["כשהאופנוע", { term: "כשהאופנוע", plain: "כשהאופנוע", value: "כְּשֶׁהָאוֹפַנּוֹעַ" }],
  ["אפקי", { term: "אופקי", plain: "אופקי", value: "אָפְקִי" }],
  ["אופקי", { term: "אופקי", plain: "אופקי", value: "אָפְקִי" }],
  ["ואפקי", { term: "אופקי", plain: "ואופקי", value: "וְאָפְקִי" }],
  ["ואופקי", { term: "אופקי", plain: "ואופקי", value: "וְאָפְקִי" }],
]);

function comparableHebrewBase(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(HEBREW_MARKS_RE, "")
    .normalize("NFC")
    .replace(/[־–—]/g, "-")
    .replace(/״/g, '"')
    .replace(/׳/g, "'")
    .replace(/\s+/g, "")
    .trim();
}

// Fully vocalized Hebrew is normally written in ktiv haser while the source
// OCR is often ktiv male. Removing matres lectionis gives us a conservative
// consonantal guard: שתיים/שְׁתַּיִם and ואופקי/וְאָפְקִי pass, but a lexical
// rewrite such as שווה/שְׁוַת still fails because it introduces ת.
function comparableHebrewConsonantalSkeleton(value) {
  return comparableHebrewBase(value).replace(/[אהוי]/g, "");
}

function semanticError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details || null;
  return error;
}

function canonicalizeKnownNiqqudRows(rows) {
  const corrections = [];
  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row, rowIndex) => {
    const next = { ...(row || {}) };
    const plainTokens = new Set(String(next.he || "").match(/[א-ת]+/g) || []);
    const before = String(next.he_niqqud || "");
    next.he_niqqud = before.replace(HEBREW_TOKEN_RE, (token) => {
      const key = comparableHebrewBase(token);
      const canonical = KNOWN_NIQQUD_CANONICAL.get(key);
      if (!canonical || !plainTokens.has(canonical.plain) || canonical.value === token) return token;
      corrections.push({ rowIndex, term: canonical.term, from: token, to: canonical.value });
      return canonical.value;
    });
    return next;
  });
  return { rows: normalizedRows, corrections };
}

function validateNiqqudBase(rows) {
  rows.forEach((row, index) => {
    const plain = comparableHebrewBase(row && row.he);
    const niqqud = comparableHebrewBase(row && row.he_niqqud);
    if (!niqqud) {
      throw semanticError("HE_NIQQUD_MISSING", `Row ${index} has no vocalized Hebrew`, { index });
    }
    if (plain !== niqqud
        && comparableHebrewConsonantalSkeleton(plain) !== comparableHebrewConsonantalSkeleton(niqqud)) {
      throw semanticError("HE_NIQQUD_CONSONANT_MISMATCH", `Row ${index} changes Hebrew consonants while adding niqqud`, {
        index,
        he: row && row.he,
        he_niqqud: row && row.he_niqqud,
      });
    }
  });
}

function validateHebrewSourceCoverage(rows, sourceText) {
  const source = comparableHebrewBase(sourceText);
  const rendered = comparableHebrewBase((rows || []).map((row) => row && row.he || "").join(""));
  if (source !== rendered) {
    throw semanticError("HE_SOURCE_COVERAGE_MISMATCH", "Gemini rows do not preserve the complete source Hebrew", {
      sourceLength: source.length,
      renderedLength: rendered.length,
    });
  }
}

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

  validateNiqqudBase(preparedRows);

  if (droppedEmptyHe > 0) {
    console.warn(
      `translate-table any-he: dropped ${droppedEmptyHe} row(s) with empty he (no fallback to source-language segments, R11)`
    );
  }

  return preparedRows;
}

module.exports = {
  buildRowsFromGeminiPayload,
  canonicalizeKnownNiqqudRows,
  comparableHebrewBase,
  comparableHebrewConsonantalSkeleton,
  validateNiqqudBase,
  validateHebrewSourceCoverage,
};
