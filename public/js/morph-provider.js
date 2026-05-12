// public/js/morph-provider.js — Hebrew morphology runtime provider chain.
//
// Phase 9.4.D — implements the IMorphologyProvider interface from
// docs/MORPHOLOGY_REQUIREMENTS_v3_2.md §9 and the tier architecture from §3.
//
// Active tiers in v3.2:
//   Tier 1 — LocalDictionaryMorphologyProvider (lazy fetch of
//            /morph/heb_morphology.bin built by scripts/morph/build-morphology.mjs)
//   Tier 2 — SeedAutocompleteMorphologyProvider (always-on; queries the
//            local `roots` table via ldb.searchRootsAutocomplete)
//
// Public surface:
//   window.MorphProvider.ensureReady()       → Promise<void>
//   window.MorphProvider.analyze(word)       → Promise<Analysis[]>
//   window.MorphProvider.getStatus()         → object
//   window.MorphProvider.clearCache()        → Promise<void>
//   window.MorphProvider.forceUpdate()       → Promise<void>
//
// Privacy invariant (requirement #17): NO event emission for lookups.
// Telemetry (opt-in lifecycle counters via window.v3OpfsTelemetryPush) is
// metadata only — never includes the queried word.

(function () {
  'use strict';

  // ── Tier 1: Local pre-computed dictionary ──────────────────────────────
  const T1 = {
    id: 'local-hspell-prebuilt',
    state: 'not_initialized', // not_initialized | fetching | loading | ready | error
    entryCount: 0,
    analysisCount: 0,
    sizeBytes: 0,
    meta: null,
    map: null,             // Map<normalized-key, analyses[]>
    fetchPromise: null,
    error: null,

    isReady() { return this.state === 'ready' && this.map !== null; },

    async ensureReady() {
      if (this.isReady()) return;
      if (this.state === 'fetching' || this.state === 'loading') return this.fetchPromise;
      this.state = 'fetching';
      this.fetchPromise = this._doFetch();
      return this.fetchPromise;
    },

    async _doFetch() {
      try {
        const t0 = Date.now();
        const metaResp = await fetch('/morph/heb_morphology.meta.json', { cache: 'no-cache' });
        if (!metaResp.ok) throw new Error('meta fetch failed: ' + metaResp.status);
        this.meta = await metaResp.json();
        this.state = 'loading';

        const binResp = await fetch('/morph/heb_morphology.bin');
        if (!binResp.ok) throw new Error('bin fetch failed: ' + binResp.status);
        const txt = await binResp.text();
        this.sizeBytes = txt.length;
        const parsed = JSON.parse(txt);
        if (!parsed || !parsed.entries) throw new Error('bin format invalid');

        const entries = parsed.entries;
        const m = new Map();
        let analysisCount = 0;
        for (const k of Object.keys(entries)) {
          const arr = entries[k];
          if (!Array.isArray(arr) || !arr.length) continue;
          m.set(k, arr);
          analysisCount += arr.length;
        }
        this.map = m;
        this.entryCount = m.size;
        this.analysisCount = analysisCount;
        this.state = 'ready';
        this.error = null;

        try {
          (window.v3OpfsTelemetryPush || function(){})({
            kind: 'morph.dict.loaded',
            durationMs: Date.now() - t0,
            entries: this.entryCount,
            sizeBytes: this.sizeBytes,
            version: this.meta && this.meta.format_version,
            provider: this.meta && this.meta.data_provider,
          });
        } catch (_) {}
      } catch (e) {
        this.state = 'error';
        this.error = String(e && e.message ? e.message : e);
        console.warn('[morph] Tier 1 init failed:', this.error, '— falling through to Tier 2');
        try {
          (window.v3OpfsTelemetryPush || function(){})({
            kind: 'morph.dict.error', error: this.error,
          });
        } catch (_) {}
      } finally {
        this.fetchPromise = null;
      }
    },

    async analyze(word) {
      if (!this.isReady()) return [];
      const key = (window.MorphNormalize && window.MorphNormalize.normalizeHebrew)
        ? window.MorphNormalize.normalizeHebrew(word) : String(word || '').trim();
      if (!key) return [];
      return this.map.get(key) || [];
    },

    async clearCache() {
      // Drop in-memory map; SW caches are cleared via top-level helper.
      this.map = null;
      this.entryCount = 0;
      this.analysisCount = 0;
      this.state = 'not_initialized';
      this.meta = null;
      this.error = null;
    },
  };

  // ── Tier 2: Seed dict + user-noted roots autocomplete ──────────────────
  const T2 = {
    id: 'seed-autocomplete',
    state: 'ready', // depends on local DB which is initialized at app boot
    isReady() { return true; },
    async ensureReady() { /* no-op — local DB readiness is the app's job */ },

    async analyze(word) {
      if (typeof window.LOCAL_MODE !== 'undefined' && !window.LOCAL_MODE) return [];
      try {
        const ldb = await window.ensureLocalDB();
        if (!ldb || typeof ldb.searchRootsAutocomplete !== 'function') return [];
        const key = (window.MorphNormalize && window.MorphNormalize.normalizeHebrew)
          ? window.MorphNormalize.normalizeHebrew(word) : String(word || '').trim();
        if (!key) return [];
        // Match the normalized root if any seed/user entry maps to it.
        const rows = await ldb.searchRootsAutocomplete(key, 3);
        if (!Array.isArray(rows) || !rows.length) return [];
        return rows.map((r, idx) => ({
          r: String(r.root_3letter || ''),
          l: String(r.root_3letter || ''),
          b: null,
          p: 'root',
          s: r.is_user ? 'user' : 'seed',
          k: idx,
          u: String(word || ''),
        }));
      } catch (_) { return []; }
    },
  };

  // ── Provider chain — first non-empty result wins ───────────────────────
  async function analyze(word) {
    const w = String(word || '').trim();
    if (!w) return [];
    // If Tier 1 is mid-fetch, await its promise so callers don't fall
    // through to Tier 2 just because the dict hasn't loaded yet. Tier 2
    // for word→root is a much weaker signal (it's prefix search over
    // root keys, not actual morphology lookup). Better to wait ~500-
    // 1000 ms on the first call than to give a wrong/empty fallback.
    if ((T1.state === 'fetching' || T1.state === 'loading') && T1.fetchPromise) {
      try { await T1.fetchPromise; } catch (_) { /* falls through */ }
    }
    if (T1.isReady()) {
      const r1 = await T1.analyze(w);
      if (r1.length) return r1;
    }
    const r2 = await T2.analyze(w);
    return r2;
  }

  function getStatus() {
    return {
      tier1: {
        id: T1.id,
        state: T1.state,
        entries: T1.entryCount,
        analyses: T1.analysisCount,
        sizeBytes: T1.sizeBytes,
        meta: T1.meta,
        error: T1.error,
      },
      tier2: {
        id: T2.id,
        state: T2.state,
      },
    };
  }

  // Trigger Tier 1 fetch on demand (e.g. when word-study form opens).
  async function ensureReady() {
    return T1.ensureReady();
  }

  // Clear the SW cache entry for the dict + reset in-memory state.
  // Forces a fresh download on next ensureReady().
  async function clearCache() {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          await cache.delete('/morph/heb_morphology.bin').catch(() => {});
          await cache.delete('/morph/heb_morphology.meta.json').catch(() => {});
        }
      }
    } catch (_) {}
    await T1.clearCache();
  }

  async function forceUpdate() {
    await clearCache();
    return ensureReady();
  }

  window.MorphProvider = {
    ensureReady,
    analyze,
    getStatus,
    clearCache,
    forceUpdate,
    _T1: T1, // diagnostic; not part of the public contract
    _T2: T2,
  };
})();
