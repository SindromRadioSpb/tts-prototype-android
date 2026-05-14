// public/js/morph-provider.js — Hebrew morphology runtime provider chain.
//
// Phase 9.4.D — implements the IMorphologyProvider interface from
// docs/MORPHOLOGY_REQUIREMENTS_v3_2.md §9 and the tier architecture from §3.
//
// Active tiers in v3.2:
//   Tier 1 — LocalDictionaryMorphologyProvider (lazy fetch of
//            /morph/heb_morphology[_full].bin built by build-morphology.mjs)
//   Tier 2 — SeedAutocompleteMorphologyProvider (always-on; queries the
//            local `roots` table via ldb.searchRootsAutocomplete)
//
// Two-tier dictionary (v3.3 Workstream A1):
//   - basic (default; ~34K entries; bundle-shipped)
//   - full  (opt-in; ~250K entries; lazy-fetched on Settings toggle activation)
// Tier selection is controlled by `localStorage.morphDictTier_v1` ∈ {'basic','full'}.
// The provider re-fetches the appropriate bin/meta pair when the tier changes
// via setDictTier(); old in-memory map is discarded so the runtime never
// silently serves stale data after a toggle flip.
//
// Public surface:
//   window.MorphProvider.ensureReady()       → Promise<void>
//   window.MorphProvider.analyze(word)       → Promise<Analysis[]>
//   window.MorphProvider.getStatus()         → object
//   window.MorphProvider.clearCache()        → Promise<void>
//   window.MorphProvider.forceUpdate()       → Promise<void>
//   window.MorphProvider.getDictTier()       → 'basic' | 'full'
//   window.MorphProvider.setDictTier(tier)   → Promise<{ok, tier, reloaded}>
//
// Privacy invariant (requirement #17): NO event emission for lookups.
// Telemetry (opt-in lifecycle counters via window.v3OpfsTelemetryPush) is
// metadata only — never includes the queried word.

(function () {
  'use strict';

  // ── Tier selection (basic | full) ──────────────────────────────────────
  const DICT_TIER_KEY = 'morphDictTier_v1';
  const VALID_TIERS = ['basic', 'full'];

  function getDictTier() {
    try {
      const v = localStorage.getItem(DICT_TIER_KEY);
      return VALID_TIERS.includes(v) ? v : 'basic';
    } catch (_) { return 'basic'; }
  }

  // Resolve filenames based on the *currently selected* tier. The basic tier
  // intentionally keeps the historical filename `heb_morphology.bin` for
  // back-compat with prior SW cache entries + the existing morph-build basic
  // output. The full tier ships a pre-gzipped `.bin.gz` (~5 MB) instead of
  // the raw ~75 MB JSON — fetch + decompress via DecompressionStream below.
  function dictPaths(tier) {
    const t = VALID_TIERS.includes(tier) ? tier : 'basic';
    const suffix = t === 'full' ? '_full' : '';
    const compressed = (t === 'full');
    return {
      bin:  `/morph/heb_morphology${suffix}.bin` + (compressed ? '.gz' : ''),
      meta: `/morph/heb_morphology${suffix}.meta.json`,
      tier: t,
      compressed,
    };
  }

  // Decompress a gzipped Response via the standard DecompressionStream API.
  // Available in all modern browsers (Chrome 80+, Firefox 113+, Safari 16.4+).
  // Throws on older browsers — the runtime surfaces this via T1.state='error'.
  async function decompressGzipResponse(resp) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream API unavailable; cannot load gzipped tier');
    }
    const ds = new DecompressionStream('gzip');
    const stream = resp.body.pipeThrough(ds);
    return await new Response(stream).text();
  }

  // ── Tier 1: Local pre-computed dictionary ──────────────────────────────
  const T1 = {
    id: 'local-hspell-prebuilt',
    state: 'not_initialized', // not_initialized | fetching | loading | ready | error
    loadedTier: null,         // which tier the in-memory map represents
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
      const paths = dictPaths(getDictTier());
      try {
        const t0 = Date.now();
        const metaResp = await fetch(paths.meta, { cache: 'no-cache' });
        if (!metaResp.ok) throw new Error('meta fetch failed: ' + metaResp.status);
        this.meta = await metaResp.json();
        this.state = 'loading';

        const binResp = await fetch(paths.bin);
        if (!binResp.ok) throw new Error('bin fetch failed: ' + binResp.status);
        const txt = paths.compressed
          ? await decompressGzipResponse(binResp)
          : await binResp.text();
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
        this.loadedTier = paths.tier;
        this.state = 'ready';
        this.error = null;

        try {
          (window.v3OpfsTelemetryPush || function(){})({
            kind: 'morph.dict.loaded',
            durationMs: Date.now() - t0,
            entries: this.entryCount,
            sizeBytes: this.sizeBytes,
            tier: paths.tier,
            version: this.meta && this.meta.format_version,
            provider: this.meta && this.meta.data_provider,
          });
        } catch (_) {}
      } catch (e) {
        this.state = 'error';
        this.error = String(e && e.message ? e.message : e);
        console.warn(`[morph] Tier 1 init failed (tier=${paths.tier}):`, this.error, '— falling through to Tier 2');
        try {
          (window.v3OpfsTelemetryPush || function(){})({
            kind: 'morph.dict.error', tier: paths.tier, error: this.error,
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
      this.loadedTier = null;
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
      dictTier: getDictTier(),
      tier1: {
        id: T1.id,
        state: T1.state,
        loadedTier: T1.loadedTier,
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

  // Clear the SW cache entries for BOTH tier files + reset in-memory state.
  // Forces a fresh download on next ensureReady(). We delete both basic and
  // full filenames so a tier-switch followed by clearCache fully purges
  // whichever variant happened to be cached.
  async function clearCache() {
    const targets = [
      '/morph/heb_morphology.bin', '/morph/heb_morphology.meta.json',
      '/morph/heb_morphology_full.bin', '/morph/heb_morphology_full.bin.gz',
      '/morph/heb_morphology_full.meta.json',
    ];
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          for (const target of targets) await cache.delete(target).catch(() => {});
        }
      }
    } catch (_) {}
    await T1.clearCache();
  }

  async function forceUpdate() {
    await clearCache();
    return ensureReady();
  }

  // Switch dictionary tier. If the requested tier differs from the currently
  // loaded one (or from current localStorage state), persist the choice and
  // reset T1 so the next ensureReady() / analyze() fetches the new files.
  // Returns { ok, tier, reloaded }. Does NOT eagerly re-fetch — caller can
  // chain `ensureReady()` if they want the new tier loaded immediately.
  async function setDictTier(tier) {
    if (!VALID_TIERS.includes(tier)) {
      return { ok: false, error: 'INVALID_TIER', tier };
    }
    const prev = getDictTier();
    try { localStorage.setItem(DICT_TIER_KEY, tier); } catch (_) {}
    const reloaded = (prev !== tier) || (T1.loadedTier && T1.loadedTier !== tier);
    if (reloaded) {
      // Drop in-memory map AND purge SW cache for the old tier so a stale
      // entry can't be served on next fetch. The new tier's files (if any)
      // will be fetched on the next ensureReady() call.
      await clearCache();
    }
    return { ok: true, tier, reloaded };
  }

  window.MorphProvider = {
    ensureReady,
    analyze,
    getStatus,
    clearCache,
    forceUpdate,
    getDictTier,
    setDictTier,
    _T1: T1, // diagnostic; not part of the public contract
    _T2: T2,
  };
})();
