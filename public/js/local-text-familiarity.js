// Exact local-text familiarity for Studio and Room. Only the existing disposable
// aggregate cache is written; learner projection and review_log are read-only.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LocalTextFamiliarity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function descriptor(item, compass) {
    if (!item || item.id == null) return null;
    return {
      cache_key: 'mytext:' + String(item.id), source_class: 'mytext', source_key: String(item.text_key || item.id),
      local_id: String(item.id), content_revision: String(item.updated_at || 'unknown'), content_sha256: '',
      entitlement_revision: null, resolver_version: compass && compass.RESOLVER_VERSION,
    };
  }
  const unavailable = (status, reason) => ({ status, reason_code: reason || status, rank_eligible: false,
    recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null, counts: null });

  function workerAnalyzer() {
    let worker = null, serial = 0, pending = null;
    const dispose = () => { if (worker) worker.terminate(); worker = null; };
    const analyze = payload => new Promise((resolve, reject) => {
      if (pending) { reject(new Error('ANALYZER_BUSY')); return; }
      if (!worker) worker = new Worker('/js/learning-compass-worker.js');
      const id = 'studio-familiar-' + (++serial);
      const timer = setTimeout(() => { pending = null; dispose(); reject(new Error('ANALYSIS_TIMEOUT')); }, 90000);
      const finish = (error, value) => { clearTimeout(timer); pending = null; error ? reject(error) : resolve(value); };
      pending = { finish };
      worker.onmessage = event => {
        const result = event.data;
        if (!result || result.id !== id) return;
        finish(result.ok ? null : new Error(result.error || 'ANALYSIS_FAILED'), result.ingredients);
      };
      worker.onerror = () => { dispose(); finish(new Error('ANALYSIS_WORKER_FAILED')); };
      worker.postMessage({ ...payload, type: 'analyze', id });
    });
    analyze.cancel = () => { if (pending) pending.finish(new Error('ANALYSIS_CANCELLED')); dispose(); };
    return analyze;
  }

  function createService({ db, compass, analyze = workerAnalyzer(), onUpdate = () => {}, yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
    let generation = 0;
    const fits = new Map();
    const notify = (done, total, state) => onUpdate({ done, total, state, fits });
    async function prepare(items) {
      const epoch = ++generation;
      if (analyze.cancel) analyze.cancel();
      fits.clear();
      const descriptors = (items || []).map(item => descriptor(item, compass)).filter(Boolean);
      const total = descriptors.length;
      for (const item of descriptors) fits.set(item.local_id, unavailable('PENDING'));
      notify(0, total, 'preparing');
      let projection;
      try { projection = await db.getLearningCompassProjection(); } catch (_) {}
      if (epoch !== generation) return;
      if (!projection || !Number(projection.tracked_lexeme_count)) {
        for (const item of descriptors) fits.set(item.local_id, unavailable(projection ? 'NEEDS_PROFILE' : 'UNAVAILABLE'));
        notify(total, total, projection ? 'needs-profile' : 'error');
        return;
      }
      let done = 0;
      const missing = [];
      // The cache contract caps responses at 48 cards / 256 KiB. Never read all
      // sentence bodies at once, including on iPhone.
      for (let offset = 0; offset < total; offset += 48) {
        const batch = descriptors.slice(offset, offset + 48);
        let cached;
        try { cached = await db.getLearningCompassIngredientsBatch(batch); } catch (_) { cached = { entries: {} }; }
        if (epoch !== generation) return;
        for (const item of batch) {
          const ingredients = cached.entries && cached.entries[item.cache_key];
          if (ingredients) {
            fits.set(item.local_id, compass.evaluateRecordedFamiliarityV2({ ingredients, learner_projection: projection }));
            done++;
          } else missing.push(item);
        }
        notify(done, total, done === total ? 'ready' : 'preparing');
        await yieldWork();
        if (epoch !== generation) return;
      }
      for (const item of missing) {
        try {
          const rows = await db.getSentences(item.local_id);
          if (epoch !== generation) return;
          const ingredients = await analyze({ rows, ...item });
          if (epoch !== generation) return;
          // A concurrently edited text must not acquire the old revision's cache.
          if (typeof db.getTextByIdLite === 'function') {
            const current = await db.getTextByIdLite(item.local_id);
            if (epoch !== generation) return;
            if (!current || String(current.updated_at || 'unknown') !== item.content_revision) {
              fits.set(item.local_id, unavailable('STALE')); done++; notify(done, total, 'preparing'); continue;
            }
          }
          await db.putLearningCompassIngredients({ ...item, ingredients, content_sha256: ingredients.content_sha256 });
          if (epoch !== generation) return;
          fits.set(item.local_id, compass.evaluateRecordedFamiliarityV2({ ingredients, learner_projection: projection }));
        } catch (error) {
          if (epoch !== generation) return;
          const reason = String(error && error.message || error);
          fits.set(item.local_id, unavailable(/TOKEN_LIMIT|TYPE_LIMIT|PACKET_LIMIT|NO_HEBREW_TOKENS/.test(reason) ? 'UNSUPPORTED' : 'UNAVAILABLE', reason));
        }
        done++;
        notify(done, total, done === total ? 'ready' : 'preparing');
        await yieldWork();
        if (epoch !== generation) return;
      }
      if (!total) notify(0, 0, 'ready');
    }
    return { prepare, get: id => fits.get(String(id)) || null,
      cancel() { generation++; fits.clear(); if (analyze.cancel) analyze.cancel(); } };
  }
  return Object.freeze({ descriptor, createService, workerAnalyzer });
});
