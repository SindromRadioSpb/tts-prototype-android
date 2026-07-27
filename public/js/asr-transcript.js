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
  };
  if (typeof window !== "undefined") window.AsrTranscript = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
