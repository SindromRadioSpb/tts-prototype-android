(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MediathequeMetadata = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // SQL expressions below are supplied only by repository source code, never request input.
  // Extract a bounded, body-free allowlist instead of returning source passports or ASR arrays.
  function projectionSql(sourceExpression, tableExpression) {
    const safe = expression => `(CASE WHEN json_valid(${expression}) THEN ${expression} ELSE '{}' END)`;
    const source = safe(sourceExpression), table = safe(tableExpression);
    const at = (root, path) => `json_extract(${root}, '$.${path}')`;
    const fields = paths => `COALESCE(${paths.flatMap(p => [at(source, p), at(table, p)]).join(',')},NULL)`;
    return `json_object(
      'videoId',CASE WHEN json_type(${source}, '$.playback_source') IS NOT NULL
        THEN ${at(source, 'playback_source.history[#-1].source.video_id')}
        ELSE ${fields(['source.audio.video.videoId', 'source.captions.video.videoId', 'audio.video.videoId'])} END,
      'mime',SUBSTR(${fields(['source.audio.media.mime', 'source.captions.media.mime', 'audio.media.mime'])},1,100),
      'durationSeconds',${fields(['source.audio.durationSec', 'source.audio.media.durationSec', 'source.audio.media.duration_seconds', 'source.captions.media.durationSec', 'source.captions.durationSec', 'source.youtube.duration_seconds', 'youtube.duration_seconds'])},
      'source',SUBSTR(${fields(['source.audio.video.author', 'source.audio.video.channelTitle', 'source.captions.video.author', 'source.captions.video.channelTitle', 'source.youtube.author', 'youtube.author', 'author'])},1,200),
      'language',SUBSTR(${fields(['source.audio.language', 'source.captions.captions.language', 'source.captions.language', 'source.language', 'language'])},1,40),
      'hasCaptions',(${fields(['source.captions'])} IS NOT NULL),
      'originalDate',SUBSTR(${fields(['source.audio.video.publishedAt', 'source.youtube.published_at', 'youtube.published_at'])},1,40)
    )`;
  }
  function normalize(value) {
    let raw; try { raw = typeof value === 'string' ? JSON.parse(value) : value; } catch (_) {} raw = raw || {};
    const text = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const videoId = /^[a-zA-Z0-9_-]{11}$/.test(raw.videoId || '') ? raw.videoId : null;
    const mime = text(raw.mime, 100).toLowerCase();
    const durationSeconds = typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds) && raw.durationSeconds > 0 ? raw.durationSeconds : null;
    return { videoId, kind: videoId || mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'text',
      durationSeconds, source: text(raw.source, 200) || (videoId ? 'YouTube' : ''), language: text(raw.language, 40), hasCaptions: raw.hasCaptions === true || raw.hasCaptions === 1,
      originalDate: Number.isFinite(Date.parse(raw.originalDate)) ? raw.originalDate : null };
  }
  return Object.freeze({ projectionSql, normalize });
});
