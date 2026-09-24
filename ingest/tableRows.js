// ingest/tableRows.js
// Extracted from server.js (was the inline "9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ GEMINI"
// section) during W2-S4 Task 6 fix round 1, to give buildRowsFromGeminiPayload its
// own regression-test surface. Body kept byte-identical to the server.js version
// apart from the opts.keepSegmentIndex heBase fix below (R11: seg-mode review
// finding — see the inline comment at the fix site for details).
"use strict";

const HEBREW_MARKS_RE = /[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g;
// \u041d\u0435\u0432\u0438\u0434\u0438\u043c\u044b\u0435 \u0443\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0449\u0438\u0435 \u0437\u043d\u0430\u043a\u0438 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u0438 \u043d\u0443\u043b\u0435\u0432\u043e\u0439 \u0448\u0438\u0440\u0438\u043d\u044b: \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u044b \u0441\u0442\u0430\u0432\u044f\u0442 U+202B \u043f\u0435\u0440\u0435\u0434 \u043a\u0430\u0436\u0434\u043e\u0439
// \u0440\u0435\u043f\u043b\u0438\u043a\u043e\u0439, \u0430 \u043c\u043e\u0434\u0435\u043b\u044c \u0438\u0445 \u043d\u0435 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u0435\u0442. \u042d\u0442\u043e \u0440\u0430\u0437\u043c\u0435\u0442\u043a\u0430, \u0430 \u043d\u0435 \u0442\u0435\u043a\u0441\u0442, \u2014 \u0432 \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0438 \u0435\u0439 \u043d\u0435 \u043c\u0435\u0441\u0442\u043e.
const INVISIBLE_FORMAT_RE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff\u061c]/g;
// \u0420\u0430\u0441\u0442\u044f\u043d\u0443\u0442\u043e\u0435 \u043c\u0435\u0436\u0434\u043e\u043c\u0435\u0442\u0438\u0435 (\u00ab\u05d5\u05d5\u05d5\u05d5\u05d5\u05d5\u2026\u00bb) \u043c\u043e\u0434\u0435\u043b\u044c \u043f\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u044b\u0432\u0430\u0435\u0442 \u0441 \u0442\u043e\u0447\u043d\u043e\u0441\u0442\u044c\u044e \u00b11 \u0431\u0443\u043a\u0432\u0430.
const ELONGATED_RUN_RE = /(\p{L})\1{2,}/gu;
const { normalizeRows: canonicalizeKnownNiqqudRows } = require("../public/js/table-niqqud-normalizer.js");
const sourceRecovery = require('../public/js/table-source-recovery');

function comparableHebrewBase(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(HEBREW_MARKS_RE, "")
    .normalize("NFC")
    .replace(INVISIBLE_FORMAT_RE, "")
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

function validateNiqqudBase(rows) {
  rows.forEach((row, index) => {
    const plain = comparableHebrewBase(row && row.he);
    const niqqud = comparableHebrewBase(row && row.he_niqqud);
    if (!niqqud) {
      // Строка, которую модель не смогла огласовать, не переписав источник, едет БЕЗ огласовки —
      // но только с явной пометкой (решение владельца 2026-09-11, вариант A). Молчаливо пустая
      // огласовка по-прежнему фейлит закрыто: пометка и есть то, что отличает честный пробел от
      // потери. Требование «не менять согласные» ниже действует и для помеченных строк.
      if (row && row.niqqud_status === "not_vocalized") return;
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
  // Длина растянутого повтора не несёт смысла: сравниваем его как «буква трижды».
  const source = comparableHebrewBase(sourceText).replace(ELONGATED_RUN_RE, "$1$1$1");
  const rendered = comparableHebrewBase((rows || []).map((row) => row && row.he || "").join(""))
    .replace(ELONGATED_RUN_RE, "$1$1$1");
  if (source !== rendered) {
    throw semanticError("HE_SOURCE_COVERAGE_MISMATCH", "Gemini rows do not preserve the complete source Hebrew", {
      sourceLength: source.length,
      renderedLength: rendered.length,
    });
  }
}

function prepareRowsFromGeminiPayload(parsed, options, opts) {
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

  // Наши собственные реплики запроса — источник истины о тексте; эхо модели им не является.
  const sourceByIndex = new Map();
  for (const seg of (Array.isArray(opts.sourceSegments) ? opts.sourceSegments : [])) {
    if (!seg || typeof seg !== "object") continue;
    const key = Number.isInteger(seg.i) ? seg.i : (Number.isInteger(seg.index) ? seg.index : null);
    const text = String(seg.text == null ? "" : seg.text).trim();
    if (key !== null && text) sourceByIndex.set(key, text);
  }

  let droppedEmptyHe = 0;
  const sourceRowCounts = new Map();
  for (const row of rows) if (Number.isInteger(row?.segment_index)) sourceRowCounts.set(row.segment_index, (sourceRowCounts.get(row.segment_index) || 0) + 1);

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
        // Прод-инцидент 2026-09-11: реплика с ASCII-кавычкой внутри (`לחו"ל`) возвращалась с
        // ОБОРВАННЫМ на этой кавычке эхо-полем he, хотя огласовка приходила целой. Валидатор затем
        // обвинял огласовку в «изменении источника», и вся таблица вставала. Источник — НАШ текст,
        // и когда эхо оказалось лишь его началом, восстанавливаем его целиком. Любое ДРУГОЕ
        // расхождение не трогаем: оно может означать сбитое соответствие строк, и подмена там
        // склеила бы чужой перевод с нашей репликой (R11).
        const ours = sourceByIndex.get(row.segment_index);
        // Only a whole, uniquely mapped segment can replace its echo. A split
        // segment must not be expanded into several duplicate full paragraphs.
        if (ours && sourceRowCounts.get(row.segment_index) === 1) {
          const repaired = sourceRecovery.recoverRow(row, ours);
          if (repaired) { row = repaired; heBase = row.he; }
          else if (heBase && ours !== heBase && ours.startsWith(heBase)) heBase = ours;
        }
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
      // Пометка едет вместе со строкой: поверхность обязана иметь возможность сказать о пробеле.
      if (row.niqqud_status === "not_vocalized") out.niqqud_status = "not_vocalized";
      if (row.niqqud_source === "dicta") out.niqqud_source = "dicta";
      if (row.source_recovery) out.source_recovery = row.source_recovery;
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

function buildRowsFromGeminiPayload(parsed, options, opts) {
  const rows = prepareRowsFromGeminiPayload(parsed, options, opts);
  validateNiqqudBase(rows);
  return rows;
}

module.exports = {
  buildRowsFromGeminiPayload,
  prepareRowsFromGeminiPayload,
  canonicalizeKnownNiqqudRows,
  comparableHebrewBase,
  comparableHebrewConsonantalSkeleton,
  validateNiqqudBase,
  validateHebrewSourceCoverage,
};
