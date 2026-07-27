// public/js/captions-parse.js
// W2-S5a · Разбор субтитров: WebVTT / SRT / вставка панели «Расшифровка видео» YouTube →
// [{i,start,text}] — формат, который уже принимает конвейер S4 (asr-transcript.js).
// Pure-ядро, dual-export по образцу asr-transcript.js.
// Канон: docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md §5.1.
// R11: пословные тайминги авто-субтитров ОТБРАСЫВАЮТСЯ — только сегмент-уровень.
(function () {
  "use strict";

  // Зеркало ingest/segTable.js:8-9 — расхождение ловится тестом в этом же файле.
  var MAX_SEGMENTS = 400;
  var MAX_SEG_TEXT = 2000;

  var CUE_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})(?:\s+(.*))?$/;
  var PANEL_TS_RE = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;
  var WORD_TAG_RE = /<\d{1,2}:\d{2}:\d{2}\.\d{1,3}>|<\/?c[^>]*>/;
  var ANY_TAG_RE = /<[^>]*>/g;
  var ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&quot;": '"',
                   "&#39;": "'", "&lrm;": "‎", "&rlm;": "‏" };
  var ENTITY_RE = /&(?:amp|lt|gt|nbsp|quot|#39|lrm|rlm);/g;

  function hmsToSec(h, m, s, ms) {
    return (Number(h) || 0) * 3600 + Number(m) * 60 + Number(s) + Number(String(ms).padEnd(3, "0")) / 1000;
  }

  function cleanText(line) {
    return String(line)
      .replace(ANY_TAG_RE, "")
      .replace(ENTITY_RE, function (m) { return ENTITIES[m]; })
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalise(raw) {
    return String(raw == null ? "" : raw).replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function detectFormat(raw) {
    var txt = normalise(raw);
    if (!txt.trim()) return null;
    if (/^WEBVTT/.test(txt.trim())) return "vtt";
    var lines = txt.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (CUE_RE.test(l)) return l.indexOf(",") >= 0 ? "srt" : "vtt";
      if (PANEL_TS_RE.test(l)) return "youtube-panel";
    }
    return null;
  }

  // ВАЖНО: блоки WEBVTT/SRT разделяются ТОЛЬКО по-настоящему пустой строкой.
  // YouTube кладёт в тело кью строки из одного пробела — "\n \n" это ТЕКСТ, не разделитель.
  function parseCueBlocks(txt) {
    var blocks = txt.split("\n\n");
    var cues = [];
    for (var b = 0; b < blocks.length; b++) {
      var lines = blocks[b].split("\n");
      var idx = -1;
      for (var i = 0; i < lines.length; i++) { if (CUE_RE.test(lines[i].trim())) { idx = i; break; } }
      if (idx < 0) continue;
      var m = lines[idx].trim().match(CUE_RE);
      cues.push({
        start: hmsToSec(m[1], m[2], m[3], m[4]),
        end: hmsToSec(m[5], m[6], m[7], m[8]),
        lines: lines.slice(idx + 1),
      });
    }
    return cues;
  }

  function languageFromHeader(txt) {
    var m = /^Language:\s*([A-Za-z-]+)\s*$/m.exec(txt.split("\n\n")[0] || "");
    return m ? m[1] : null;
  }

  function fail(code) {
    return { ok: false, format: null, rolling: false, language: null, kindHint: "unknown",
             segments: [], droppedHeadings: 0, warnings: [], error_code: code };
  }

  function finish(base) {
    var segs = base.segments;
    if (!segs.length) return fail("CAPTIONS_EMPTY");
    if (segs.length > MAX_SEGMENTS) return fail("CAPTIONS_TOO_MANY");
    for (var k = 0; k < segs.length; k++) {
      if (segs[k].text.length > MAX_SEG_TEXT) return fail("CAPTIONS_TOO_MANY");
      segs[k].i = k; // плотный 0-based индекс — контракт ingest/segTable.js
    }
    base.ok = true;
    return base;
  }

  function parse(raw, opts) {
    var txt = normalise(raw);
    if (!txt.trim()) return fail("CAPTIONS_EMPTY");
    var format = (opts && opts.hint) || detectFormat(txt);
    // Похоже на субтитры (есть стрелка кью), но не разобралось — это другой диагноз,
    // чем «вставили просто текст»: пользователю нужны разные подсказки.
    if (!format) return fail(txt.indexOf("-->") >= 0 ? "CAPTIONS_UNPARSEABLE" : "CAPTIONS_NO_TIMESTAMPS");
    if (format === "youtube-panel") return parsePanel(txt);        // Task 3
    var cues = parseCueBlocks(txt);
    if (!cues.length) return fail("CAPTIONS_EMPTY");
    if (isRolling(cues)) return finish(fromRollingCues(cues, txt)); // Task 2
    var segments = [];
    for (var c = 0; c < cues.length; c++) {
      var text = cleanText(cues[c].lines.join(" "));
      if (!text) continue;
      segments.push({ i: segments.length, start: cues[c].start, text: text });
    }
    return finish({ format: format, rolling: false, language: languageFromHeader(txt),
                    kindHint: "unknown", segments: segments, droppedHeadings: 0, warnings: [] });
  }

  // Заглушки задач 2 и 3 — заменяются в них целиком.
  function isRolling() { return false; }
  function fromRollingCues() { return null; }
  function parsePanel() { return fail("CAPTIONS_UNPARSEABLE"); }

  var API = { parse: parse, detectFormat: detectFormat, MAX_SEGMENTS: MAX_SEGMENTS, MAX_SEG_TEXT: MAX_SEG_TEXT };
  if (typeof window !== "undefined") window.CaptionsParse = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
