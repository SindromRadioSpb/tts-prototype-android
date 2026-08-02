// Studio Ingest P2 — pure Portable Learning Package v2 core.
// No DB, OPFS, DOM, network, provider or model side effects.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PortableLearningPackageCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'linguistpro-portable-learning-package';
  const SCHEMA_VERSION = 2;
  const MiB = 1024 * 1024;
  const LIMITS = Object.freeze({ archive: 128 * MiB, uncompressed: 512 * MiB, entries: 4096, entry: 64 * MiB, manifest: MiB, readme: 256 * 1024, ratio: 100, pathBytes: 240, depth: 5, jsonDepth: 64 });
  const NODE_TYPES = Object.freeze(['media_asset', 'media_package', 'import_run', 'caption_track', 'caption_revision', 'learning_material', 'table_revision', 'learning_row_version', 'projection', 'portable_package']);
  const RELATIONS = Object.freeze(['references_media', 'produced_from', 'derived_from', 'bound_to_revision', 'contains', 'maps_to_segment', 'projection_of', 'supersedes', 'conflicts_with', 'included_in']);
  const MANIFEST_KEYS = Object.freeze(['schema', 'schema_version', 'package_mode', 'portable_package_id', 'content_root_sha256', 'roots', 'history', 'media', 'entries', 'privacy']);

  function fail(code, detail) { const error = new Error(code + (detail ? ':' + detail : '')); error.code = code; throw error; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function isHex(value) { return /^[a-f0-9]{64}$/.test(String(value || '')); }
  function cleanHex(value, code) { const out = String(value || '').toLowerCase(); if (!isHex(out)) fail(code || 'HASH_INVALID'); return out; }
  function utf8(value) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(String(value)) : new Uint8Array(Buffer.from(String(value), 'utf8')); }
  function cryptoObject() { if (typeof crypto !== 'undefined' && crypto.subtle) return crypto; return require('node:crypto').webcrypto; }
  async function sha256Hex(value) {
    const bytes = value instanceof Uint8Array ? value : utf8(String(value));
    const digest = await cryptoObject().subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function validString(value) {
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++index);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
  }
  function keyCompare(left, right) {
    const a = Array.from(left, (value) => value.codePointAt(0));
    const b = Array.from(right, (value) => value.codePointAt(0));
    for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index] - b[index];
    return a.length - b.length;
  }
  function canonicalValue(value, depth) {
    if ((depth || 0) > LIMITS.jsonDepth) fail('CANONICAL_DEPTH_EXCEEDED');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { if (!validString(value)) fail('CANONICAL_STRING_INVALID'); return value; }
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('CANONICAL_NUMBER_INVALID');
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => canonicalValue(item, (depth || 0) + 1));
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('CANONICAL_TYPE_INVALID');
    const out = {};
    for (const key of Object.keys(value).sort(keyCompare)) {
      if (!validString(key)) fail('CANONICAL_STRING_INVALID');
      if (value[key] === undefined) fail('CANONICAL_UNDEFINED');
      out[key] = canonicalValue(value[key], (depth || 0) + 1);
    }
    return out;
  }
  function canonicalJson(value) { return JSON.stringify(canonicalValue(value, 0)); }

  // Diagnostic provenance may contain measured seconds/ratios from legacy ASR runs.
  // Package JSON remains integer-only: finite decimals are preserved explicitly as
  // their shortest decimal strings instead of weakening the canonical number rule.
  function canonicalDiagnosticValue(value, depth) {
    if ((depth || 0) > LIMITS.jsonDepth) fail('CANONICAL_DEPTH_EXCEEDED');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return canonicalValue(value, depth || 0);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('CANONICAL_NUMBER_INVALID');
      if (Object.is(value, -0)) return 0;
      if (Number.isSafeInteger(value)) return value;
      if (Number.isInteger(value)) fail('CANONICAL_NUMBER_INVALID');
      return String(value);
    }
    if (Array.isArray(value)) return value.map((item) => canonicalDiagnosticValue(item, (depth || 0) + 1));
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('CANONICAL_TYPE_INVALID');
    const out = {};
    for (const key of Object.keys(value).sort(keyCompare)) {
      if (!validString(key) || value[key] === undefined) fail(value[key] === undefined ? 'CANONICAL_UNDEFINED' : 'CANONICAL_STRING_INVALID');
      out[key] = canonicalDiagnosticValue(value[key], (depth || 0) + 1);
    }
    return out;
  }

  // A small strict JSON parser is used so duplicate keys cannot be hidden by JSON.parse.
  function parseJsonStrict(source) {
    const text = String(source == null ? '' : source);
    let index = 0;
    function skip() { while (/\s/.test(text[index] || '')) index++; }
    function string() {
      if (text[index] !== '"') fail('JSON_STRING_EXPECTED');
      const start = index++;
      while (index < text.length) {
        const ch = text[index++];
        if (ch === '"') {
          let value;
          try { value = JSON.parse(text.slice(start, index)); } catch (_) { fail('JSON_STRING_INVALID'); }
          if (!validString(value)) fail('JSON_STRING_INVALID');
          return value;
        }
        if (ch === '\\') { if (index >= text.length) fail('JSON_STRING_INVALID'); index++; }
        else if (ch.charCodeAt(0) < 0x20) fail('JSON_STRING_INVALID');
      }
      fail('JSON_STRING_INVALID');
    }
    function value(depth) {
      if (depth > LIMITS.jsonDepth) fail('JSON_DEPTH_EXCEEDED');
      skip(); const ch = text[index];
      if (ch === '"') return string();
      if (ch === '{') {
        index++; skip(); const out = {}; const keys = new Set();
        if (text[index] === '}') { index++; return out; }
        while (index < text.length) {
          skip(); const key = string(); if (keys.has(key)) fail('JSON_DUPLICATE_KEY', key); keys.add(key);
          skip(); if (text[index++] !== ':') fail('JSON_COLON_EXPECTED');
          out[key] = value(depth + 1); skip();
          if (text[index] === '}') { index++; return out; }
          if (text[index++] !== ',') fail('JSON_COMMA_EXPECTED');
        }
        fail('JSON_OBJECT_UNTERMINATED');
      }
      if (ch === '[') {
        index++; skip(); const out = [];
        if (text[index] === ']') { index++; return out; }
        while (index < text.length) {
          out.push(value(depth + 1)); skip();
          if (text[index] === ']') { index++; return out; }
          if (text[index++] !== ',') fail('JSON_COMMA_EXPECTED');
        }
        fail('JSON_ARRAY_UNTERMINATED');
      }
      for (const pair of [['true', true], ['false', false], ['null', null]]) {
        if (text.slice(index, index + pair[0].length) === pair[0]) { index += pair[0].length; return pair[1]; }
      }
      const match = /^-?(?:0|[1-9]\d*)/.exec(text.slice(index));
      if (match) {
        index += match[0].length;
        if (/[.eE]/.test(text[index] || '')) fail('JSON_NUMBER_INVALID');
        const number = Number(match[0]); if (!Number.isSafeInteger(number) || Object.is(number, -0)) fail('JSON_NUMBER_INVALID'); return number;
      }
      fail('JSON_VALUE_INVALID');
    }
    const out = value(0); skip(); if (index !== text.length) fail('JSON_TRAILING_DATA'); return out;
  }

  async function hashObject(value) { return sha256Hex(canonicalJson(value)); }
  function asciiCompare(a,b){return a<b?-1:a>b?1:0;}
  function sortById(values) { return values.map((value) => ({ value, key: String(value.id) })).sort((a, b) => asciiCompare(a.key, b.key)).map((item) => item.value); }
  function sortEdges(values) { return values.map((value) => ({ value, key: [value.from, value.relation, value.to, value.to_fragment || ''].join('\u0000') })).sort((a, b) => asciiCompare(a.key, b.key)).map((item) => item.value); }
  function selectedById(values, id, code) { const found = (values || []).find((item) => String(item.revision_id || item.table_revision_id) === String(id)); if (!found) fail(code); return found; }

  async function portableModel(input, mode) {
    if (!input || !input.package || !input.raw_track || !input.corrected_track || !input.material) fail('PACKAGE_INPUT_INVALID');
    if (!['snapshot', 'archive'].includes(mode)) fail('PACKAGE_MODE_INVALID');
    const rawAll = clone(input.raw_revisions || []);
    const correctedAll = clone(input.corrected_revisions || []);
    const tablesAll = clone(input.table_revisions || []);
    const correctedSelected = selectedById(correctedAll, input.selected_caption_revision_id || input.corrected_track.current_revision_id, 'SELECTED_CAPTION_REVISION_MISSING');
    const tableSelected = selectedById(tablesAll, input.selected_table_revision_id || input.material.current_table_revision_id, 'SELECTED_TABLE_REVISION_MISSING');
    const rawSelected = selectedById(rawAll, input.raw_track.current_revision_id || (rawAll[rawAll.length - 1] && rawAll[rawAll.length - 1].revision_id), 'RAW_REVISION_MISSING');
    if (!String(input.material.portable_text_key || (input.text && input.text.text_key) || '').trim()) fail('PORTABLE_TEXT_KEY_REQUIRED');
    if (tableSelected.bound_caption_revision_sha256 !== correctedSelected.canonical_sha256) fail('TABLE_CAPTION_HASH_MISMATCH');
    const raw = mode === 'archive' ? rawAll : [rawSelected];
    const corrected = mode === 'archive' ? correctedAll : [correctedSelected];
    const tables = mode === 'archive' ? tablesAll : [tableSelected];
    const mediaSha = input.package.media_sha256 ? cleanHex(input.package.media_sha256, 'MEDIA_SHA256_INVALID') : null;
    const mediaId = mediaSha ? 'media:sha256:' + mediaSha : null;
    const mediaPackageDescriptor = { media_sha256: mediaSha, raw_revision_sha256: cleanHex(rawSelected.canonical_sha256), schema: 'media-package-portable-v1' };
    const mediaPackageHash = await hashObject(mediaPackageDescriptor);
    const mediaPackageId = 'media-package:sha256:' + mediaPackageHash;
    const rawRoot = 'caption-revision:sha256:' + cleanHex(raw[0].canonical_sha256);
    const rawTrackHash = await hashObject({ role: 'raw_original', language: input.raw_track.language || null, media_package_id: mediaPackageId, root_revision_id: rawRoot });
    const rawTrackId = 'caption-track:sha256:' + rawTrackHash;
    const correctedTrackHash = await hashObject({ role: 'user_corrected', language: input.corrected_track.language || null, media_package_id: mediaPackageId, root_revision_id: 'caption-revision:sha256:' + cleanHex(corrected[0].canonical_sha256) });
    const correctedTrackId = 'caption-track:sha256:' + correctedTrackHash;
    const captionPortable = new Map();
    for (const revision of raw.concat(corrected)) captionPortable.set(String(revision.revision_id), 'caption-revision:sha256:' + cleanHex(revision.canonical_sha256));
    const textKey = String(input.material.portable_text_key || input.text.text_key);
    const materialHash = await hashObject({ text_key: textKey, media_package_id: mediaPackageId });
    const materialId = 'learning-material:sha256:' + materialHash;
    const tablePortable = new Map();
    for (const revision of tablesAll.slice().sort((a, b) => Number(a.revision_no) - Number(b.revision_no))) {
      const parent = revision.parent_revision_id ? tablePortable.get(String(revision.parent_revision_id)) || null : null;
      const bound = captionPortable.get(String(revision.bound_caption_revision_id)) || ('caption-revision:sha256:' + cleanHex(revision.bound_caption_revision_sha256));
      const hash = await hashObject({ content_sha256: cleanHex(revision.content_sha256), mapping_sha256: cleanHex(revision.mapping_sha256), bound_caption_revision_id: bound, parent_table_revision_id: parent });
      tablePortable.set(String(revision.table_revision_id), 'table-revision:sha256:' + hash);
    }
    const firstRows = new Map();
    for (const revision of tablesAll.slice().sort((a, b) => Number(a.revision_no) - Number(b.revision_no))) {
      const portableTableId = tablePortable.get(String(revision.table_revision_id));
      (revision.rows || []).forEach((row, order) => {
        const key = String(row.stable_row_id);
        if (!firstRows.has(key)) firstRows.set(key, { table: portableTableId, order });
      });
    }
    const rowPortable = new Map();
    for (const [stableId, first] of firstRows) rowPortable.set(stableId, 'learning-row:sha256:' + await hashObject({ material_id: materialId, first_table_revision_id: first.table, first_order: first.order }));
    const portableTables = tables.map((revision) => ({
      portable_table_revision_id: tablePortable.get(String(revision.table_revision_id)),
      revision_no: Number(revision.revision_no),
      parent_table_revision_id: revision.parent_revision_id ? tablePortable.get(String(revision.parent_revision_id)) || null : null,
      bound_caption_revision_id: captionPortable.get(String(revision.bound_caption_revision_id)) || ('caption-revision:sha256:' + cleanHex(revision.bound_caption_revision_sha256)),
      bound_caption_revision_sha256: cleanHex(revision.bound_caption_revision_sha256),
      content_sha256: cleanHex(revision.content_sha256), mapping_sha256: cleanHex(revision.mapping_sha256),
      provider_context: clone(revision.provider_context || {}), impact: clone(revision.impact || {}),
      rows: (revision.rows || []).map((row, order) => ({
        portable_row_id: row.portable_row_id || rowPortable.get(String(row.stable_row_id)), order_index: order,
        he_plain: String(row.he_plain || ''), he_niqqud: String(row.he_niqqud || ''), translit: String(row.translit || ''), translit_ru: String(row.translit_ru || ''), ru: String(row.ru || ''),
        caption_segment_id: row.caption_segment_id == null ? null : String(row.caption_segment_id), source_segment_ids: Array.isArray(row.source_segment_ids) ? row.source_segment_ids.map(String).sort() : [],
        field_meta: clone(row.field_meta || {}), mapping_meta: clone(row.mapping_meta || {}),
      })),
    }));
    const selectedPortableCaption = captionPortable.get(String(correctedSelected.revision_id));
    const selectedPortableTable = tablePortable.get(String(tableSelected.table_revision_id));
    const roots = { media_package: mediaPackageId, caption_revision: selectedPortableCaption, learning_material: materialId, table_revision: selectedPortableTable };
    const history = { caption_complete: mode === 'archive', table_complete: mode === 'archive', external_ancestors: [] };
    if (mode === 'snapshot') {
      if (correctedSelected.parent_revision_id) history.external_ancestors.push({ type: 'caption_revision', portable_id: captionPortable.get(String(correctedSelected.parent_revision_id)) || null });
      if (tableSelected.parent_revision_id) history.external_ancestors.push({ type: 'table_revision', portable_id: tablePortable.get(String(tableSelected.parent_revision_id)) || null });
    }
    const packageDescriptorHash = await hashObject({ schema: SCHEMA, schema_version: SCHEMA_VERSION, package_mode: mode, roots, history: { caption_complete: history.caption_complete, table_complete: history.table_complete } });
    const portablePackageId = 'portable-package:sha256:' + packageDescriptorHash;
    const material = { portable_material_id: materialId, portable_text_key: textKey, media_package_id: mediaPackageId, selected_caption_revision_id: selectedPortableCaption, selected_table_revision_id: selectedPortableTable };
    const mapping = { schema: 'portable-segment-row-map-v2', table_revision_id: selectedPortableTable, rows: portableTables.find((item) => item.portable_table_revision_id === selectedPortableTable).rows.map((row) => ({ portable_row_id: row.portable_row_id, order_index: row.order_index, caption_segment_id: row.caption_segment_id, source_segment_ids: row.source_segment_ids, mapping_meta: row.mapping_meta })) };
    const textCard = clone(input.text_card || { format: 'linguistpro-text-card-v2', card: { title: input.text && input.text.title || null, source_text: input.text && input.text.source_text || '', rows: [] } });
    delete textCard.exported_at; delete textCard.exported_by_app;
    if (textCard.card) {
      textCard.card.text_key = textKey;
      (textCard.card.rows || []).forEach((row, order) => { delete row.row_id; row.portable_row_id = portableTables.find((item) => item.portable_table_revision_id === selectedPortableTable).rows[order] && portableTables.find((item) => item.portable_table_revision_id === selectedPortableTable).rows[order].portable_row_id; });
    }
    return { input, mode, mediaSha, mediaId, mediaPackageId, rawTrackId, correctedTrackId, captionPortable, materialId, tablePortable, rowPortable, roots, history, portablePackageId, packageDescriptorHash, raw, corrected, portableTables, material, mapping, textCard };
  }

  function vttTime(ms) { const n = Math.max(0, Number(ms) || 0); const h = Math.floor(n / 3600000), m = Math.floor(n % 3600000 / 60000), s = Math.floor(n % 60000 / 1000), x = Math.floor(n % 1000); return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':') + '.' + String(x).padStart(3, '0'); }
  function vtt(revision) { return 'WEBVTT\n\n' + (revision.segments || []).map((segment, index) => [segment.caption_segment_id || segment.source_segment_id || String(index + 1), vttTime(segment.start_ms) + ' --> ' + vttTime(segment.end_ms), String(segment.text || '')].join('\n')).join('\n\n') + '\n'; }
  function semanticCardHash(card) { return hashObject(card); }

  async function buildGraph(model, projections) {
    const artifacts = [], edges = [];
    const artifactIds = new Set(), rowHashCache = new Map();
    const includedCaptionSources = new Set(model.raw.concat(model.corrected).map((revision) => String(revision.revision_id)));
    const includedTableIds = new Set(model.portableTables.map((revision) => revision.portable_table_revision_id));
    const uniqueRowKeys=new Set();for(const revision of model.portableTables)for(const row of revision.rows){uniqueRowKeys.add(canonicalJson({portable_row_id:row.portable_row_id,he_plain:row.he_plain,he_niqqud:row.he_niqqud,translit:row.translit,translit_ru:row.translit_ru,ru:row.ru,field_meta:row.field_meta}));}
    await Promise.all(Array.from(uniqueRowKeys).map(async(key)=>rowHashCache.set(key,await sha256Hex(key))));
    function node(id, type, canonicalHash, metadata) { artifacts.push({ id, type, canonical_hash: cleanHex(canonicalHash), schema_version: 1, canonical_ref: { store: type }, metadata: metadata || {} }); artifactIds.add(id); }
    function edge(from, relation, to, sourceHash, fragment) { edges.push({ from, relation, to, ...(fragment ? { to_fragment: fragment } : {}), source_hash: cleanHex(sourceHash), fact_kind: 'asserted' }); }
    if (model.mediaId) node(model.mediaId, 'media_asset', model.mediaSha, { mime: model.input.package.mime || null, size_bytes: model.input.package.size_bytes == null ? null : Number(model.input.package.size_bytes), duration_ms: model.input.package.duration_ms == null ? null : Number(model.input.package.duration_ms), codec_hint: model.input.package.codec_hint || null });
    node(model.mediaPackageId, 'media_package', model.packageDescriptorHash, { media_included: false });
    if (model.mediaId) edge(model.mediaPackageId, 'references_media', model.mediaId, model.packageDescriptorHash);
    const importRun = canonicalDiagnosticValue(model.input.import_run || {}), importRunHash = await hashObject(importRun), importRunId = 'import-run:sha256:' + importRunHash;
    node(importRunId, 'import_run', importRunHash, { warnings_count: Array.isArray(model.input.import_run && model.input.import_run.warnings) ? model.input.import_run.warnings.length : 0 });
    const trackHash = new Map([[model.rawTrackId, model.rawTrackId.slice(-64)], [model.correctedTrackId, model.correctedTrackId.slice(-64)]]);
    node(model.rawTrackId, 'caption_track', trackHash.get(model.rawTrackId), { role: 'raw_original', language: model.input.raw_track.language || null });
    node(model.correctedTrackId, 'caption_track', trackHash.get(model.correctedTrackId), { role: 'user_corrected', language: model.input.corrected_track.language || null });
    edge(model.correctedTrackId, 'derived_from', model.rawTrackId, trackHash.get(model.correctedTrackId));
    for (const revision of model.raw.concat(model.corrected)) {
      const id = model.captionPortable.get(String(revision.revision_id));
      node(id, 'caption_revision', revision.canonical_sha256, { role: model.raw.includes(revision) ? 'raw_original' : 'user_corrected', revision_no: Number(revision.revision_no) });
      edge(model.raw.includes(revision) ? model.rawTrackId : model.correctedTrackId, 'contains', id, revision.canonical_sha256);
      edge(id, 'produced_from', importRunId, revision.canonical_sha256);
      const sameTrack = model.raw.includes(revision) ? model.raw : model.corrected;
      const parent = revision.parent_revision_id && sameTrack.some((item)=>String(item.revision_id)===String(revision.parent_revision_id)) && model.captionPortable.get(String(revision.parent_revision_id));
      if (parent) edge(id, 'supersedes', parent, revision.canonical_sha256);
    }
    const materialHash = model.materialId.slice(-64);
    node(model.materialId, 'learning_material', materialHash, { portable_text_key_sha256: await sha256Hex(model.material.portable_text_key) });
    edge(model.materialId, 'bound_to_revision', model.roots.caption_revision, materialHash);
    edge(model.materialId, 'derived_from', model.mediaPackageId, materialHash);
    for (const revision of model.portableTables) {
      const id = revision.portable_table_revision_id, hash = id.slice(-64);
      node(id, 'table_revision', hash, { content_sha256: revision.content_sha256, mapping_sha256: revision.mapping_sha256, portable_body_sha256: revision.portable_body_sha256, revision_no: revision.revision_no });
      edge(model.materialId, 'contains', id, hash);
      edge(id, 'bound_to_revision', revision.bound_caption_revision_id, hash);
      if (revision.parent_table_revision_id && includedTableIds.has(revision.parent_table_revision_id)) edge(id, 'supersedes', revision.parent_table_revision_id, hash);
      for (const row of revision.rows) {
        const rowPayload = { portable_row_id: row.portable_row_id, he_plain: row.he_plain, he_niqqud: row.he_niqqud, translit: row.translit, translit_ru: row.translit_ru, ru: row.ru, field_meta: row.field_meta };
        const rowKey = canonicalJson(rowPayload);
        let rowHash = rowHashCache.get(rowKey); if (!rowHash) { rowHash = await sha256Hex(rowKey); rowHashCache.set(rowKey, rowHash); }
        if (!artifactIds.has(row.portable_row_id)) node(row.portable_row_id, 'learning_row_version', rowHash, { material_id: model.materialId });
        edge(id, 'contains', row.portable_row_id, hash);
        if (row.caption_segment_id) edge(row.portable_row_id, 'maps_to_segment', revision.bound_caption_revision_id, rowHash, row.caption_segment_id);
      }
    }
    for (const projection of projections) {
      node(projection.id, 'projection', projection.hash, { kind: projection.kind });
      edge(projection.id, 'projection_of', projection.source, projection.hash);
    }
    node(model.portablePackageId, 'portable_package', model.packageDescriptorHash, { package_mode: model.mode, history_complete: model.mode === 'archive' });
    for (const item of artifacts.slice()) if (item.id !== model.portablePackageId) edge(item.id, 'included_in', model.portablePackageId, item.canonical_hash);
    return { artifacts: sortById(artifacts), edges: sortEdges(edges) };
  }

  async function buildPackageFiles(input, options) {
    options = options || {}; const mode = options.mode || 'snapshot'; const model = await portableModel(input, mode);
    const files = {};
    const rawTrack = { schema: 'portable-caption-track-v2', portable_track_id: model.rawTrackId, role: 'raw_original', language: input.raw_track.language || null, current_revision_id: model.captionPortable.get(String(model.raw[model.raw.length - 1].revision_id)) };
    const correctedTrack = { schema: 'portable-caption-track-v2', portable_track_id: model.correctedTrackId, role: 'user_corrected', language: input.corrected_track.language || null, parent_track_id: model.rawTrackId, current_revision_id: model.roots.caption_revision };
    files['source/media-ref.json'] = canonicalJson({ schema: 'portable-media-ref-v2', media_included: false, media_sha256: model.mediaSha, mime: input.package.mime || null, size_bytes: input.package.size_bytes == null ? null : Number(input.package.size_bytes), duration_ms: input.package.duration_ms == null ? null : Number(input.package.duration_ms), codec_hint: input.package.codec_hint || null, original_name: input.package.original_name || null });
    files['provenance/import-run.json'] = canonicalJson(canonicalDiagnosticValue(input.import_run || {}));
    files['provenance/export.json'] = canonicalJson({ app_version: options.app_version || null, exported_at: options.exported_at || new Date().toISOString(), runtime: options.runtime || null });
    files['quality/report.json'] = canonicalJson(canonicalDiagnosticValue(input.quality_report || {}));
    files['tracks/raw/track.json'] = canonicalJson(rawTrack);
    files['tracks/corrected/track.json'] = canonicalJson(correctedTrack);
    function portableCaptionRevision(revision,trackRevisions) { const parent=revision.parent_revision_id&&trackRevisions.some((item)=>String(item.revision_id)===String(revision.parent_revision_id))?model.captionPortable.get(String(revision.parent_revision_id))||null:null;return { revision_no:Number(revision.revision_no), parent_revision_id:parent, segments:clone(revision.segments || []), operations:clone(revision.operations || []), canonical_sha256:cleanHex(revision.canonical_sha256), author_kind:revision.author_kind || 'import', provenance:canonicalDiagnosticValue(revision.provenance || {}) }; }
    for (const revision of model.raw) files['tracks/raw/revisions/' + cleanHex(revision.canonical_sha256) + '.json'] = canonicalJson({ schema: 'portable-caption-revision-v2', portable_revision_id: model.captionPortable.get(String(revision.revision_id)), revision:portableCaptionRevision(revision,model.raw) });
    for (const revision of model.corrected) files['tracks/corrected/revisions/' + cleanHex(revision.canonical_sha256) + '.json'] = canonicalJson({ schema: 'portable-caption-revision-v2', portable_revision_id: model.captionPortable.get(String(revision.revision_id)), revision:portableCaptionRevision(revision,model.corrected) });
    const selectedCorrected = selectedById(model.corrected, input.selected_caption_revision_id || input.corrected_track.current_revision_id, 'SELECTED_CAPTION_REVISION_MISSING');
    const selectedVtt = vtt(selectedCorrected), vttHash = await sha256Hex(selectedVtt);
    files['tracks/projections/' + vttHash + '.vtt'] = selectedVtt;
    files['learning/material.json'] = canonicalJson({ schema: 'portable-learning-material-v2', ...model.material, text: { text_key: model.material.portable_text_key, title: input.text && input.text.title || null, source_text: input.text && input.text.source_text || '', level: input.text && input.text.level || null, tags: (() => { try { const value = typeof input.text.tags_json === 'string' ? JSON.parse(input.text.tags_json) : input.text.tags_json; return Array.isArray(value) ? value : []; } catch (_) { return []; } })(), source: input.text && input.text.source || null, topic: input.text && input.text.topic || null } });
    for (const revision of model.portableTables) { revision.portable_body_sha256=await hashObject(revision); files['learning/table/revisions/' + revision.portable_table_revision_id.slice(-64) + '.json'] = canonicalJson({ schema: 'portable-table-revision-v2', ...revision }); }
    files['learning/mapping/' + model.roots.table_revision.slice(-64) + '.json'] = canonicalJson(model.mapping);
    files['learning/text-card.json'] = canonicalJson(model.textCard);
    const cardHash = await semanticCardHash(model.textCard);
    const graph = await buildGraph(model, [{ id: 'projection:vtt:sha256:' + vttHash, hash: vttHash, kind: 'vtt', source: model.roots.caption_revision }, { id: 'projection:text_card:sha256:' + cardHash, hash: cardHash, kind: 'text_card', source: model.materialId }]);
    files['graph/artifacts.json'] = canonicalJson({ schema: 'portable-artifacts-v2', artifacts: graph.artifacts });
    files['graph/edges.json'] = canonicalJson({ schema: 'portable-edges-v2', edges: graph.edges });
    files['README.txt'] = 'LinguistPro Portable Learning Package v2\nMedia bytes are not included. Relink by exact SHA-256.\n';
    const entries = [];
    for (const path of Object.keys(files).sort(keyCompare)) {
      const semantic = path !== 'provenance/export.json' && path !== 'README.txt';
      entries.push({ path, sha256: await sha256Hex(files[path]), size_bytes: utf8(files[path]).byteLength, media_type: path.endsWith('.json') ? 'application/json' : (path.endsWith('.vtt') ? 'text/vtt' : 'text/plain'), semantic });
    }
    const semanticList = entries.filter((entry) => entry.semantic).map((entry) => [entry.path, entry.sha256, entry.size_bytes, entry.media_type]);
    const contentRoot = await hashObject(semanticList);
    const privacy = { included: ['caption-canon', 'learning-table-canon', 'compatibility-projections'], excluded: ['media-bytes', 'notes', 'bookmarks', 'progress', 'review-memory', 'cloud-state', 'provider-secrets', 'device-identifiers'] };
    const manifest = { schema: SCHEMA, schema_version: SCHEMA_VERSION, package_mode: mode, portable_package_id: model.portablePackageId, content_root_sha256: contentRoot, roots: model.roots, history: model.history, media: { included: false, sha256: model.mediaSha, size_bytes: input.package.size_bytes == null ? null : Number(input.package.size_bytes), mime: input.package.mime || null, duration_ms: input.package.duration_ms == null ? null : Number(input.package.duration_ms), codec_hint: input.package.codec_hint || null }, entries, privacy };
    files['manifest.json'] = canonicalJson(manifest);
    return files;
  }

  function pathAllowed(path) {
    return ['manifest.json', 'graph/artifacts.json', 'graph/edges.json', 'source/media-ref.json', 'provenance/import-run.json', 'provenance/export.json', 'quality/report.json', 'tracks/raw/track.json', 'tracks/corrected/track.json', 'learning/material.json', 'learning/text-card.json', 'README.txt'].includes(path)
      || /^tracks\/(?:raw|corrected)\/revisions\/[a-f0-9]{64}\.json$/.test(path)
      || /^tracks\/projections\/[a-f0-9]{64}\.vtt$/.test(path)
      || /^learning\/table\/revisions\/[a-f0-9]{64}\.json$/.test(path)
      || /^learning\/mapping\/[a-f0-9]{64}\.json$/.test(path);
  }
  function validatePath(path) {
    const value = String(path || '');
    if (!value || utf8(value).byteLength > LIMITS.pathBytes || value.split('/').length > LIMITS.depth || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').some((part) => !part || part === '.' || part === '..')) fail('PACKAGE_PATH_INVALID', value);
    if (!pathAllowed(value)) fail('PACKAGE_PATH_UNMANIFESTED', value);
  }
  function assertExactKeys(value, keys, code) {
    const actual = Object.keys(value || {}).sort(keyCompare), expected = keys.slice().sort(keyCompare);
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code, actual.join(','));
  }
  function validateGraph(graph, payload) {
    const ids = new Map(), edgeKeys = new Set();
    const metadataKeys = { media_asset:['mime','size_bytes','duration_ms','codec_hint'],media_package:['media_included'],import_run:['warnings_count'],caption_track:['role','language'],caption_revision:['role','revision_no'],learning_material:['portable_text_key_sha256'],table_revision:['content_sha256','mapping_sha256','portable_body_sha256','revision_no'],learning_row_version:['material_id'],projection:['kind'],portable_package:['package_mode','history_complete'] };
    for (const node of graph.artifacts || []) {
      if (!NODE_TYPES.includes(node.type)) fail('GRAPH_NODE_TYPE_UNKNOWN', node.type);
      if (ids.has(node.id)) fail('GRAPH_NODE_DUPLICATE', node.id);
      assertExactKeys(node, ['id','type','canonical_hash','schema_version','canonical_ref','metadata'], 'GRAPH_NODE_FIELDS_INVALID');
      if (node.schema_version !== 1 || !node.canonical_ref || node.canonical_ref.store !== node.type) fail('GRAPH_NODE_SCHEMA_INVALID', node.id);
      if (Object.keys(node.canonical_ref).some((key) => !['store','source_id'].includes(key))) fail('GRAPH_CANONICAL_REF_FIELDS_INVALID');
      if (Object.keys(node.metadata || {}).some((key) => !metadataKeys[node.type].includes(key))) fail('GRAPH_NODE_METADATA_FIELDS_INVALID', node.id);
      cleanHex(node.canonical_hash, 'GRAPH_NODE_HASH_INVALID'); ids.set(node.id, node);
    }
    function types(edge, from, to) { const a=ids.get(edge.from),b=ids.get(edge.to); return (from==='*'||a.type===from)&&(to==='*'||b.type===to); }
    for (const edge of graph.edges || []) {
      if (!RELATIONS.includes(edge.relation)) fail('GRAPH_RELATION_UNKNOWN', edge.relation);
      if (edge.fact_kind !== 'asserted') fail('GRAPH_FACT_KIND_INVALID');
      if (!ids.has(edge.from) || !ids.has(edge.to)) fail('GRAPH_DANGLING_EDGE');
      const key = [edge.from, edge.relation, edge.to, edge.to_fragment || ''].join('\u0000'); if (edgeKeys.has(key)) fail('GRAPH_EDGE_DUPLICATE'); edgeKeys.add(key);
      const allowed = edge.relation === 'included_in' ? types(edge,'*','portable_package')
        : edge.relation === 'references_media' ? types(edge,'media_package','media_asset')
        : edge.relation === 'produced_from' ? types(edge,'caption_revision','import_run')
        : edge.relation === 'derived_from' ? (types(edge,'caption_track','caption_track')||types(edge,'learning_material','media_package'))
        : edge.relation === 'bound_to_revision' ? ((types(edge,'learning_material','caption_revision'))||types(edge,'table_revision','caption_revision'))
        : edge.relation === 'contains' ? (types(edge,'caption_track','caption_revision')||types(edge,'learning_material','table_revision')||types(edge,'table_revision','learning_row_version'))
        : edge.relation === 'maps_to_segment' ? types(edge,'learning_row_version','caption_revision')
        : edge.relation === 'projection_of' ? (types(edge,'projection','caption_revision')||types(edge,'projection','learning_material'))
        : edge.relation === 'supersedes' ? ids.get(edge.from).type===ids.get(edge.to).type&&['caption_revision','table_revision'].includes(ids.get(edge.from).type)
        : edge.relation === 'conflicts_with' ? ids.get(edge.from).type===ids.get(edge.to).type : false;
      if (!allowed) fail('GRAPH_RELATION_TYPES_INVALID', edge.relation);
      if (edge.relation === 'supersedes' && Number(ids.get(edge.from).metadata.revision_no) <= Number(ids.get(edge.to).metadata.revision_no)) fail('GRAPH_REVISION_ORDER_INVALID');
      if (edge.relation === 'maps_to_segment') {
        const target = ids.get(edge.to); if (!target || target.type !== 'caption_revision') fail('GRAPH_FRAGMENT_TARGET_INVALID');
        const revision = payload.caption_revisions.find((item) => item.portable_revision_id === edge.to);
        if (!revision || !(revision.revision.segments || []).some((segment) => String(segment.caption_segment_id || segment.source_segment_id) === String(edge.to_fragment))) fail('GRAPH_FRAGMENT_MISSING', edge.to_fragment);
      }
    }
    const successor = new Map(); for (const edge of graph.edges || []) if (edge.relation === 'supersedes') successor.set(edge.from, edge.to);
    for (const start of successor.keys()) { const seen=new Set(); let cursor=start; while(successor.has(cursor)){if(seen.has(cursor))fail('GRAPH_REVISION_CYCLE');seen.add(cursor);cursor=successor.get(cursor);} }
    const rawFragments=new Set(); for(const doc of payload.caption_revisions.filter((item)=>ids.get(item.portable_revision_id)&&ids.get(item.portable_revision_id).metadata.role==='raw_original')) for(const segment of doc.revision.segments||[]) if(segment.source_segment_id!=null)rawFragments.add(String(segment.source_segment_id));
    for(const table of payload.table_revisions||[]) for(const row of table.rows||[]) for(const sourceId of row.source_segment_ids||[]) if(!rawFragments.has(String(sourceId)))fail('GRAPH_RAW_FRAGMENT_MISSING',sourceId);
  }

  async function verifyPackageFiles(files, options) {
    options = options || {}; if (!files || typeof files !== 'object') fail('PACKAGE_FILES_REQUIRED');
    const paths = Object.keys(files); if (paths.length > LIMITS.entries) fail('PACKAGE_FILE_COUNT_EXCEEDED');
    if (new Set(paths).size !== paths.length) fail('PACKAGE_DUPLICATE_PATH');
    for (const path of paths) { validatePath(path); if (typeof files[path] !== 'string') fail('PACKAGE_ENTRY_TYPE_INVALID', path); const size = utf8(files[path]).byteLength; const cap = path === 'manifest.json' ? LIMITS.manifest : (path === 'README.txt' ? LIMITS.readme : LIMITS.entry); if (size > cap) fail('PACKAGE_ENTRY_TOO_LARGE', path); }
    if (!files['manifest.json']) fail('PACKAGE_MANIFEST_MISSING');
    const manifest = parseJsonStrict(files['manifest.json']);
    if (manifest.schema !== SCHEMA) fail('PACKAGE_SCHEMA_UNKNOWN');
    if (!Number.isInteger(manifest.schema_version)) fail('PACKAGE_SCHEMA_INVALID');
    if (manifest.schema_version > SCHEMA_VERSION) fail('PACKAGE_SCHEMA_FUTURE');
    if (manifest.schema_version !== SCHEMA_VERSION) fail('PACKAGE_SCHEMA_UNKNOWN');
    assertExactKeys(manifest, MANIFEST_KEYS, 'PACKAGE_MANIFEST_FIELDS_INVALID');
    if (!['snapshot', 'archive'].includes(manifest.package_mode)) fail('PACKAGE_MODE_INVALID');
    if (!manifest.media || manifest.media.included !== false) fail('PACKAGE_MEDIA_POLICY_INVALID');
    const entryPaths = new Set(), total = { value: 0 };
    for (const entry of manifest.entries || []) {
      validatePath(entry.path); if (entryPaths.has(entry.path)) fail('PACKAGE_DUPLICATE_MANIFEST_ENTRY', entry.path); entryPaths.add(entry.path);
      if (!(entry.path in files)) fail('PACKAGE_FILE_MISSING', entry.path);
      const size = utf8(files[entry.path]).byteLength; total.value += size;
      if (size !== entry.size_bytes) fail('PACKAGE_SIZE_MISMATCH', entry.path);
      if (await sha256Hex(files[entry.path]) !== entry.sha256) fail('PACKAGE_CHECKSUM_MISMATCH', entry.path);
    }
    if (total.value > LIMITS.uncompressed) fail('PACKAGE_UNCOMPRESSED_SIZE_EXCEEDED');
    for (const path of paths) if (path !== 'manifest.json' && !entryPaths.has(path)) fail('PACKAGE_UNMANIFESTED_FILE', path);
    const semanticList = manifest.entries.filter((entry) => entry.semantic).map((entry) => [entry.path, entry.sha256, entry.size_bytes, entry.media_type]);
    if (await hashObject(semanticList) !== manifest.content_root_sha256) fail('PACKAGE_CONTENT_ROOT_MISMATCH');
    const artifactsDoc = parseJsonStrict(files['graph/artifacts.json']), edgesDoc = parseJsonStrict(files['graph/edges.json']);
    const captionDocs = Object.keys(files).filter((path) => /^tracks\/(raw|corrected)\/revisions\/.+\.json$/.test(path)).sort(keyCompare).map((path) => parseJsonStrict(files[path]));
    const tableDocs = Object.keys(files).filter((path) => /^learning\/table\/revisions\/.+\.json$/.test(path)).sort(keyCompare).map((path) => parseJsonStrict(files[path]));
    const payload = { media_ref: parseJsonStrict(files['source/media-ref.json']), import_run: parseJsonStrict(files['provenance/import-run.json']), quality_report: parseJsonStrict(files['quality/report.json']), raw_track: parseJsonStrict(files['tracks/raw/track.json']), corrected_track: parseJsonStrict(files['tracks/corrected/track.json']), caption_revisions: captionDocs, material: parseJsonStrict(files['learning/material.json']), table_revisions: tableDocs, mapping: parseJsonStrict(files[Object.keys(files).find((path) => path.startsWith('learning/mapping/'))]), text_card: parseJsonStrict(files['learning/text-card.json']) };
    const graph = { artifacts: artifactsDoc.artifacts || [], edges: edgesDoc.edges || [] }; validateGraph(graph, payload);
    for(const table of tableDocs){const body=clone(table),expected=body.portable_body_sha256;delete body.schema;delete body.portable_body_sha256;if(await hashObject(body)!==expected)fail('PACKAGE_TABLE_BODY_HASH_MISMATCH');const node=graph.artifacts.find(item=>item.id===table.portable_table_revision_id);if(!node||node.metadata.portable_body_sha256!==expected)fail('PACKAGE_TABLE_GRAPH_HASH_MISMATCH');}
    for (const root of Object.values(manifest.roots || {})) if (!graph.artifacts.some((node) => node.id === root)) fail('PACKAGE_ROOT_MISSING', root);
    const selectedTable=tableDocs.find((item)=>item.portable_table_revision_id===manifest.roots.table_revision),cardRows=payload.text_card&&payload.text_card.card&&payload.text_card.card.rows;
    if(!selectedTable||!Array.isArray(cardRows)||cardRows.length!==selectedTable.rows.length)fail('PACKAGE_TEXT_CARD_PARITY_MISMATCH');
    for(let index=0;index<selectedTable.rows.length;index++){const row=selectedTable.rows[index],card=cardRows[index];if(String(card.hebrew_plain||'')!==row.he_plain||String(card.hebrew_niqqud||'')!==row.he_niqqud||String(card.translit||'')!==row.translit||String(card.translit_ru||'')!==row.translit_ru||String(card.russian||'')!==row.ru)fail('PACKAGE_TEXT_CARD_PARITY_MISMATCH',String(index));}
    return { manifest, graph, payload, files, manifest_sha256: await sha256Hex(files['manifest.json']) };
  }

  async function dryRun(verified, inventory) {
    if (!verified || !verified.manifest || !verified.graph) fail('VERIFIED_PACKAGE_REQUIRED');
    inventory = inventory || {}; const nodes = inventory.nodes || {}, actions = [], conflicts = [];
    for (const node of verified.graph.artifacts) {
      const existing = nodes[node.id];
      if (!existing) actions.push({ id: node.id, type: node.type, action: 'insert' });
      else if (existing.canonical_hash === node.canonical_hash) actions.push({ id: node.id, type: node.type, action: 'reuse' });
      else conflicts.push({ code: 'PORTABLE_ID_HASH_CONFLICT', id: node.id, type: node.type, expected_hash: node.canonical_hash, actual_hash: existing.canonical_hash });
    }
    const textKey = verified.payload.material.portable_text_key, text = (inventory.texts || {})[textKey];
    if (text && text.table_revision_id && text.table_revision_id !== verified.manifest.roots.table_revision) conflicts.push({ code: 'TEXT_KEY_CONTENT_CONFLICT', text_key: textKey });
    const mediaSha = verified.manifest.media.sha256, mediaPresent = !!mediaSha && (inventory.media_sha256 || []).includes(mediaSha);
    const selectedTable = verified.payload.table_revisions.find((item) => item.portable_table_revision_id === verified.manifest.roots.table_revision);
    const selectedCaption = verified.payload.caption_revisions.find((item) => item.portable_revision_id === verified.manifest.roots.caption_revision);
    const planBase = { portable_package_id: verified.manifest.portable_package_id, content_root_sha256: verified.manifest.content_root_sha256, package_mode: verified.manifest.package_mode, actions, conflicts, text_key: textKey, media: { sha256: mediaSha, status: mediaSha ? (mediaPresent ? 'exact' : 'missing') : 'unbound', original_name: verified.payload.media_ref && verified.payload.media_ref.original_name || null, size_bytes: verified.manifest.media.size_bytes == null ? null : Number(verified.manifest.media.size_bytes), mime: verified.manifest.media.mime || null }, estimated: { node_count: verified.graph.artifacts.length, edge_count: verified.graph.edges.length, row_count: selectedTable ? (selectedTable.rows || []).length : 0, cue_count: selectedCaption ? (selectedCaption.revision.segments || []).length : 0, history_row_count: verified.payload.table_revisions.reduce((count, revision) => count + (revision.rows || []).length, 0), table_revision_count: verified.payload.table_revisions.length, caption_revision_count: verified.payload.caption_revisions.length, write_count: actions.filter((item) => item.action === 'insert').length } };
    return { ...planBase, plan_sha256: await hashObject(planBase), can_apply: conflicts.length === 0 };
  }

  return { SCHEMA, SCHEMA_VERSION, LIMITS, NODE_TYPES, RELATIONS, canonicalJson, parseJsonStrict, sha256Hex, hashObject, buildPackageFiles, verifyPackageFiles, validateGraph, dryRun, pathAllowed };
});
