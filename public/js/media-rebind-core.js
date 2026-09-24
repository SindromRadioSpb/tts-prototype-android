// Ремонт карточек, сохранённых без медиа (владелец, «Хан Юнес», 2026-09-24).
// Строки такой карточки собраны плоским путём: модель склеивала подряд идущие реплики транскрипта
// в одну строку (241 реплика → 133 строки). AsrTranscript.alignRowsToSegmentsPartialProven ищет
// строку ВНУТРИ одной реплики и склеенную строку не находит. Здесь строка ищется в потоке слов
// всех реплик: точное пословное вхождение, только вперёд по времени, строка получает время своей
// ПЕРВОЙ реплики. Ничего не угадывается: не совпало слово в слово — строка остаётся без ▶.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MediaRebindCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Дальше этого окна строка не ищется: промах на десятки слов вперёд означает не пропуск,
  // а чужой текст, и привязка там была бы угадыванием.
  var SEARCH_WINDOW_WORDS = 60;
  // Ниже этой доли строк с ▶ ремонт без пересборки не считается достаточным.
  var REBUILD_THRESHOLD = 0.8;

  function resolveNormalize(deps) {
    var fn = deps && deps.normalize;
    if (typeof fn !== "function" && typeof globalThis !== "undefined" && globalThis.AsrTranscript) {
      fn = globalThis.AsrTranscript.stitchNormalizeWords;
    }
    if (typeof fn !== "function") throw new Error("REBIND_NORMALIZE_REQUIRED");
    return function (text) { return fn(String(text == null ? "" : text)) || []; };
  }

  function alignRowsToSegmentSpans(rowTexts, segments, deps) {
    var words = resolveNormalize(deps);
    var rows = Array.isArray(rowTexts) ? rowTexts : [];
    var segs = Array.isArray(segments) ? segments : [];
    var stream = [];
    segs.forEach(function (segment, s) {
      words(segment && segment.text).forEach(function (w) { stream.push({ w: w, seg: s }); });
    });
    var cursor = 0, bound = 0, out = [];
    for (var r = 0; r < rows.length; r++) {
      var needle = words(rows[r]);
      var found = -1;
      if (needle.length) {
        var limit = Math.min(stream.length - needle.length, cursor + SEARCH_WINDOW_WORDS);
        outer: for (var from = cursor; from <= limit; from++) {
          for (var k = 0; k < needle.length; k++) if (stream[from + k].w !== needle[k]) continue outer;
          found = from; break;
        }
      }
      if (found < 0) { out.push({ row_index: r, segment_index: null }); continue; }
      out.push({ row_index: r, segment_index: stream[found].seg });
      cursor = found + needle.length;
      bound++;
    }
    return { rows: out, bound: bound, total: rows.length };
  }

  function planRebind(rowTexts, revision, deps) {
    var segments = revision && Array.isArray(revision.segments) ? revision.segments : [];
    var aligned = alignRowsToSegmentSpans(rowTexts, segments, deps);
    var mappingRows = [];
    aligned.rows.forEach(function (row) {
      if (row.segment_index == null) return;
      var id = segments[row.segment_index] && segments[row.segment_index].caption_segment_id;
      if (id) mappingRows.push({ row_index: row.row_index, caption_segment_id: String(id) });
    });
    var total = aligned.total, ratio = total ? mappingRows.length / total : 0;
    return { mapping: { rows: mappingRows, provenance_basis: "rebind-span-alignment-v1" },
      bound: mappingRows.length, total: total, ratio: ratio, needsRebuild: ratio < REBUILD_THRESHOLD };
  }

  // Дешёвый предфильтр поиска со стороны видео: первые слова текста карточки совпадают с первыми
  // словами транскрипта. Полное выравнивание — только для прошедших.
  var OPENING_WORDS = 8;
  function sharesOpening(sourceText, segments, deps) {
    var words = resolveNormalize(deps);
    var card = words(sourceText).slice(0, OPENING_WORDS);
    if (card.length < Math.min(3, OPENING_WORDS)) return false;
    var stream = [];
    for (var i = 0; i < (segments || []).length && stream.length < card.length; i++) {
      stream = stream.concat(words(segments[i] && segments[i].text));
    }
    for (var k = 0; k < card.length; k++) if (stream[k] !== card[k]) return false;
    return true;
  }

  // Цель ремонта — транскрипт, объясняющий больше всего строк. Равенство двух лучших — не повод
  // выбрать любой: это отказ, как у резолвера медиа-контекста.
  function chooseCandidate(candidates) {
    var list = (Array.isArray(candidates) ? candidates : []).filter(function (c) { return c && c.plan && c.plan.bound > 0; });
    if (!list.length) return { candidate: null, reason: "NO_MATCH" };
    list.sort(function (a, b) { return b.plan.bound - a.plan.bound; });
    if (list.length > 1 && list[1].plan.bound === list[0].plan.bound) return { candidate: null, reason: "AMBIGUOUS" };
    return { candidate: list[0], reason: null };
  }

  return { alignRowsToSegmentSpans: alignRowsToSegmentSpans, planRebind: planRebind, chooseCandidate: chooseCandidate, sharesOpening: sharesOpening,
    SEARCH_WINDOW_WORDS: SEARCH_WINDOW_WORDS, REBUILD_THRESHOLD: REBUILD_THRESHOLD };
});
