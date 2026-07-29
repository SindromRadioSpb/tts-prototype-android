// public/js/asr-transcript.js
// W2-S4 · ASR-контракт (Gemini аудио) + валидация сегмент-тайминга (R11: honest) + смета (R16).
// Pure-ядро, dual-export (browser window.AsrTranscript + Node module.exports) по образцу studio-karaoke.js.
// Канон: docs/planning/STUDIO_INGEST_W2_S4_AUDIO_KARAOKE_DESIGN_2026_07_26.md §3.1-3.2.
(function () {
  "use strict";

  var ASR_MODEL = "gemini-flash-latest";

  var ASR_PROMPT = [
    "You are a strict JSON generator performing SPEECH TRANSCRIPTION of the attached audio or video (Hebrew speech expected; for video use ONLY the audio track).",
    "Rules:",
    "- Split the transcript into natural sentence/phrase segments of at most ~15 seconds each.",
    '- Each segment gets "start" — the timestamp where the segment begins, format "M:SS" or "H:MM:SS" (from audio start).',
    "- Timestamps MUST be non-decreasing and within the audio duration.",
    "- Transcribe Hebrew WITHOUT niqqud (do not add vocalization).",
    "- Do NOT translate, summarize, correct or invent anything.",
    '- If a region is unintelligible, insert "[…]" there and add "PARTIALLY_UNCLEAR" to warnings.',
    '- If the dominant language is not Hebrew, still transcribe and add "NOT_HEBREW" to warnings.',
    '- If there is no speech at all, return {"language":null,"segments":[],"warnings":["NO_SPEECH"]}.',
    "Output ONLY JSON, no markdown fences:",
    '{"language":"he|mixed|other","segments":[{"start":"M:SS","text":"..."}],"warnings":[]}',
  ].join("\n");

  // R16: константы сметы — ЕДИНСТВЕННОЕ место цен ASR. Gemini Flash: аудио-вход ≈32 ток/сек
  // ($1.00/1M ток), выход-транскрипт ≈4 ток/сек речи ($2.50/1M). Пересмотреть при смене модели.
  var ASR_TOKENS_PER_SEC = 32;
  var USD_PER_MTOK_AUDIO_IN = 1.0;
  var OUT_TOKENS_PER_SEC = 4;
  var USD_PER_MTOK_OUT = 2.5;
  // Gemini video input at generationConfig.mediaResolution=MEDIA_RESOLUTION_LOW ≈66 tokens/frame
  // @1fps (default MEDIUM ≈258/frame ≈ ~9× audio — мы всегда шлём LOW для видео, кадры нам не
  // нужны, API не даёт отключить их совсем). Проверено live-smoke S4.2.
  // blended cost ratio vs audio ≈2.57× (see videoNote locale strings — keep in sync)
  var VIDEO_FRAME_TOKENS_PER_SEC_LOW = 66;

  function estimateAsrCostUsd(durationSec, opts) {
    var d = Math.max(0, Number(durationSec) || 0);
    var inRate = ASR_TOKENS_PER_SEC + ((opts && opts.video) ? VIDEO_FRAME_TOKENS_PER_SEC_LOW : 0);
    return (d * inRate / 1e6) * USD_PER_MTOK_AUDIO_IN +
           (d * OUT_TOKENS_PER_SEC / 1e6) * USD_PER_MTOK_OUT;
  }

  // ── W2-S12: окна ASR + покрытие + смета длинного прогона ──
  // Все числа — замер 2026-07-28 (docs/research/studio-ingest-longmedia/2026-07-28/):
  // одновызовный ASR длинных файлов молча теряет куски и упирается в 65,536 ток. вывода
  // (thinking делит бюджет с ответом); range-промт по одному fileUri работает точно.
  var ASR_WINDOW_SEC = 900;    // 15 мин — внутри доказанного прод-режима ≤20 мин
  var ASR_GAP_MAX_SEC = 90;    // дыра покрытия внутри записи, требующая добора
  var ASR_TAIL_GAP_SEC = 180;  // молчание хвоста, считающееся дырой

  // S12.4: окна СОСЕДЕЙ ПЕРЕКРЫВАЮТСЯ. Шов по МЕТКАМ (S12.3) слеп к «легально врущим» меткам:
  // модель начинает с начала ФРАЗЫ, а не с секунды a, и, послушная прежнему «within a-b», ставила
  // захваченному куску метку ВНУТРИ диапазона — обе копии реплики выглядели легальными, дубль
  // переживал клиппинг. Лечение: сознательно транскрибировать шовную зону ДВАЖДЫ и резать шов по
  // ТЕКСТУ (stitchWindowSegments) — общая последовательность слов = доказательство, что речь одна.
  var ASR_WINDOW_OVERLAP_SEC = 30;
  // Клип ranged-окна ослаблен ровно настолько, чтобы ближняя (шовная) зона дожила до stitch;
  // «далеко вне» (заезд на минуты, как в живой приёмке) по-прежнему отбрасывается у источника.
  var ASR_STITCH_CLIP_TOL_SEC = ASR_WINDOW_OVERLAP_SEC + 30;

  // Номинальные границы окон — 0, 900, 1800…; окно k>0 стартует на OVERLAP РАНЬШЕ своей границы,
  // окно k заканчивается РОВНО на ней. Зона перекрытия соседей = [seam-OVERLAP, seam].
  function asrWindows(durationSec) {
    var d = Math.max(0, Number(durationSec) || 0);
    var out = [];
    for (var k = 0; k * ASR_WINDOW_SEC < d; k++) {
      var nominal = k * ASR_WINDOW_SEC;
      out.push({ startSec: k === 0 ? 0 : nominal - ASR_WINDOW_OVERLAP_SEC,
                 endSec: Math.min(d, nominal + ASR_WINDOW_SEC) });
    }
    if (!out.length) out.push({ startSec: 0, endSec: 0 });
    return out;
  }

  // Номинальные швы между окнами (900, 1800…) — то, вокруг чего ищется якорь. wins[k].startSec
  // окна k>0 = seam-OVERLAP по построению asrWindows, поэтому шов восстанавливается однозначно.
  function asrSeams(windows) {
    var out = [];
    for (var k = 1; k < (windows || []).length; k++) out.push(windows[k].startSec + ASR_WINDOW_OVERLAP_SEC);
    return out;
  }

  function fmtClock(sec) { // форматы, которые secondsFromTimestamp умеет парсить
    var s = Math.max(0, Math.round(sec));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
  }

  // S12.4 (владелец, живая 117-мин приёмка 2026-07-29 — дубли-блоки пережили клиппинг S12.3).
  // ПРАВИЛО ПЕРЕПИСАНО ЦЕЛИКОМ, не подправлено. Прежняя формулировка требовала «Timestamps must
  // remain ABSOLUTE … i.e. within a-b» — два несовместимых требования сразу: модель начинает
  // транскрипт с начала ФРАЗЫ (а не с секунды a) и доводит фразу за b, и, будучи послушной,
  // штамповала захваченному куску метку ВНУТРИ диапазона. Клип по меткам такую «легально врущую»
  // метку не отличает от честной → дубль на каждом шве. Теперь диапазон ограничивает ЗВУК, а метка
  // обязана быть честной ВСЕГДА — даже когда она выпадает за диапазон; шов режется по тексту
  // (stitchWindowSegments), а не по меткам, поэтому честная метка вне a-b ничего не ломает.
  // Базовый ASR_PROMPT не тронут (research m3, фаза range258).
  function ASR_RANGE_PROMPT(startSec, endSec) {
    var a = fmtClock(startSec), b = fmtClock(endSec);
    return ASR_PROMPT +
      "\nIMPORTANT SCOPE: transcribe ONLY the speech of the region from " + a + " to " + b +
      " (minutes:seconds from the very beginning of the file); transcribe nothing from any other" +
      " part of the recording." +
      "\nTIMESTAMPS ARE ABSOLUTE AND HONEST: every \"start\" is measured from the very beginning of" +
      " the FILE, never from the start of this region. If a phrase you transcribe begins slightly" +
      " before " + a + ", or ends slightly after " + b + ", report its REAL absolute timestamp," +
      " EVEN IF that timestamp falls outside " + a + "-" + b + "." +
      " NEVER shift, round or stretch a timestamp to make it fall inside " + a + "-" + b + ".";
  }

  function mergeWindowSegments(perWindow) {
    var out = [], lastT = -Infinity;
    for (var w = 0; w < (perWindow || []).length; w++) {
      var segs = perWindow[w] || [];
      for (var k = 0; k < segs.length; k++) {
        var t = (typeof segs[k].start === "number" && isFinite(segs[k].start)) ? segs[k].start : null;
        if (t !== null && t < lastT) t = null; // немонотонный стык окон → честный null (R11)
        if (t !== null) lastT = t;
        out.push({ start: t, text: segs[k].text });
      }
    }
    return out;
  }

  // ── S12.4: ШОВ ОКОН ПО ТЕКСТУ (якорь в зоне перекрытия) ─────────────────────────────────────
  // Окна соседей перекрываются на ASR_WINDOW_OVERLAP_SEC (asrWindows), значит речь шовной зоны
  // транскрибируется ДВАЖДЫ — намеренно. ЯКОРЬ = самая длинная общая последовательность слов
  // (≥ STITCH_ANCHOR_MIN_WORDS) между ХВОСТОМ окна k и ГОЛОВОЙ окна k+1. Якорь — это
  // ДОКАЗАТЕЛЬСТВО, что перед нами одна и та же речь; без него мы НИЧЕГО не выбрасываем сверх
  // старого клипа по номинальной границе.
  //
  // ПРАВИЛО РЕЗА (по СЕГМЕНТАМ, границы определяются вкладом normalized-слов сегмента в якорь):
  //   cutK  = ПЕРВЫЙ сегмент окна k, чьи слова попадают в якорную зону хвоста → окно k отдаёт
  //           сегменты [0, cutK) (всё ДО него);
  //   cutK1 = сегмент окна k+1, СОДЕРЖАЩИЙ первое слово якоря в своей голове → окно k+1 отдаёт
  //           сегменты [cutK1, …) (начиная С него).
  // Якорный текст остаётся РОВНО ОДИН раз — из окна k+1: якорь лежит в НАЧАЛЕ его запрошенного
  // региона (метки честнее), а для окна k — в самом хвосте, куда модель доезжает с накопленным
  // дрейфом.
  //
  // Пример (seam=900, перекрытие 30с):
  //   окно k  : s0 "מאמר על חינוך" | s1 "אבא אמא ילד ילדה" | s2 "הילד אכל תפוח" | s3 "הילד רץ אל הבית"
  //   окно k+1: t0 "הילד אכל תפוח" | t1 "הילד רץ אל הבית" | t2 "שלום עולם טוב"
  //   якорь = «הילד אכל תפוח הילד רץ אל הבית» (7 слов). Его первое слово в хвосте принадлежит s2,
  //   в голове — t0 → cutK=2, cutK1=0. Результат: s0, s1, t0, t1, t2 — якорная речь одна копия
  //   (из окна k+1), s2/s3 (её дубль из окна k) отброшены, ничего сверх зоны перекрытия не потеряно.
  //
  // R11: максимум потерь на шов — сегменты ВНУТРИ зоны перекрытия, и только когда та же речь
  // осталась у соседа. stitchAnchorInZone() — предохранитель: если рез задел бы сегмент с честной
  // меткой ВНЕ зоны [seam-OVERLAP-TOL, seam+TOL] (ложный якорь на повторяющейся фразе далеко от
  // шва), якорь отклоняется и шов честно уходит в noAnchor-фолбэк, ничего не теряя.
  var STITCH_TAIL_WORDS = 80;       // сколько слов хвоста/головы вообще участвуют в поиске якоря
  var STITCH_ANCHOR_MIN_WORDS = 5;  // короче — не доказательство, а совпадение частотных слов
  var STITCH_ZONE_TOL_SEC = 15;     // метки модели плавают; фраза может лежать поперёк шва
  var STITCH_SEAM_TOL_SEC = 2;      // фолбэк без якоря = прежний рез по номинальной границе ±2с

  // Только ивритские буквы и пробелы. Огласовки/теамим СНИМАЮТСЯ (не разрывают слово), всё
  // остальное (пунктуация, латиница, цифры) — разделитель; пробелы схлопываются.
  function stitchNormalizeWords(text) {
    return String(text == null ? "" : text)
      .replace(/[֑-ׇ]/g, "")
      .replace(/[^א-ת]+/g, " ")
      .trim().split(/\s+/).filter(Boolean);
  }

  // words[] + owners[] (индекс сегмента-владельца каждого слова) — так рез по слову превращается
  // в рез по сегменту. Набираем до ~maxWords, целыми сегментами (сегмент не рвём).
  function stitchTailWords(segments, maxWords) {
    var words = [], owners = [];
    for (var i = segments.length - 1; i >= 0 && words.length < maxWords; i--) {
      var w = stitchNormalizeWords(segments[i].text);
      for (var j = w.length - 1; j >= 0; j--) { words.unshift(w[j]); owners.unshift(i); }
    }
    return { words: words, owners: owners };
  }

  function stitchHeadWords(segments, maxWords) {
    var words = [], owners = [];
    for (var i = 0; i < segments.length && words.length < maxWords; i++) {
      var w = stitchNormalizeWords(segments[i].text);
      for (var j = 0; j < w.length; j++) { words.push(w[j]); owners.push(i); }
    }
    return { words: words, owners: owners };
  }

  // Самая длинная общая ПОДСТРОКА слов (скользящее окно = классический DP по суффиксам).
  // При равной длине побеждает КАНДИДАТ БЛИЖЕ К ШВУ: хвост окна k упирается в номинальную границу,
  // поэтому «ближе к шву» = больший индекс в хвосте → сравнение `>=` при возрастающем i.
  function stitchFindAnchor(tailWords, headWords, minWords) {
    var n = tailWords.length, m = headWords.length;
    if (!n || !m) return null;
    var prev = new Array(m + 1).fill(0), best = null;
    for (var i = 1; i <= n; i++) {
      var cur = new Array(m + 1).fill(0);
      for (var j = 1; j <= m; j++) {
        if (tailWords[i - 1] !== headWords[j - 1]) continue;
        cur[j] = prev[j - 1] + 1;
        if (cur[j] >= minWords && (!best || cur[j] >= best.len)) {
          best = { len: cur[j], tailStart: i - cur[j], headStart: j - cur[j] };
        }
      }
      prev = cur;
    }
    return best;
  }

  // R11-предохранитель (см. блок выше): рез легитимен, только если ВСЁ отбрасываемое лежит в зоне
  // перекрытия ±STITCH_ZONE_TOL_SEC. null-метки не опровергают якорь (нет свидетельства) —
  // текстовое доказательство остаётся в силе.
  function stitchAnchorInZone(A, B, cutK, cutK1, seam) {
    var lo = seam - ASR_WINDOW_OVERLAP_SEC - STITCH_ZONE_TOL_SEC, hi = seam + STITCH_ZONE_TOL_SEC;
    for (var i = cutK; i < A.length; i++) {
      var t = A[i].start;
      if (typeof t === "number" && isFinite(t) && t < lo) return false;
    }
    for (var j = 0; j < cutK1; j++) {
      var u = B[j].start;
      if (typeof u === "number" && isFinite(u) && u > hi) return false;
    }
    return true;
  }

  // perWindow = [[{start,text}…]…], seams = номинальные границы (900, 1800…), длиной
  // perWindow.length-1. Возврат: { segments, seamsMeta } — seamsMeta уходит в провенанс (R9).
  function stitchWindowSegments(perWindow, seams) {
    var wins = (perWindow || []).map(function (s) { return Array.isArray(s) ? s : []; });
    var keep = wins.map(function (s) { return s.map(function () { return true; }); });
    var seamList = Array.isArray(seams) ? seams : [];
    var count = Math.min(seamList.length, Math.max(0, wins.length - 1));
    var meta = [];
    for (var s = 0; s < count; s++) {
      var seam = Number(seamList[s]);
      var A = wins[s], B = wins[s + 1];
      var tail = stitchTailWords(A, STITCH_TAIL_WORDS);
      var head = stitchHeadWords(B, STITCH_TAIL_WORDS);
      var anchor = stitchFindAnchor(tail.words, head.words, STITCH_ANCHOR_MIN_WORDS);
      var cutK = anchor ? tail.owners[anchor.tailStart] : -1;
      var cutK1 = anchor ? head.owners[anchor.headStart] : -1;
      var outOfZone = !!anchor && !stitchAnchorInZone(A, B, cutK, cutK1, seam);
      if (anchor && !outOfZone) {
        for (var i = cutK; i < A.length; i++) keep[s][i] = false;
        for (var j = 0; j < cutK1; j++) keep[s + 1][j] = false;
        meta.push({ seam: seam, anchored: true, anchorWords: anchor.len,
                    cutSegDroppedK: A.length - cutK, cutSegDroppedK1: cutK1 });
        continue;
      }
      // Фолбэк без якоря — прежний честный рез по номинальной границе (тот же ±2с допуск, что и у
      // клиппинга): окно k до seam+2, окно k+1 от seam-2. null-метки НЕ трогаем (нет свидетельства
      // ни за, ни против — текст сохраняется, R11).
      var dK = 0, dK1 = 0;
      for (var p = 0; p < A.length; p++) {
        var ta = A[p].start;
        if (typeof ta === "number" && isFinite(ta) && ta > seam + STITCH_SEAM_TOL_SEC) { keep[s][p] = false; dK++; }
      }
      for (var q = 0; q < B.length; q++) {
        var tb = B[q].start;
        if (typeof tb === "number" && isFinite(tb) && tb < seam - STITCH_SEAM_TOL_SEC) { keep[s + 1][q] = false; dK1++; }
      }
      var m2 = { seam: seam, anchored: false, noAnchor: true, cutSegDroppedK: dK, cutSegDroppedK1: dK1 };
      if (outOfZone) { m2.anchorOutOfZone = true; m2.anchorWords = anchor.len; } // R9: почему якорь отклонён
      meta.push(m2);
    }
    var out = [];
    for (var w = 0; w < wins.length; w++) {
      for (var r = 0; r < wins[w].length; r++) if (keep[w][r]) out.push(wins[w][r]);
    }
    return { segments: out, seamsMeta: meta };
  }

  // Интро-дыра НЕ считается: поздний первый сегмент легитимен (музыка) и уже флагуется
  // LATE_FIRST_SEGMENT в validateSegments. null-старты прозрачны (не рвут отрезок).
  function findCoverageGaps(segments, durationSec) {
    var dur = Math.max(0, Number(durationSec) || 0);
    var gaps = [], prev = null;
    for (var k = 0; k < (segments || []).length; k++) {
      var t = segments[k] && typeof segments[k].start === "number" ? segments[k].start : null;
      if (t === null) continue;
      if (prev !== null && t - prev > ASR_GAP_MAX_SEC) gaps.push({ fromSec: prev, toSec: t });
      prev = t;
    }
    if (prev !== null && dur > 0 && dur - prev > ASR_TAIL_GAP_SEC) gaps.push({ fromSec: prev, toSec: dur });
    return gaps;
  }

  // R16: ЕДИНСТВЕННОЕ место цен длинного прогона (вместе с ASR-константами выше).
  // Замер: строка таблицы ≈205–219 out-ток (берём 220); ASR-выход с thinking ≈8 ток/с;
  // кусок таблицы 147–224 с (берём 140 с консервативно на 120 сегм); окно ASR 21–139 с (берём 45).
  var TABLE_OUT_TOKENS_PER_ROW = 220;
  var TABLE_IN_TOKENS_PER_SEG = 40;
  var USD_PER_MTOK_TEXT_IN = 0.30;
  var ASR_OUT_TOKENS_PER_SEC_TOTAL = 8; // candidates+thinking, замер 75-мин прогона
  var TABLE_SEC_PER_CHUNK = 140;
  var ASR_SEC_PER_WINDOW = 45;
  var SEGS_PER_MIN_ASR = 6; // подкаст-монолог 4.8–8/мин

  function estimateLongJob(durationSec, opts) {
    if (!opts || !Number.isInteger(opts.chunkSize) || opts.chunkSize <= 0) {
      throw new Error("estimateLongJob: chunkSize обязателен (TableChunks.CHUNK_SIZE)");
    }
    var d = Math.max(0, Number(durationSec) || 0);
    var inRate = ASR_TOKENS_PER_SEC + ((opts.video) ? VIDEO_FRAME_TOKENS_PER_SEC_LOW : 0);
    var asrUsd = (d * inRate / 1e6) * USD_PER_MTOK_AUDIO_IN +
                 (d * ASR_OUT_TOKENS_PER_SEC_TOTAL / 1e6) * USD_PER_MTOK_OUT;
    var segs = Number.isInteger(opts.segmentsKnown) ? opts.segmentsKnown
             : Math.ceil((d / 60) * SEGS_PER_MIN_ASR);
    var expRows = Math.ceil(segs * 1.05); // модель может дробить сегмент на строки
    var chunks = Math.max(1, Math.ceil(segs / opts.chunkSize));
    var tableUsd = (expRows * TABLE_OUT_TOKENS_PER_ROW / 1e6) * USD_PER_MTOK_OUT +
                   (segs * TABLE_IN_TOKENS_PER_SEG / 1e6) * USD_PER_MTOK_TEXT_IN;
    var windows = asrWindows(d).length;
    var minutes = Math.ceil((windows * ASR_SEC_PER_WINDOW + chunks * TABLE_SEC_PER_CHUNK) / 60) + 1;
    return { asrUsd: asrUsd, tableUsd: tableUsd, totalUsd: asrUsd + tableUsd,
             minutes: minutes, expRows: expRows, chunks: chunks, windows: windows };
  }

  function secondsFromTimestamp(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d+):([0-5]?\d)(?:\.(\d+))?$/.exec(s.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number("0." + m[3]) : 0);
    var h = /^(\d+):([0-5]?\d):([0-5]?\d)(?:\.(\d+))?$/.exec(s.trim());
    if (h) return Number(h[1]) * 3600 + Number(h[2]) * 60 + Number(h[3]) + (h[4] ? Number("0." + h[4]) : 0);
    return null;
  }

  // Ответ модели → нормализованный объект. Фенсы срезаем тем же приёмом, что ingest/routes.js.
  function parseAsrResponse(raw) {
    var cleaned = String(raw == null ? "" : raw)
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    var parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (_) { var e = new Error("ASR returned non-JSON"); e.code = "ASR_BAD_JSON"; throw e; }
    var segs = Array.isArray(parsed.segments) ? parsed.segments : [];
    var out = [];
    for (var k = 0; k < segs.length; k++) {
      var text = String((segs[k] && segs[k].text) || "").trim();
      if (!text) continue; // пустой сегмент бесполезен и для текста, и для тайминга
      out.push({ start: secondsFromTimestamp(segs[k].start), text: text });
    }
    return {
      language: parsed.language || null,
      segments: out,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter(function (w) { return typeof w === "string"; }) : [],
    };
  }

  // R11: тексты сохраняются ВСЕГДА; тайминг — только честный. Невалидный/немонотонный start → null.
  // timingOk = валидных ≥2 И ≥80% сегментов. Поздний первый сегмент (>60с) — warning, не провал
  // (легитимно: музыкальное интро).
  function validateSegments(segments, durationSec) {
    var input = Array.isArray(segments) ? segments : [];
    var dur = Math.max(0, Number(durationSec) || 0);
    var out = [], warnings = [], lastT = -Infinity, valid = 0;
    for (var k = 0; k < input.length; k++) {
      var text = String((input[k] && input[k].text) || "").trim();
      var t = input[k] && typeof input[k].start === "number" && isFinite(input[k].start) ? input[k].start : null;
      if (t !== null) {
        if (t < 0) t = 0;
        if (dur > 0 && t > dur + 2) t = null;        // за пределами аудио — фейк
        else if (t < lastT) t = null;                // немонотонность — фейк
      }
      if (t !== null) { lastT = t; valid++; }
      out.push({ i: k, start: t, text: text });
    }
    var firstValid = null;
    for (var j = 0; j < out.length; j++) { if (out[j].start !== null) { firstValid = out[j].start; break; } }
    if (firstValid !== null && firstValid > 60) warnings.push("LATE_FIRST_SEGMENT");
    var timingOk = valid >= 2 && (input.length === 0 ? false : valid / input.length >= 0.8);
    return {
      segments: out,
      timingOk: timingOk,
      dropReason: timingOk ? null : "ASR_TIMING_INVALID",
      warnings: warnings,
    };
  }

  // segments (после validateSegments) + segment_index каждой строки таблицы → [{o,t}]:
  // o = ПЕРВАЯ строка сегмента, t = его start. <2 записей → null (караоке честно выключено).
  function buildRowTiming(segments, rowSegIdx) {
    var firstRow = new Map();
    var rows = Array.isArray(rowSegIdx) ? rowSegIdx : [];
    for (var r = 0; r < rows.length; r++) {
      var si = rows[r];
      if (Number.isInteger(si) && !firstRow.has(si)) firstRow.set(si, r);
    }
    var entries = [], lastT = -Infinity;
    var segs = Array.isArray(segments) ? segments : [];
    for (var k = 0; k < segs.length; k++) {
      var st = segs[k] && segs[k].start;
      if (typeof st !== "number" || !isFinite(st)) continue;
      var row = firstRow.get(segs[k].i != null ? segs[k].i : k);
      if (row == null) continue;
      if (st < lastT) continue; // страховка (validateSegments уже отфильтровал)
      entries.push({ o: row, t: st });
      lastT = st;
    }
    return entries.length >= 2 ? { v: 1, unit: "row", entries: entries } : null;
  }

  var API = {
    ASR_MODEL: ASR_MODEL, ASR_PROMPT: ASR_PROMPT,
    secondsFromTimestamp: secondsFromTimestamp, parseAsrResponse: parseAsrResponse,
    validateSegments: validateSegments, buildRowTiming: buildRowTiming,
    estimateAsrCostUsd: estimateAsrCostUsd,
    VIDEO_FRAME_TOKENS_PER_SEC_LOW: VIDEO_FRAME_TOKENS_PER_SEC_LOW,
    ASR_WINDOW_SEC: ASR_WINDOW_SEC, ASR_GAP_MAX_SEC: ASR_GAP_MAX_SEC, ASR_TAIL_GAP_SEC: ASR_TAIL_GAP_SEC,
    ASR_WINDOW_OVERLAP_SEC: ASR_WINDOW_OVERLAP_SEC, ASR_STITCH_CLIP_TOL_SEC: ASR_STITCH_CLIP_TOL_SEC,
    STITCH_TAIL_WORDS: STITCH_TAIL_WORDS, STITCH_ANCHOR_MIN_WORDS: STITCH_ANCHOR_MIN_WORDS,
    STITCH_ZONE_TOL_SEC: STITCH_ZONE_TOL_SEC, STITCH_SEAM_TOL_SEC: STITCH_SEAM_TOL_SEC,
    asrWindows: asrWindows, asrSeams: asrSeams, ASR_RANGE_PROMPT: ASR_RANGE_PROMPT,
    mergeWindowSegments: mergeWindowSegments, stitchWindowSegments: stitchWindowSegments,
    findCoverageGaps: findCoverageGaps,
    estimateLongJob: estimateLongJob,
  };
  if (typeof window !== "undefined") window.AsrTranscript = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
