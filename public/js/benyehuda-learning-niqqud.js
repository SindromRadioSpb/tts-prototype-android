// A verified presentation layer. Source sentences and learner storage are never written.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BenYehudaLearningNiqqud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'benyehuda-learning-niqqud-v1';
  const HASH = /^[a-f0-9]{64}$/;
  const FILE = /^learning-niqqud\/\d{1,8}-[a-f0-9]{32}\.json$/;
  const canonical = value => String(value || '').normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, '').normalize('NFC');
  const pointed = value => String(value || '').normalize('NFC');
  const plainOf = row => String(row.he_plain ?? row.hebrew_plain ?? row.he ?? '');
  const niqqudOf = row => String(row.he_niqqud ?? row.hebrew_niqqud ?? '');
  const sourceBytes = rows => new TextEncoder().encode(JSON.stringify(rows.map((row, i) => [Number(row.order_index ?? i), canonical(plainOf(row))])));
  async function sha256(bytes) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  }
  function workId(text) {
    let meta = text?.source_meta || null;
    if (text?.source_meta_json) { try { meta = JSON.parse(text.source_meta_json); } catch (_) { return null; } }
    if (meta?.group_corpus || meta?.public_corpus) return null;
    const id = String(meta?.corpus?.byehuda_id || text?.corpus?.byehuda_id || '');
    return /^\d{1,8}$/.test(id) ? id : null;
  }
  function edited(row) {
    if (String(row.niqqud_authority || '').toUpperCase() === 'USER') return true;
    for (const field of ['he_plain', 'he_niqqud']) {
      const state = row.field_meta?.[field];
      if (state?.locked || state?.authority === 'user') return true;
    }
    let meta = row.edit_meta_json ?? row.edit_meta;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (_) { return true; } }
    const e = meta?.edited || {};
    return !!(e.he || e.he_plain || e.hebrew_plain || e.he_niqqud || e.hebrew_niqqud || e.niqqud);
  }
  function validateLayer(layer) {
    if (layer?.schema !== SCHEMA || !/^\d{1,8}$/.test(layer.work_id || '')
      || !HASH.test(layer.source_rows_sha256 || '') || !Array.isArray(layer.rows)
      || layer.row_count !== layer.rows.length || !layer.provider || !layer.model_version) throw new Error('Invalid learning niqqud layer');
    const orders = new Set();
    for (const row of layer.rows) {
      if (!Number.isInteger(row.order_index) || row.order_index < 0 || orders.has(row.order_index)
        || typeof row.he_plain !== 'string' || typeof row.source_niqqud !== 'string'
        || typeof row.learning_niqqud !== 'string' || canonical(row.learning_niqqud) !== canonical(row.he_plain)) throw new Error('Invalid learning niqqud row');
      orders.add(row.order_index);
    }
    return layer;
  }
  async function apply(text, sentences, layer) {
    validateLayer(layer);
    if (workId(text) !== layer.work_id || sentences.length !== layer.row_count
      || await sha256(sourceBytes(sentences)) !== layer.source_rows_sha256) return { sentences, applied: 0 };
    const byOrder = new Map(layer.rows.map(row => [row.order_index, row]));
    let applied = 0;
    const rows = sentences.map((row, i) => {
      const match = byOrder.get(Number(row.order_index ?? i));
      if (!match || edited(row) || canonical(plainOf(row)) !== canonical(match.he_plain)
        || pointed(niqqudOf(row)) !== pointed(match.source_niqqud) || !match.learning_niqqud
        || pointed(match.learning_niqqud) === pointed(niqqudOf(row))) return row;
      applied++;
      return { ...row, he_niqqud: match.learning_niqqud,
        niqqud_authority: 'machine-learning-layer',
        niqqud_provenance: { source: niqqudOf(row), provider: layer.provider, model_version: layer.model_version } };
    });
    return { sentences: rows, applied };
  }
  function createLoader(manifest, options = {}) {
    const cache = new Map(), fetcher = options.fetch || globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 1800;
    async function load(id) {
      const pin = manifest?.works?.[id];
      if (!pin || !FILE.test(pin.file || '') || !HASH.test(pin.sha256 || '')) return null;
      if (cache.has(id)) return cache.get(id);
      const task = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetcher('/data/benyehuda/' + pin.file, { cache: 'force-cache', signal: controller.signal });
          if (!response.ok) throw new Error('Learning niqqud unavailable');
          const bytes = await response.arrayBuffer();
          if (await sha256(bytes) !== pin.sha256) throw new Error('Learning niqqud hash mismatch');
          const layer = validateLayer(JSON.parse(new TextDecoder().decode(bytes)));
          if (layer.work_id !== id) throw new Error('Learning niqqud identity mismatch');
          return layer;
        } finally { clearTimeout(timer); }
      })();
      cache.set(id, task);
      try { return await task; } catch (_) { cache.delete(id); return null; }
    }
    async function prepare(material, isCurrent = () => true) {
      const id = workId(material.text);
      if (!id || !manifest?.works?.[id]) return material;
      const layer = await load(id);
      if (!layer || !isCurrent()) return material;
      const result = await apply(material.text, material.sentences, layer);
      if (!isCurrent() || !result.applied) return material;
      return { ...material, sentences: result.sentences,
        learningNiqqud: { sourceSentences: material.sentences, layer, applied: result.applied } };
    }
    return { prepare };
  }
  return { SCHEMA, canonical, sourceBytes, sha256, workId, validateLayer, apply, createLoader };
});
