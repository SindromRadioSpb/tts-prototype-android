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
  const CACHE = 'linguistpro-benyehuda-learning-v1';
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
    const origin = meta?._learning_niqqud_origin;
    const id = String(meta?.corpus?.byehuda_id || text?.corpus?.byehuda_id || (origin?.schema === SCHEMA ? origin.work_id : '') || '');
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
  function pinFor(text, manifest = globalThis.BenYehudaLearningNiqqudManifest) {
    const id = workId(text); if (!id) return null;
    let meta = text.source_meta || null;
    try { if (text.source_meta_json) meta = JSON.parse(text.source_meta_json); } catch (_) {}
    const fixed = meta?._learning_niqqud_pin;
    return fixed?.work_id === id && FILE.test(fixed.file || '') && HASH.test(fixed.sha256 || '')
      ? fixed : manifest?.works?.[id] || null;
  }
  function validateLayer(layer) {
    if (layer?.schema !== SCHEMA || !/^\d{1,8}$/.test(layer.work_id || '')
      || !HASH.test(layer.source_rows_sha256 || '') || !Array.isArray(layer.rows)
      || layer.row_count !== layer.rows.length || !layer.provider || !layer.model_version) throw new Error('Invalid learning niqqud layer');
    const orders = new Set();
    for (const row of layer.rows) {
      if (!Number.isInteger(row.order_index) || row.order_index < 0 || row.order_index >= layer.row_count || orders.has(row.order_index)
        || typeof row.he_plain !== 'string' || typeof row.source_niqqud !== 'string'
        || typeof row.learning_niqqud !== 'string' || (canonical(row.learning_niqqud) !== canonical(row.he_plain)
          && !(row.learning_niqqud === '' && !/[א-ת]/u.test(row.he_plain)))) throw new Error('Invalid learning niqqud row');
      orders.add(row.order_index);
    }
    return layer;
  }
  async function apply(text, sentences, layer) {
    validateLayer(layer);
    if (workId(text) !== layer.work_id || sentences.length !== layer.row_count) return { sentences, applied: 0 };
    const byOrder = new Map(layer.rows.map(row => [row.order_index, row]));
    if (await sha256(sourceBytes(sentences)) !== layer.source_rows_sha256) {
      // Editing one row must not disable the study layer everywhere else. Every unedited row
      // still has to match the frozen source; a changed edition or order cannot slip through.
      if (!sentences.some(edited) || sentences.some((row, i) => {
        const original = byOrder.get(Number(row.order_index ?? i));
        return !original || (!edited(row) && canonical(plainOf(row)) !== canonical(original.he_plain));
      })) return { sentences, applied: 0 };
    }
    let applied = 0, prepared = 0;
    const rows = sentences.map((row, i) => {
      const match = byOrder.get(Number(row.order_index ?? i));
      if (!match || edited(row) || canonical(plainOf(row)) !== canonical(match.he_plain)
        || pointed(niqqudOf(row)) !== pointed(match.source_niqqud) || !match.learning_niqqud) return row;
      const cachedTranslit = match.translit_profiles && layer.translit_profile_versions
        ? { source: match.learning_niqqud.trim(), versions: layer.translit_profile_versions, profiles: match.translit_profiles } : null;
      if (pointed(match.learning_niqqud) === pointed(niqqudOf(row))) {
        if (!cachedTranslit) return row;
        prepared++; return { ...row, translit_precomputed: cachedTranslit,
          ...((match.unresolved_words || match.review_signals) ? { niqqud_quality: { unresolved_words: match.unresolved_words || 0, review_signals: match.review_signals || 0, review_status: layer.review_status } } : {}) };
      }
      applied++;
      return { ...row, he_niqqud: match.learning_niqqud,
        ...(cachedTranslit ? { translit_precomputed: cachedTranslit } : {}),
        niqqud_authority: 'machine-learning-layer',
        niqqud_quality: { unresolved_words: match.unresolved_words || 0, review_signals: match.review_signals || 0, review_status: layer.review_status },
        _learning_niqqud_source: { plain: plainOf(row), value: niqqudOf(row), presented: match.learning_niqqud,
          authority: row.niqqud_authority, provenance: row.niqqud_provenance },
        niqqud_provenance: { source: niqqudOf(row), provider: layer.provider, model_version: layer.model_version } };
    });
    return { sentences: rows, applied, prepared };
  }
  function createLoader(manifest, options = {}) {
    const cache = new Map(), fetcher = options.fetch || globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 1800;
    const maxMemoryLayers = Math.max(1, options.maxMemoryLayers || 4);
    const storage = options.cacheStorage ?? globalThis.caches;
    async function load(id, pin = manifest?.works?.[id]) {
      if (!pin || !FILE.test(pin.file || '') || !HASH.test(pin.sha256 || '')) return null;
      const key = id + ':' + pin.sha256;
      if (cache.has(key)) { const cached = cache.get(key); cache.delete(key); cache.set(key, cached); return cached; }
      const task = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.fetchTimeoutMs ?? 30000);
        try {
          const url = '/data/benyehuda/' + pin.file;
          const bucket = storage ? await storage.open(CACHE).catch(() => null) : null;
          const cached = bucket ? await bucket.match(url).catch(() => null) : null;
          const decode = async response => {
            if (!response?.ok) throw new Error('Learning niqqud unavailable');
            const bytes = await response.arrayBuffer();
            if (await sha256(bytes) !== pin.sha256) throw new Error('Learning niqqud hash mismatch');
            const layer = validateLayer(JSON.parse(new TextDecoder().decode(bytes)));
            if (layer.work_id !== id) throw new Error('Learning niqqud identity mismatch');
            return layer;
          };
          if (cached) { try { return await decode(cached); } catch (_) { await bucket.delete(url).catch(() => {}); } }
          const response = await fetcher(url, { cache: 'force-cache', signal: controller.signal });
          const copy = bucket && response.ok ? response.clone() : null;
          const layer = await decode(response);
          if (copy) await bucket.put(url, copy).catch(() => {}); // quota failure keeps the source readable
          return layer;
        } finally { clearTimeout(timer); }
      })();
      cache.set(key, task);
      if (cache.size > maxMemoryLayers) cache.delete(cache.keys().next().value);
      try { return await task; } catch (_) { cache.delete(key); return null; }
    }
    async function prepare(material, isCurrent = () => true, preparation = {}) {
      if (material.learningNiqqud) return material;
      const id = workId(material.text);
      const pin = pinFor(material.text, manifest);
      if (!id || !pin) return material;
      let viewTimer;
      // Keep first paint bounded while a slow immutable download can still finish into the cache.
      const layer = preparation.waitForLayer ? await load(id,pin)
        : await Promise.race([load(id,pin),new Promise(resolve => { viewTimer=setTimeout(()=>resolve(null),timeoutMs); })]);
      clearTimeout(viewTimer);
      if (!isCurrent()) return material;
      if (!layer) return { ...material, studyNiqqudStatus: 'unavailable' };
      const result = await apply(material.text, material.sentences, layer);
      if (!isCurrent() || (!result.applied && !result.prepared)) return material;
      return { ...material, sentences: result.sentences,
        ...(result.applied ? { learningNiqqud: { sourceSentences: material.sentences, layer, applied: result.applied } } : {}) };
    }
    return { prepare, load };
  }
  let sharedLoader, sharedManifest;
  function loader() {
    const manifest = globalThis.BenYehudaLearningNiqqudManifest;
    if (!sharedLoader || sharedManifest !== manifest) { sharedManifest = manifest; sharedLoader = createLoader(manifest); }
    return sharedLoader;
  }
  async function prepare(material, isCurrent, options) { return loader().prepare(material, isCurrent, options); }
  async function portable(text) {
    const id = workId(text), pin = pinFor(text);
    const layer = id && pin ? await loader().load(id, pin) : null;
    return layer ? { sha256: pin.sha256, layer } : null;
  }
  async function remember(portable, text) {
    const layer = validateLayer(portable?.layer);
    if (workId(text) !== layer.work_id || !HASH.test(portable.sha256 || '')
      || await sha256(new TextEncoder().encode(JSON.stringify(layer))) !== portable.sha256) throw new Error('Invalid portable learning layer');
    const pin = { work_id: layer.work_id, file: 'learning-niqqud/' + layer.work_id + '-' + portable.sha256.slice(0, 32) + '.json', sha256: portable.sha256 };
    if (!globalThis.caches) return null;
    const cache = await globalThis.caches.open(CACHE);
    await cache.put('/data/benyehuda/' + pin.file, new Response(JSON.stringify(layer), { headers: { 'Content-Type': 'application/json' } }));
    return pin;
  }
  function restoreSource(row) {
    const source = row?._learning_niqqud_source;
    if (!source || edited(row) || plainOf(row) !== source.plain || niqqudOf(row) !== source.presented) return row;
    const copy = { ...row, he_niqqud: source.value, niqqud_authority: source.authority, niqqud_provenance: source.provenance };
    delete copy._learning_niqqud_source; delete copy.niqqud_quality; delete copy.translit_precomputed;
    return copy;
  }
  function isLearning(row) {
    return row?.niqqud_authority === 'machine-learning-layer' && !edited(row)
      && (!row._learning_niqqud_source || niqqudOf(row) === row._learning_niqqud_source.presented);
  }
  function reviewHint(row, translate) {
    if (edited(row) || (row?._learning_niqqud_source && niqqudOf(row) !== row._learning_niqqud_source.presented) || (row?.translit_precomputed && niqqudOf(row).trim() !== row.translit_precomputed.source)) return '';
    const quality = row?.niqqud_quality;
    return [['unresolved_words','unresolved'],['review_signals','reviewSignals']].filter(([field]) => Number(quality?.[field]) > 0)
      .map(([field,key]) => translate('room.reader.niqqudLayer.'+key).replace('{count}',String(quality[field]))).join(' ');
  }
  function copyBinding(text) {
    const id = workId(text), pin = pinFor(text);
    return id && pin ? { _learning_niqqud_origin: { schema: SCHEMA, work_id: id },
      _learning_niqqud_pin: { work_id: id, file: pin.file, sha256: pin.sha256 } } : null;
  }
  return { isLearning, reviewHint, copyBinding, SCHEMA, CACHE, canonical, sourceBytes, sha256, workId, pinFor, validateLayer, apply, createLoader, prepare, portable, remember, restoreSource };
});
