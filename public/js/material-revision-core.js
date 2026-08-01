(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaterialRevisionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FIELD_NAMES = ['he_plain', 'he_niqqud', 'translit', 'translit_ru', 'ru'];

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) {
        if (value[key] !== undefined) out[key] = canonical(value[key]);
      }
      return out;
    }
    if (value === undefined) return null;
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  }

  function stableStringify(value) { return JSON.stringify(canonical(value)); }

  async function sha256Hex(value) {
    const input = typeof value === 'string' ? value : stableStringify(value);
    if (typeof require === 'function') {
      try { return require('node:crypto').createHash('sha256').update(input, 'utf8').digest('hex'); } catch (_) {}
    }
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('SHA256_UNAVAILABLE');
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function cleanMeta(meta) {
    const out = {};
    for (const field of FIELD_NAMES) {
      const raw = meta && meta[field];
      if (!raw || typeof raw !== 'object') continue;
      const authority = ['source', 'provider', 'user', 'imported'].includes(raw.authority) ? raw.authority : 'imported';
      out[field] = {
        authority,
        locked: authority === 'user' ? raw.locked !== false : !!raw.locked,
        status: ['current', 'invalidated', 'conflict'].includes(raw.status) ? raw.status : 'current',
        ...(raw.provider ? { provider: String(raw.provider) } : {}),
        ...(raw.model ? { model: String(raw.model) } : {}),
        ...(raw.profile ? { profile: String(raw.profile) } : {}),
        ...(raw.input_sha256 ? { input_sha256: String(raw.input_sha256) } : {}),
      };
    }
    return out;
  }

  function normalizeRow(row, index) {
    const sourceIds = Array.isArray(row && row.source_segment_ids)
      ? [...new Set(row.source_segment_ids.map(String))].sort() : [];
    const stableId = String(row && (row.stable_row_id || row._v3_sentenceId) || '').trim();
    if (!stableId) throw new Error('STABLE_ROW_ID_REQUIRED:' + index);
    const out = {
      stable_row_id: stableId,
      he_plain: String(row.he_plain ?? row.he ?? ''),
      he_niqqud: String(row.he_niqqud ?? ''),
      translit: String(row.translit ?? ''),
      translit_ru: String(row.translit_ru ?? ''),
      ru: String(row.ru ?? ''),
      caption_segment_id: row.caption_segment_id == null ? null : String(row.caption_segment_id),
      source_segment_ids: sourceIds,
      field_meta: cleanMeta(row.field_meta || {}),
    };
    if (row.mapping_meta && typeof row.mapping_meta === 'object') out.mapping_meta = canonical(row.mapping_meta);
    return out;
  }

  async function createTableSnapshot(input) {
    const rows = (input && Array.isArray(input.rows) ? input.rows : []).map(normalizeRow);
    const ids = new Set();
    for (const row of rows) {
      if (ids.has(row.stable_row_id)) throw new Error('DUPLICATE_STABLE_ROW_ID:' + row.stable_row_id);
      ids.add(row.stable_row_id);
    }
    const providerContext = canonical(input && input.provider_context || {});
    const content = rows.map((r) => ({
      stable_row_id: r.stable_row_id,
      he_plain: r.he_plain, he_niqqud: r.he_niqqud, translit: r.translit,
      translit_ru: r.translit_ru, ru: r.ru, field_meta: r.field_meta,
    }));
    const mapping = rows.map((r, order_index) => ({
      stable_row_id: r.stable_row_id, order_index,
      caption_segment_id: r.caption_segment_id,
      source_segment_ids: r.source_segment_ids,
      mapping_meta: r.mapping_meta || {},
    }));
    return {
      rows, provider_context: providerContext,
      content_sha256: await sha256Hex({ rows: content, provider_context: providerContext }),
      mapping_sha256: await sha256Hex(mapping),
    };
  }

  function unlockedFields(row, fields) {
    return fields.filter((field) => {
      const meta = row.field_meta && row.field_meta[field];
      return !(meta && meta.authority === 'user' && meta.locked !== false);
    });
  }

  function analyzeImpact(input) {
    const rows = (input && Array.isArray(input.rows) ? input.rows : []).map(normalizeRow);
    const change = input && input.change || {};
    if (change.kind === 'caption_timing') return { conflicts: [], impacted: [], reason: 'TIMING_ONLY' };
    if (change.kind === 'caption_speaker') return { conflicts: [], impacted: [], reason: 'SPEAKER_ONLY' };
    let fields = change.kind === 'provider'
      ? (Array.isArray(change.fields) ? change.fields.filter((f) => FIELD_NAMES.includes(f)) : FIELD_NAMES.slice())
      : FIELD_NAMES.slice();
    const segmentIds = new Set((change.caption_segment_ids || []).map(String));
    const mappedOnly = change.kind === 'caption_text' || change.kind === 'mapping';
    const impacted = [];
    for (const row of rows) {
      if (mappedOnly && !segmentIds.has(String(row.caption_segment_id || ''))) continue;
      const selected = unlockedFields(row, fields);
      if (selected.length) impacted.push({ stable_row_id: row.stable_row_id, fields: selected });
    }
    const conflicts = change.kind === 'mapping'
      ? impacted.map((item) => ({ code: 'MAPPING_REVIEW_REQUIRED', stable_row_id: item.stable_row_id, mapping: String(change.mapping || 'changed') }))
      : [];
    return { conflicts, impacted, reason: change.kind === 'provider' ? 'PROVIDER_CHANGED' : (change.kind === 'mapping' ? 'MAPPING_CHANGED' : 'CAPTION_TEXT_CHANGED') };
  }

  function buildRegenerationPreflight(input) {
    const impact = input && input.impact || { impacted: [] };
    const impacted = Array.isArray(impact.impacted) ? impact.impacted : [];
    return {
      provider: String(input && input.provider || ''),
      model: String(input && input.model || ''),
      row_count: impacted.length,
      field_count: impacted.reduce((n, item) => n + item.fields.length, 0),
      request_ids: impacted.map((item) => 'regen:' + item.stable_row_id),
      fallback: false,
    };
  }

  function applyProviderCandidates(input) {
    const rows = (input && Array.isArray(input.rows) ? input.rows : []).map(normalizeRow);
    const impacted = input && input.impact && Array.isArray(input.impact.impacted) ? input.impact.impacted : [];
    const candidates = input && Array.isArray(input.candidates) ? input.candidates : [];
    if (candidates.length !== impacted.length) throw new Error('REGEN_CARDINALITY_MISMATCH');
    const expected = new Map(impacted.map((item) => ['regen:' + item.stable_row_id, item]));
    const seen = new Set();
    const candidateById = new Map();
    for (const candidate of candidates) {
      const id = String(candidate && candidate.request_id || '');
      if (!expected.has(id) || seen.has(id)) throw new Error('REGEN_REQUEST_ID_MISMATCH:' + id);
      seen.add(id); candidateById.set(id, candidate);
    }
    if (seen.size !== expected.size) throw new Error('REGEN_CARDINALITY_MISMATCH');
    return rows.map((row) => {
      const id = 'regen:' + row.stable_row_id;
      const item = expected.get(id), candidate = candidateById.get(id);
      if (!item || !candidate) return row;
      const next = { ...row, field_meta: { ...row.field_meta } };
      for (const field of item.fields) {
        if (!candidate.fields || !(field in candidate.fields)) throw new Error('REGEN_FIELD_MISSING:' + id + ':' + field);
        next[field] = String(candidate.fields[field] ?? '');
        next.field_meta[field] = {
          authority: 'provider', locked: false, status: 'current',
          provider: String(candidate.provenance && candidate.provenance.provider || ''),
          model: String(candidate.provenance && candidate.provenance.model || ''),
          ...(candidate.provenance && candidate.provenance.profile ? { profile: String(candidate.provenance.profile) } : {}),
          input_sha256: String(candidate.provenance && candidate.provenance.input_sha256 || ''),
        };
      }
      return normalizeRow(next);
    });
  }

  return { FIELD_NAMES, canonical, stableStringify, sha256Hex, normalizeRow, createTableSnapshot, analyzeImpact, buildRegenerationPreflight, applyProviderCandidates };
});
