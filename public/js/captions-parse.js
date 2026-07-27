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

  // enforceCaps=false (merge:false, диагностический сырой разбор для оракульного гейта задачи 4)
  // пропускает MAX_SEGMENTS/MAX_SEG_TEXT — эти капы существуют ради контракта ingest/segTable.js
  // (что мы ОТПРАВЛЯЕМ на сервер), а сырой разбор ничего не отправляет. Плотный i и CAPTIONS_EMPTY
  // на нуле реплик — одинаковы в обоих режимах. Продуктовый путь (merge:true) капы получает как
  // раньше, ПОСЛЕ слияния. Обход капа этим не открывается: клиент (v3AudioSegmentsForRequest) и
  // сервер проверяют размер независимо.
  function finish(base, enforceCaps) {
    var segs = base.segments;
    if (!segs.length) return fail("CAPTIONS_EMPTY");
    if (enforceCaps !== false && segs.length > MAX_SEGMENTS) return fail("CAPTIONS_TOO_MANY");
    for (var k = 0; k < segs.length; k++) {
      if (enforceCaps !== false && segs[k].text.length > MAX_SEG_TEXT) return fail("CAPTIONS_TOO_MANY");
      segs[k].i = k; // плотный 0-based индекс — контракт ingest/segTable.js
    }
    base.ok = true;
    return base;
  }

  // §4.5: реплика субтитров — единица ПОКАЗА (нарезана под ширину экрана), а не единица языка.
  // Склеиваем соседние реплики до естественной границы предложения либо до mergeMaxSec, чтобы
  // строка таблицы была фразой, а не обрывком в 2,8 секунды. Старт сегмента = старт ПЕРВОЙ
  // реплики (никакой интерполяции, R11). Ни один символ не теряется.
  var SENTENCE_END_RE = /[.!?…:]["'»)\]]?\s*$/;
  var MERGE_PAUSE_SEC = 2;

  function mergeSegments(cues, maxSec) {
    var out = [], cur = null;
    for (var k = 0; k < cues.length; k++) {
      var c = cues[k];
      var breaks = !cur ||
        (c.start - cur.lastEnd) > MERGE_PAUSE_SEC ||         // пауза = смена реплики/мысли
        (c.end - cur.start) > maxSec ||                       // сегмент не длиннее maxSec
        SENTENCE_END_RE.test(cur.text);                       // предыдущая фраза закончена
      if (breaks) {
        if (cur) out.push({ i: out.length, start: cur.start, text: cur.text });
        cur = { start: c.start, lastEnd: c.end, text: c.text };
      } else {
        cur.text += " " + c.text;
        cur.lastEnd = c.end;
      }
    }
    if (cur) out.push({ i: out.length, start: cur.start, text: cur.text });
    return out;
  }

  // merge:false (оракульный режим задачи 4) — тот же массив реплик, без склейки.
  function toSegments(cues) {
    var out = [];
    for (var k = 0; k < cues.length; k++) out.push({ i: k, start: cues[k].start, text: cues[k].text });
    return out;
  }

  function parse(raw, opts) {
    var txt = normalise(raw);
    if (!txt.trim()) return fail("CAPTIONS_EMPTY");
    var format = (opts && opts.hint) || detectFormat(txt);
    // Похоже на субтитры (есть стрелка кью), но не разобралось — это другой диагноз,
    // чем «вставили просто текст»: пользователю нужны разные подсказки.
    if (!format) return fail(txt.indexOf("-->") >= 0 ? "CAPTIONS_UNPARSEABLE" : "CAPTIONS_NO_TIMESTAMPS");
    var doMerge = !(opts && opts.merge === false);
    var maxSec = (opts && Number(opts.mergeMaxSec)) || 15;
    if (format === "youtube-panel") return parsePanel(txt, doMerge, maxSec); // Task 3
    var cues = parseCueBlocks(txt);
    if (!cues.length) return fail("CAPTIONS_EMPTY");
    if (isRolling(cues)) return finish(fromRollingCues(cues, txt, doMerge, maxSec), doMerge); // Task 2
    var rawSegs = [];
    for (var c = 0; c < cues.length; c++) {
      var text = cleanText(cues[c].lines.join(" "));
      if (!text) continue;
      rawSegs.push({ start: cues[c].start, end: cues[c].end, text: text });
    }
    var segments = doMerge ? mergeSegments(rawSegs, maxSec) : toSegments(rawSegs);
    return finish({ format: format, rolling: false, language: languageFromHeader(txt),
                    kindHint: "unknown", segments: segments, droppedHeadings: 0, warnings: [],
                    cueCount: rawSegs.length, merged: doMerge }, doMerge);
  }

  // Катящиеся авто-субтитры YouTube: каждая реплика приходит трижды — как строка с пословными
  // тегами (новый текст), как 10-мс «доводочная» кью и как перенос в начале следующей кью.
  function isRolling(cues) {
    var tagged = 0;
    for (var i = 0; i < cues.length; i++) {
      for (var j = 0; j < cues[i].lines.length; j++) {
        if (WORD_TAG_RE.test(cues[i].lines[j])) { tagged++; break; }
      }
    }
    return tagged >= 3 && tagged >= cues.length * 0.2;
  }

  function fromRollingCues(cues, txt, doMerge, maxSec) {
    var rawSegs = [], lastText = "";
    for (var c = 0; c < cues.length; c++) {
      if (cues[c].end - cues[c].start < 0.05) continue; // «доводочная» кью — всегда повтор
      for (var l = 0; l < cues[c].lines.length; l++) {
        var rawLine = cues[c].lines[l];
        var text = cleanText(rawLine); // теги (в т.ч. пословные тайминги) срезаются здесь — R11
        if (!text) continue;
        var isNew = WORD_TAG_RE.test(rawLine);
        if (!isNew && text === lastText) continue; // перенос предыдущей реплики
        rawSegs.push({ start: cues[c].start, end: cues[c].end, text: text });
        lastText = text;
      }
    }
    var segments = doMerge ? mergeSegments(rawSegs, maxSec) : toSegments(rawSegs);
    return { format: "vtt", rolling: true, language: languageFromHeader(txt),
             kindHint: "auto", segments: segments, droppedHeadings: 0, warnings: [],
             cueCount: rawSegs.length, merged: doMerge };
  }

  // Копия панели «Расшифровка видео»: [название главы?] таймкод \n одна строка текста.
  // Названия глав идут БЕЗ таймкода и вклиниваются между текстом реплики и следующим таймкодом —
  // поэтому «лишние» строки внутри реплики трактуем как главы и отбрасываем со счётчиком.
  function parsePanel(txt, doMerge, maxSec) {
    var lines = txt.split("\n");
    var rawSegs = [], dropped = 0, curStart = null, curLines = [];
    function flush() {
      if (curStart === null) return;
      var text = cleanText(curLines[0] || "");
      dropped += Math.max(0, curLines.length - 1);
      if (text) rawSegs.push({ start: curStart, text: text });
      curStart = null; curLines = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = PANEL_TS_RE.exec(line);
      if (m) { flush(); curStart = hmsToSec(m[1], m[2], m[3], 0); continue; }
      if (curStart === null) { dropped++; continue; } // заголовок до первого таймкода
      curLines.push(line);
    }
    flush();
    // Сюда попадаем ТОЛЬКО когда detectFormat уже нашёл строку-таймкод — формат распознан,
    // значит «ноль реплик» здесь CAPTIONS_EMPTY, а не «таймкодов нет» (Task 3 review defect, Step 6).
    if (!rawSegs.length) return fail("CAPTIONS_EMPTY");
    // Панель даёт только старты реплик — конец реплики выводим как старт СЛЕДУЮЩЕЙ, а для
    // последней реплики берём её же старт (нулевая длительность хвоста безвредна — она влияет
    // только на то, может ли последняя реплика поглотить продолжение, которого нет).
    for (var s = 0; s < rawSegs.length; s++) {
      rawSegs[s].end = (s + 1 < rawSegs.length) ? rawSegs[s + 1].start : rawSegs[s].start;
    }
    var segments = doMerge ? mergeSegments(rawSegs, maxSec) : toSegments(rawSegs);
    return finish({ format: "youtube-panel", rolling: false, language: null, kindHint: "unknown",
                    segments: segments, droppedHeadings: dropped, warnings: [],
                    cueCount: rawSegs.length, merged: doMerge }, doMerge);
  }

  var API = { parse: parse, detectFormat: detectFormat, MAX_SEGMENTS: MAX_SEGMENTS, MAX_SEG_TEXT: MAX_SEG_TEXT };
  if (typeof window !== "undefined") window.CaptionsParse = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
