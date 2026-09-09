// Per-card playback source. Canon: texts.source_meta_json.playback_source.
// Media package external_ref is historical acquisition provenance, not a second editor.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlaybackSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'studio-playback-source-v1', ID = /^[A-Za-z0-9_-]{11}$/, HASH = /^[a-f0-9]{64}$/;
  const MAX_REVISIONS = 128, MAX_OFFSET_MS = 10800000;
  const copy = value => JSON.parse(JSON.stringify(value));
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function parseVideoId(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    let u; try { u = new URL(value.trim()); } catch (_) { return null; }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) return null;
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') return parts.length === 1 && ID.test(parts[0]) ? parts[0] : null;
    if (!['youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) return null;
    if (parts.length === 1 && parts[0] === 'watch') {
      const ids = u.searchParams.getAll('v'); return ids.length === 1 && ID.test(ids[0]) ? ids[0] : null;
    }
    return parts.length === 2 && ['embed', 'shorts', 'live'].includes(parts[0]) && ID.test(parts[1]) ? parts[1] : null;
  }
  function canonicalUrl(id) { if (!ID.test(String(id || ''))) fail('PLAYBACK_SOURCE_INVALID'); return 'https://www.youtube.com/watch?v=' + id; }
  function exactKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('PLAYBACK_SOURCE_INVALID');
  }
  function validate(record) {
    exactKeys(record, ['schema', 'revision', 'history']);
    if (record.schema !== SCHEMA || !Number.isSafeInteger(record.revision) || !Array.isArray(record.history) ||
        !record.history.length || record.history.length > MAX_REVISIONS || record.revision !== record.history.length) fail('PLAYBACK_SOURCE_INVALID');
    record.history.forEach((entry, index) => {
      exactKeys(entry, ['revision', 'source', 'offset_ms', 'timing', 'created_at']);
      if (entry.revision !== index + 1 || !Number.isSafeInteger(entry.offset_ms) || Math.abs(entry.offset_ms) > MAX_OFFSET_MS) fail('PLAYBACK_SOURCE_INVALID');
      if (entry.source !== null) {
        exactKeys(entry.source, ['kind', 'video_id', 'url']);
        if (entry.source.kind !== 'youtube' || !ID.test(String(entry.source.video_id || '')) || entry.source.url !== canonicalUrl(entry.source.video_id)) fail('PLAYBACK_SOURCE_INVALID');
      }
      exactKeys(entry.timing, ['status', 'basis_sha256']);
      if (!['unverified', 'owner-confirmed', 'source-captions'].includes(entry.timing.status)) fail('PLAYBACK_SOURCE_INVALID');
      if (entry.timing.basis_sha256 !== null && !HASH.test(String(entry.timing.basis_sha256))) fail('PLAYBACK_SOURCE_INVALID');
      if (entry.timing.status === 'owner-confirmed' && !entry.timing.basis_sha256) fail('PLAYBACK_SOURCE_INVALID');
      if (entry.created_at !== null && (typeof entry.created_at !== 'string' || entry.created_at.length > 40 || !Number.isFinite(Date.parse(entry.created_at)))) fail('PLAYBACK_SOURCE_INVALID');
    });
    return copy(record);
  }
  function selected(record) { const safe = validate(record); return safe.history[safe.revision - 1]; }
  function append(previous, input, options) {
    options = options || {}; input = input || {};
    const history = previous ? validate(previous).history : [];
    if (history.length >= MAX_REVISIONS) fail('PLAYBACK_HISTORY_LIMIT');
    const id = input.remove ? null : parseVideoId(input.url);
    if (!input.remove && !id) fail('PLAYBACK_SOURCE_INVALID');
    const offset = input.offset_ms == null ? 0 : input.offset_ms;
    if (!Number.isSafeInteger(offset) || Math.abs(offset) > MAX_OFFSET_MS) fail('PLAYBACK_OFFSET_INVALID');
    const confirmed = !input.remove && input.confirmed === true;
    if (confirmed && !HASH.test(String(options.basis_sha256 || ''))) fail('PLAYBACK_BASIS_REQUIRED');
    history.push({ revision: history.length + 1,
      source: id ? { kind: 'youtube', video_id: id, url: canonicalUrl(id) } : null,
      offset_ms: input.remove ? 0 : offset,
      // A default mapping may retain a basis without claiming a human checked it.
      timing: { status: confirmed ? 'owner-confirmed' : 'unverified', basis_sha256: !input.remove && HASH.test(String(options.basis_sha256 || '')) ? options.basis_sha256 : null },
      created_at: options.now || new Date().toISOString() });
    return validate({ schema: SCHEMA, revision: history.length, history });
  }
  function fromLegacy(audio) {
    const raw = audio && audio.video;
    const id = raw && (ID.test(String(raw.videoId || '')) ? raw.videoId : parseVideoId(raw.url));
    if (!id) return null;
    return { schema: SCHEMA, revision: 1, history: [{ revision: 1, source: { kind: 'youtube', video_id: id, url: canonicalUrl(id) },
      offset_ms: 0, timing: { status: 'source-captions', basis_sha256: null }, created_at: null }] };
  }
  function parseMeta(raw) {
    if (raw == null || raw === '') return {};
    let value; try { value = typeof raw === 'string' ? JSON.parse(raw) : copy(raw); } catch (_) { fail('PLAYBACK_METADATA_INVALID'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PLAYBACK_METADATA_INVALID');
    return value;
  }
  function fromText(text, legacyAudio) {
    const meta = parseMeta(text && (text.source_meta_json || text.sourceMetaJson || text.source_meta));
    if (Object.prototype.hasOwnProperty.call(meta, 'playback_source')) return validate(meta.playback_source);
    return fromLegacy(legacyAudio);
  }
  function fromPackageReference(reference) {
    const ref = reference && (reference.source || reference);
    return ref ? fromLegacy({video:ref}) : null;
  }
  async function digest(text) {
    const c = typeof crypto !== 'undefined' && crypto.subtle ? crypto : require('node:crypto').webcrypto;
    const hash = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2,'0')).join('');
  }
  function rowText(row) { return String(row && (row.he || row.he_plain || row.hebrew_plain || row.hebrew) || ''); }
  function safeEntries(audio, rowCount) {
    const entries = audio && audio.timing && audio.timing.entries;
    if (!Array.isArray(entries) || !entries.length || entries.length > 50000) return null;
    let lastTime = -1, lastRow = -1;
    const out = [];
    for (const entry of entries) {
      if (!entry || !Number.isInteger(entry.o) || entry.o < 0 || entry.o > rowCount || !Number.isFinite(entry.t) || entry.t < 0 ||
          entry.t < lastTime || entry.o < lastRow) return null;
      if (entry.o === rowCount && !entry.blind) return null;
      const value = {o:entry.o,t:Math.round(entry.t*1000)/1000};
      if (entry.blind) value.blind = true;
      if (entry.end != null) {
        if (!Number.isFinite(entry.end) || entry.end <= entry.t) return null;
        value.end = Math.round(entry.end*1000)/1000;
      }
      lastTime = entry.t; lastRow = entry.o; out.push(value);
    }
    return out;
  }
  async function timingBasis(audio, rows) {
    const entries = safeEntries(audio, (rows || []).length);
    if (!entries || !entries.some(entry => !entry.blind)) return null;
    // No text IDs, provider diagnostics or object-key ordering: stable across package import.
    return digest(JSON.stringify({ media: audio && audio.media && audio.media.sha256 || null,
      rows: (rows || []).map(rowText), entries: entries.map(entry => [entry.o, Math.round(entry.t*1000), entry.end == null ? null : Math.round(entry.end*1000), !!entry.blind]) }));
  }
  async function youtubeView(audio, rows, record) {
    const binding = record || fromLegacy(audio);
    if (!binding) return {video:null,entries:null,reason:'PLAYBACK_SOURCE_MISSING',revision:0};
    const current = selected(binding);
    if (!current.source) return {video:null,entries:null,reason:'PLAYBACK_SOURCE_MISSING',revision:binding.revision};
    const result = {video:{platform:'youtube',videoId:current.source.video_id,url:current.source.url},entries:null,reason:null,revision:binding.revision,offset_ms:current.offset_ms};
    // Product default: the selected YouTube video uses the local source clock.
    // This is a runtime policy, NOT an owner-confirmed assertion or a DB migration.
    result.timingPolicy = current.timing.status === 'unverified' ? 'same-video-default' : current.timing.status;
    if (current.timing.basis_sha256 && await timingBasis(audio,rows) !== current.timing.basis_sha256) { result.reason = 'PLAYBACK_TIMING_CHANGED'; return result; }
    const entries = safeEntries(audio,(rows||[]).length);
    if (!entries) { result.reason = 'PLAYBACK_TIMING_MISSING'; return result; }
    const offset = current.offset_ms/1000;
    // Do not clip a partial segment to zero: that would assert an unverified new boundary.
    if (entries.some(entry => entry.t + offset < 0)) { result.reason = 'PLAYBACK_OFFSET_OUTSIDE'; return result; }
    result.entries = entries.map(entry => ({...entry,t:entry.t+offset,...(entry.end==null?{}:{end:entry.end+offset})}));
    return result;
  }
  // Runtime projection only. Never persist it over the original acquisition passport:
  // local bytes and their clock remain available when the learner switches back.
  async function playbackAudio(audio, rows, text, preference) {
    if (preference === 'local' && audio && audio.media) return {...audio,video:null,playbackKind:'local'};
    const meta=parseMeta(text && (text.source_meta_json || text.sourceMetaJson || text.source_meta));
    const explicit=Object.prototype.hasOwnProperty.call(meta,'playback_source');
    if (!explicit && preference !== 'youtube') return audio;
    const record=explicit?validate(meta.playback_source):fromLegacy(audio);
    if (!record) return audio;
    const entry=selected(record);
    if (!entry.source) return audio ? {...audio,video:null} : null;
    const view=await youtubeView(audio,rows,record);
    return {...(audio || {}),media:null,video:view.video,
      timing:view.entries?{...(audio && audio.timing || {}),entries:view.entries}:null,
      playbackKind:'youtube',playbackReason:view.reason,playbackRevision:view.revision,playbackTimingPolicy:view.timingPolicy};
  }
  function isPublished(meta) { return !!(meta && (meta.corpus || meta.public_corpus || meta.group_corpus)); }
  function createRepository(adapter) {
    const one = async id => (await adapter.dbQuery('SELECT id,source_meta_json FROM texts WHERE id=?',[String(id)]))[0] || null;
    return {
      async read(id) { const row = await one(id); if (!row) fail('PLAYBACK_TEXT_MISSING'); const meta = parseMeta(row.source_meta_json); return meta.playback_source ? validate(meta.playback_source) : null; },
      async save(id, input, options) {
        options = options || {};
        const row = await one(id); if (!row) fail('PLAYBACK_TEXT_MISSING');
        const meta = parseMeta(row.source_meta_json); if (isPublished(meta)) fail('PLAYBACK_PUBLISHED_READ_ONLY');
        const previous = meta.playback_source ? validate(meta.playback_source) : null;
        if (options.expected_revision !== (previous ? previous.revision : 0)) fail('PLAYBACK_SOURCE_STALE');
        const next = append(previous,input,options); meta.playback_source = next;
        const serialized = JSON.stringify(meta);
        // One atomic statement; no SELECT ... then unconditional overwrite of another tab's edit.
        await adapter.dbRun('UPDATE texts SET source_meta_json=?,updated_at=? WHERE id=? AND source_meta_json IS ?',
          [serialized,new Date().toISOString(),String(id),row.source_meta_json == null ? null : row.source_meta_json]);
        const after = await one(id);
        if (!after || after.source_meta_json !== serialized) fail('PLAYBACK_SOURCE_STALE');
        return next;
      }
    };
  }
  return {SCHEMA,MAX_REVISIONS,parseVideoId,canonicalUrl,validate,selected,append,fromLegacy,fromText,fromPackageReference,
    parseMeta,isPublished,timingBasis,youtubeView,playbackAudio,safeEntries,digest,createRepository};
});
