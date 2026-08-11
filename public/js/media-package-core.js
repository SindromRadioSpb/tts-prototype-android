// Studio Ingest L3a — pure Correctable Media Package core.
// Browser/Node dual export. No DB, OPFS, network, model or UI side effects.
(function () {
  'use strict';

  var ROLE_RAW = 'raw_original';
  var ROLE_CORRECTED = 'user_corrected';
  var GAP_WARN_MS = 2000;

  function fail(code, detail) {
    var e = new Error(code + (detail ? ': ' + detail : ''));
    e.code = code;
    throw e;
  }

  function cryptoObj() {
    if (typeof crypto !== 'undefined' && crypto.subtle) return crypto;
    return require('node:crypto').webcrypto;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(s));
    return new Uint8Array(Buffer.from(String(s), 'utf8'));
  }

  async function sha256Hex(value) {
    var bytes = value instanceof Uint8Array ? value : utf8(String(value));
    var digest = await cryptoObj().subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function nfc(value) { return String(value == null ? '' : value).normalize('NFC'); }
  function finiteInt(value, nullable) {
    if (value == null || value === '') return nullable ? null : NaN;
    var n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : NaN;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function canonicalize(value) {
    if (value == null || typeof value !== 'object') {
      if (typeof value === 'string') return nfc(value);
      if (typeof value === 'number' && Object.is(value, -0)) return 0;
      return value;
    }
    if (Array.isArray(value)) return value.map(canonicalize);
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }

  function uniqueStrings(values) {
    var seen = Object.create(null), out = [];
    (values || []).forEach(function (value) {
      var s = String(value || '').trim();
      if (s && !seen[s]) { seen[s] = true; out.push(s); }
    });
    return out.sort();
  }

  function semanticTuples(segments) {
    return (segments || []).map(function (s) {
      return [finiteInt(s.start_ms != null ? s.start_ms : (s.start == null ? null : Number(s.start) * 1000), true),
        finiteInt(s.end_ms != null ? s.end_ms : (s.end == null ? null : Number(s.end) * 1000), true),
        nfc(s.text).replace(/\r\n?/g, '\n')];
    });
  }

  async function semanticHash(segments) { return sha256Hex(canonicalJson(semanticTuples(segments))); }

  function validateSegments(segments) {
    if (!Array.isArray(segments)) fail('SEGMENTS_REQUIRED');
    var warnings = [];
    var prev = null;
    segments.forEach(function (segment, index) {
      var start = finiteInt(segment.start_ms != null ? segment.start_ms : (segment.start == null ? null : Number(segment.start) * 1000), true);
      var end = finiteInt(segment.end_ms != null ? segment.end_ms : (segment.end == null ? null : Number(segment.end) * 1000), true);
      var flags = uniqueStrings(segment.quality_flags);
      if (start == null) {
        if (end != null || flags.indexOf('blind') < 0) fail('SEGMENT_TIMING_INVALID', String(index));
        if (!nfc(segment.text).trim()) fail('SEGMENT_TEXT_EMPTY', String(index));
        warnings.push({ code: 'SEGMENT_TIMING_MISSING', index: index });
        // An untimed segment breaks any proven adjacency. Do not compare the next cue with a
        // cue on the other side and accidentally manufacture overlap/gap evidence.
        prev = null;
        return;
      }
      if (!Number.isFinite(start) || start < 0 || (end != null && (!Number.isFinite(end) || end <= start))) {
        fail('SEGMENT_TIMING_INVALID', String(index));
      }
      if (!nfc(segment.text).trim()) fail('SEGMENT_TEXT_EMPTY', String(index));
      if (prev && prev.end != null) {
        if (start < prev.end) warnings.push({ code: 'SEGMENT_OVERLAP', left_index: index - 1, right_index: index, amount_ms: prev.end - start });
        else if (start - prev.end >= GAP_WARN_MS) warnings.push({ code: 'SEGMENT_GAP', left_index: index - 1, right_index: index, amount_ms: start - prev.end });
      }
      prev = { end: end };
    });
    return { ok: true, warnings: warnings };
  }

  function stableRawTuple(segment) {
    return {
      start_ms: finiteInt(segment.start_ms != null ? segment.start_ms : (segment.start == null ? null : Number(segment.start) * 1000), true),
      end_ms: finiteInt(segment.end_ms != null ? segment.end_ms : (segment.end == null ? null : Number(segment.end) * 1000), true),
      text: nfc(segment.text).replace(/\r\n?/g, '\n'),
      speaker: segment.speaker == null ? null : nfc(segment.speaker),
      source_line_index: Number.isInteger(Number(segment.source_line_index)) ? Number(segment.source_line_index) : null,
      quality_flags: uniqueStrings(segment.quality_flags),
    };
  }

  async function createRawRevision(input) {
    input = input || {};
    var tuples = (input.segments || []).map(stableRawTuple);
    validateSegments(tuples);
    var stableTrack = {
      schema: 'studio-caption-track-v1',
      format: String(input.format || 'unknown').toLowerCase(),
      provider: input.provider || null,
      model: input.model || null,
      model_revision: input.model_revision || null,
      language: input.language || 'he',
      cues: tuples,
    };
    var trackFingerprint = await sha256Hex(canonicalJson(stableTrack));
    var binding = input.media_sha256 ? String(input.media_sha256).toLowerCase() : 'unbound:' + trackFingerprint;
    var segments = tuples.map(function (tuple, ordinal) {
      return Object.assign({}, tuple, {
        source_segment_id: 'srcseg:' + binding + ':' + trackFingerprint.slice(0, 16) + ':' + ordinal,
        authority: {
          text: input.format === 'asr' ? 'provider' : 'import',
          timing: tuple.start_ms == null ? 'unknown' : (input.format === 'asr' ? 'provider' : 'import'),
          speaker: tuple.speaker ? (input.format === 'asr' ? 'provider' : 'import') : 'unknown',
        },
      });
    });
    var canonicalPayload = { schema: 'studio-caption-revision-v1', role: ROLE_RAW, segments: segments, operations: [] };
    return {
      role: ROLE_RAW,
      track_fingerprint: trackFingerprint,
      canonical_sha256: await sha256Hex(canonicalJson(canonicalPayload)),
      segments: segments,
      provenance: clone(input.provenance || {}),
      warnings: validateSegments(segments).warnings,
    };
  }

  // Провенанс строки — единственное, что знает, ИЗ КАКОГО медиа она получена. Идентификаторы
  // сегментов несут sha медиа прямо в себе: 'asrseg:<sha>:<n>' (studio-import) и
  // 'srcseg:<sha>:<fp16>:<n>' (createRawRevision выше). Форма 'srcseg:unbound:<fp>:…' медиа НЕ
  // называет, 'cseg:…' — тоже: обе честно дают пустой ответ, а не догадку.
  var MEDIA_SHA256 = /^[0-9a-f]{64}$/;
  function mediaShaFromSegmentId(value) {
    var parts = String(value == null ? '' : value).split(':');
    if (parts.length < 3 || (parts[0] !== 'asrseg' && parts[0] !== 'srcseg')) return null;
    var candidate = String(parts[1]).toLowerCase();
    return MEDIA_SHA256.test(candidate) ? candidate : null;
  }
  // Отсортированное множество медиа, на которые ссылаются строки маппинга. Пустой массив = «строки
  // ничего не утверждают» и НЕ равен «строки утверждают другое»: различать эти два случая обязан
  // вызывающий (R9 derived ≠ asserted).
  function mediaShaSetFromMapping(mapping) {
    var rows = mapping && Array.isArray(mapping.rows) ? mapping.rows : [];
    var found = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var ids = [row.source_segment_id]
        .concat(Array.isArray(row.source_segment_ids) ? row.source_segment_ids : [])
        .concat(Array.isArray(row.raw_source_segment_ids) ? row.raw_source_segment_ids : []);
      for (var k = 0; k < ids.length; k++) {
        var sha = mediaShaFromSegmentId(ids[k]);
        if (sha) found[sha] = true;
      }
    }
    return Object.keys(found).sort();
  }

  function defaultId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return 'cseg:' + crypto.randomUUID();
    return 'cseg:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  }

  function createCorrectedDraft(rawSegments, opts) {
    opts = opts || {};
    var idFactory = opts.id_factory || defaultId;
    return (rawSegments || []).map(function (raw) {
      return {
        caption_segment_id: idFactory(),
        source_segment_ids: [String(raw.source_segment_id)],
        start_ms: finiteInt(raw.start_ms, true), end_ms: finiteInt(raw.end_ms, true), text: nfc(raw.text),
        speaker: raw.speaker == null ? null : nfc(raw.speaker),
        authority: clone(raw.authority || { text: 'provider', timing: 'provider', speaker: raw.speaker ? 'provider' : 'unknown' }),
        quality_flags: uniqueStrings(raw.quality_flags),
      };
    });
  }

  function correctedIndex(segments, id) {
    var index = segments.findIndex(function (s) { return s.caption_segment_id === id; });
    if (index < 0) fail('CAPTION_SEGMENT_NOT_FOUND', id);
    return index;
  }

  function applyOperation(role, inputSegments, op) {
    if (role === ROLE_RAW) fail('RAW_IMMUTABLE');
    if (role !== ROLE_CORRECTED) fail('TRACK_ROLE_NOT_EDITABLE', role);
    op = op || {};
    var segments = clone(inputSegments || []);
    var idFactory = op.id_factory || defaultId;
    var index, segment, operation;
    if (op.type === 'edit_text') {
      index = correctedIndex(segments, op.caption_segment_id); segment = segments[index];
      var text = nfc(op.text).replace(/\r\n?/g, '\n').trim();
      if (!text) fail('SEGMENT_TEXT_EMPTY');
      segment.text = text; segment.authority = Object.assign({}, segment.authority, { text: 'user' });
      operation = { type: 'edit_text', caption_segment_id: segment.caption_segment_id };
    } else if (op.type === 'edit_timing') {
      index = correctedIndex(segments, op.caption_segment_id); segment = segments[index];
      segment.start_ms = finiteInt(op.start_ms); segment.end_ms = finiteInt(op.end_ms, true);
      segment.authority = Object.assign({}, segment.authority, { timing: 'user' });
      operation = { type: 'edit_timing', caption_segment_id: segment.caption_segment_id, start_ms: segment.start_ms, end_ms: segment.end_ms };
    } else if (op.type === 'edit_speaker') {
      index = correctedIndex(segments, op.caption_segment_id); segment = segments[index];
      segment.speaker = op.speaker == null || !String(op.speaker).trim() ? null : nfc(op.speaker).trim();
      segment.authority = Object.assign({}, segment.authority, { speaker: segment.speaker ? 'user' : 'unknown' });
      operation = { type: 'edit_speaker', caption_segment_id: segment.caption_segment_id };
    } else if (op.type === 'split') {
      index = correctedIndex(segments, op.caption_segment_id); segment = segments[index];
      var at = finiteInt(op.at_ms);
      if (segment.start_ms == null || segment.end_ms == null || !(at > segment.start_ms && at < segment.end_ms)) fail('SPLIT_POINT_INVALID');
      var leftText = nfc(op.text_left).trim(), rightText = nfc(op.text_right).trim();
      if (!leftText || !rightText) fail('SPLIT_TEXT_REQUIRED');
      var base = {
        source_segment_ids: uniqueStrings(segment.source_segment_ids), speaker: segment.speaker,
        authority: clone(segment.authority), quality_flags: uniqueStrings(segment.quality_flags),
        derived_from_caption_segment_id: segment.caption_segment_id,
      };
      var left = Object.assign({}, clone(base), { caption_segment_id: idFactory(), start_ms: segment.start_ms, end_ms: at, text: leftText });
      var right = Object.assign({}, clone(base), { caption_segment_id: idFactory(), start_ms: at, end_ms: segment.end_ms, text: rightText });
      segments.splice(index, 1, left, right);
      operation = { type: 'split', tombstoned_caption_segment_id: segment.caption_segment_id, created_caption_segment_ids: [left.caption_segment_id, right.caption_segment_id], at_ms: at };
    } else if (op.type === 'merge') {
      var ids = op.caption_segment_ids || [];
      if (ids.length !== 2) fail('MERGE_TWO_REQUIRED');
      var leftIndex = correctedIndex(segments, ids[0]), rightIndex = correctedIndex(segments, ids[1]);
      if (rightIndex !== leftIndex + 1) fail('MERGE_ADJACENT_REQUIRED');
      var leftSeg = segments[leftIndex], rightSeg = segments[rightIndex];
      var mergeUntimed = leftSeg.start_ms == null || rightSeg.start_ms == null;
      var merged = {
        caption_segment_id: idFactory(),
        source_segment_ids: uniqueStrings((leftSeg.source_segment_ids || []).concat(rightSeg.source_segment_ids || [])),
        start_ms: mergeUntimed ? null : Math.min(leftSeg.start_ms, rightSeg.start_ms),
        end_ms: mergeUntimed || leftSeg.end_ms == null || rightSeg.end_ms == null ? null : Math.max(leftSeg.end_ms, rightSeg.end_ms),
        text: nfc(op.text != null ? op.text : leftSeg.text + ' ' + rightSeg.text).trim(),
        speaker: leftSeg.speaker === rightSeg.speaker ? leftSeg.speaker : null,
        authority: {
          text: op.text != null ? 'user' : (leftSeg.authority.text === rightSeg.authority.text ? leftSeg.authority.text : 'derived'),
          timing: leftSeg.authority.timing === rightSeg.authority.timing ? leftSeg.authority.timing : 'derived',
          speaker: leftSeg.speaker && leftSeg.speaker === rightSeg.speaker ? (leftSeg.authority.speaker === rightSeg.authority.speaker ? leftSeg.authority.speaker : 'derived') : 'unknown',
        },
        quality_flags: uniqueStrings((leftSeg.quality_flags || []).concat(rightSeg.quality_flags || []).concat(mergeUntimed ? ['blind'] : [])),
        derived_from_caption_segment_ids: [leftSeg.caption_segment_id, rightSeg.caption_segment_id],
      };
      segments.splice(leftIndex, 2, merged);
      operation = { type: 'merge', tombstoned_caption_segment_ids: ids.slice(), created_caption_segment_id: merged.caption_segment_id };
    } else if (op.type === 'offset') {
      var delta = finiteInt(op.delta_ms);
      if (!Number.isFinite(delta) || !delta) fail('OFFSET_INVALID');
      var clamped = 0;
      segments.forEach(function (s) {
        if (s.start_ms == null) { s.end_ms = null; s.quality_flags = uniqueStrings((s.quality_flags || []).concat(['blind'])); return; }
        var start = s.start_ms + delta, end = s.end_ms == null ? null : s.end_ms + delta;
        if (start < 0) { if (!op.confirm_clamp) fail('OFFSET_NEGATIVE_CONFIRM_REQUIRED'); clamped++; end = end == null ? null : Math.max(1, end - start); start = 0; }
        s.start_ms = start; s.end_ms = end; s.authority = Object.assign({}, s.authority, { timing: 'user' });
      });
      operation = { type: 'offset', delta_ms: delta, clamped_count: clamped };
    } else if (op.type === 'replace_text_layout') {
      var replacementText = nfc(op.text).replace(/\r\n?/g, '\n').trim();
      if (!replacementText || !segments.length) fail('REPLACEMENT_TEXT_REQUIRED');
      var ends = segments.map(function (s) { return s.end_ms; });
      var replacementUntimed = segments.some(function (s) { return s.start_ms == null; });
      var replacement = {
        caption_segment_id: idFactory(),
        source_segment_ids: uniqueStrings(segments.flatMap(function (s) { return s.source_segment_ids || []; })),
        start_ms: replacementUntimed ? null : Math.min.apply(null, segments.map(function (s) { return s.start_ms; })),
        end_ms: replacementUntimed || ends.some(function (value) { return value == null; }) ? null : Math.max.apply(null, ends),
        text: replacementText, speaker: null,
        authority: { text: 'user', timing: 'derived', speaker: 'unknown' },
        quality_flags: uniqueStrings(segments.flatMap(function (s) { return (s.quality_flags || []).concat(['PREVIEW_RESEGMENTED']).concat(replacementUntimed ? ['blind'] : []); })),
        derived_from_caption_segment_ids: segments.map(function (s) { return s.caption_segment_id; }),
      };
      operation = { type: 'replace_text_layout', tombstoned_caption_segment_ids: replacement.derived_from_caption_segment_ids.slice(), created_caption_segment_id: replacement.caption_segment_id };
      segments = [replacement];
    } else fail('OPERATION_UNKNOWN', op.type);
    var report = validateSegments(segments);
    return { segments: segments, operation: operation, warnings: report.warnings };
  }

  function pad(value, size) { return String(value).padStart(size, '0'); }
  function formatTime(ms, format) {
    ms = finiteInt(ms); var hours = Math.floor(ms / 3600000); ms -= hours * 3600000;
    var minutes = Math.floor(ms / 60000); ms -= minutes * 60000;
    var seconds = Math.floor(ms / 1000); var millis = ms - seconds * 1000;
    return pad(hours, 2) + ':' + pad(minutes, 2) + ':' + pad(seconds, 2) + (format === 'srt' ? ',' : '.') + pad(millis, 3);
  }
  function parseTime(value) {
    var m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(String(value).trim());
    if (!m) fail('SUBTITLE_TIME_INVALID', value);
    return (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(String(m[4]).padEnd(3, '0'));
  }

  function serializeSubtitles(format, segments) {
    format = String(format || '').toLowerCase();
    if (format !== 'vtt' && format !== 'srt') fail('SUBTITLES_UNKNOWN_FORMAT', format);
    validateSegments(segments);
    var blocks = (segments || []).map(function (segment, index) {
      if (segment.start_ms == null) fail('SEGMENT_START_REQUIRED', String(index));
      if (segment.end_ms == null) fail('SEGMENT_END_REQUIRED', String(index));
      var timing = formatTime(segment.start_ms, format) + ' --> ' + formatTime(segment.end_ms, format);
      if (format === 'srt') return String(index + 1) + '\n' + timing + '\n' + nfc(segment.text);
      var meta = [];
      if (segment.caption_segment_id) meta.push('X-LP-CAPTION-ID:' + segment.caption_segment_id);
      if ((segment.quality_flags || []).length) meta.push('X-LP-QUALITY:' + uniqueStrings(segment.quality_flags).join(','));
      return meta.concat([segment.caption_segment_id || String(index + 1), timing, nfc(segment.text)]).join('\n');
    });
    return (format === 'vtt' ? 'WEBVTT\n\n' : '') + blocks.join('\n\n') + '\n';
  }

  function detectSubtitleFormat(raw) {
    var text = String(raw || '').replace(/^\uFEFF/, '').trim();
    if (/^WEBVTT(?:\s|$)/.test(text)) return 'vtt';
    if (/\d{1,2}:\d{2}:\d{2},\d{1,3}\s*-->/.test(text)) return 'srt';
    if (/\d{1,2}:\d{2}:\d{2}\.\d{1,3}\s*-->/.test(text)) return 'vtt';
    return null;
  }

  function parseSubtitles(raw, opts) {
    var text = String(raw == null ? '' : raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    var format = String(opts && opts.hint || detectSubtitleFormat(text) || '').toLowerCase();
    if (format !== 'vtt' && format !== 'srt') fail('SUBTITLES_UNKNOWN_FORMAT');
    if (format === 'vtt') text = text.replace(/^WEBVTT[^\n]*\n?/, '').trim();
    var segments = [];
    text.split(/\n{2,}/).forEach(function (block) {
      var lines = block.split('\n'), timingIndex = lines.findIndex(function (line) { return line.indexOf('-->') >= 0; });
      if (timingIndex < 0) return;
      var tm = /^\s*(\S+)\s*-->\s*(\S+)/.exec(lines[timingIndex]);
      if (!tm) fail('SUBTITLE_TIME_INVALID');
      var id = null, flags = [];
      lines.slice(0, timingIndex).forEach(function (line) {
        if (/^X-LP-CAPTION-ID:/.test(line)) id = line.slice(16).trim();
        else if (/^X-LP-QUALITY:/.test(line)) flags = uniqueStrings(line.slice(13).split(','));
        else if (format === 'vtt' && line.trim() && !/^X-LP-/.test(line)) id = id || line.trim();
      });
      var body = lines.slice(timingIndex + 1).join('\n');
      if (!body.trim()) fail('SEGMENT_TEXT_EMPTY');
      segments.push({ caption_segment_id: id, source_segment_ids: [], start_ms: parseTime(tm[1]), end_ms: parseTime(tm[2]), text: nfc(body), speaker: null, authority: { text: 'import', timing: 'import', speaker: 'unknown' }, quality_flags: flags });
    });
    if (!segments.length) fail('SUBTITLES_EMPTY');
    validateSegments(segments);
    return { ok: true, format: format, segments: segments };
  }

  async function revisionHash(role, segments, operations) {
    return sha256Hex(canonicalJson({ schema: 'studio-caption-revision-v1', role: role, segments: segments, operations: operations || [] }));
  }

  var API = {
    ROLE_RAW: ROLE_RAW, ROLE_CORRECTED: ROLE_CORRECTED,
    canonicalJson: canonicalJson, sha256Hex: sha256Hex, semanticTuples: semanticTuples,
    semanticHash: semanticHash, revisionHash: revisionHash, validateSegments: validateSegments,
    createRawRevision: createRawRevision, createCorrectedDraft: createCorrectedDraft,
    applyOperation: applyOperation, serializeSubtitles: serializeSubtitles,
    parseSubtitles: parseSubtitles, detectSubtitleFormat: detectSubtitleFormat,
    mediaShaFromSegmentId: mediaShaFromSegmentId, mediaShaSetFromMapping: mediaShaSetFromMapping,
  };
  if (typeof window !== 'undefined') window.MediaPackageCore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
