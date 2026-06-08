// LinguistPro Service Worker — Direction 7 Phase C, v3.1.0.
//
// ── Strategies ───────────────────────────────────────────────────────────
//   • Precache (install): app shell + locales + DB layer + TTS layer +
//     fonts + icons + manifest. Everything needed for offline cold start.
//   • Runtime cache (fetch, GET only): stale-while-revalidate for any
//     additional same-origin static asset not in precache (e.g. lazy
//     modules added later, /typo-test.html). Bounded by purge of old
//     versions on activate.
//   • Network-first with cache fallback (timeout 2.5s): /api/client-config
//     — needed at startup but not user-critical; tolerates stale config.
//   • Network-only (no caching): all other /api/* — translations, TTS,
//     audio, transliterate, export/import, feedback. These either change
//     state, depend on quotas, or upload data; caching them would be wrong.
//
// ── Update lifecycle ─────────────────────────────────────────────────────
// On install we precache the shell into a versioned cache. We do NOT call
// skipWaiting() automatically — the new SW waits in `installed` state
// until the user explicitly accepts the update via the "Обновить" toast
// shown in the app (which posts {type:'SKIP_WAITING'} to us). This is the
// classic premium PWA pattern: the user is in control of when to apply
// the update. On activate we purge any cache whose name doesn't match
// the current versioned set, then claim clients so the controlled page
// uses the new SW immediately.
//
// ── Cache names ──────────────────────────────────────────────────────────
// Bumping CACHE_VERSION invalidates all caches. The version is derived
// from the deploy: bump on every release that ships new shell assets.

const CACHE_VERSION = "v3.10.14-canon-versioned-dedup";
const PRECACHE = `linguistpro-precache-${CACHE_VERSION}`;
const RUNTIME = `linguistpro-runtime-${CACHE_VERSION}`;
const CONFIG_CACHE = `linguistpro-config-${CACHE_VERSION}`;
// Workstream A1 Phase 2 — opt-in extended morphology dict. Held in its
// own bucket so the ~5 MB gzipped full-tier blob (~75 MB after browser-
// side decompression) can be evicted independently of the app shell when
// the device hits storage quota pressure.
const MORPH_CACHE = `linguistpro-morph-${CACHE_VERSION}`;
// Quota threshold above which we serve the morph response but skip caching
// it (iOS Safari friendliness). 80 % matches the "Add to Home Screen"
// quota recommendation in the Safari Web Content Guide.
const MORPH_QUOTA_THRESHOLD = 0.80;

// Offline Pealim inflection dataset (~4-5 MB gzipped). Own bucket (evictable
// independently, like MORPH_CACHE). Lazy — NOT in PRECACHE_URLS; fetched on
// first conjugation table open via window.InflectionDict. Filename is
// model-versioned (pealim-infl-<model>.json.gz) so a model bump can't stale.
const INFLECTION_CACHE = `linguistpro-inflection-${CACHE_VERSION}`;

// v3.3.6 Direction 14 — Knowledge Graph lazy chunks. Held in their own
// bucket, versioned INDEPENDENTLY of CACHE_VERSION so a graph-asset
// bump (e.g. a d3 patch / renderer change) evicts only the graph cache
// and does not churn the whole precache. Bump GRAPH_CACHE_VERSION
// whenever public/vendor/d3-graph.min.js or public/js/notes-graph*.js
// change materially (see docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md
// "Pre-C0 Blind Spots Closed" §H). The 3 chunks are NOT in
// PRECACHE_URLS — they load only on first LinguistProGraph.open().
const GRAPH_CACHE_VERSION = "v3.3.6-1";
const GRAPH_CACHE = `linguistpro-graph-${GRAPH_CACHE_VERSION}`;
const GRAPH_CHUNK_RE = /^\/(vendor\/d3-graph\.min\.js|js\/notes-graph(-loader|-render)?\.js)$/;

// Precache list — relative paths only. Keep this in sync with the modules
// imported at startup. qrcode.js stays lazy (rare). jszip.min.js IS precached:
// Library ZIP import/export is a core flow and the on-demand <script> injection
// proved flaky on iOS WebKit with a freshly-activated SW — precaching makes the
// loader hit cache (reliable + offline-capable). It's still executed lazily.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  // BRR-P0-002/002a — Reading Room surface (clean sub-brand). Shares this SW
  // (scope "/") for v1; a separate lightweight sw-room.js is deferred to P0-002b.
  "/library.html",
  "/js/library-ui.js",
  // Knowledge Map v3.8 (root-centric, always on)
  "/js/knowledge-map-data.js",
  "/js/knowledge-map-view.js",
  // Knowledge Map v3.8 Phase 4 — generative graph-quiz (loader eager; heavy
  // module + connection-recall bridge precached but executed lazily via the
  // loader, like jszip)
  "/js/knowledge-map-quiz-loader.js",
  "/js/knowledge-map-quiz.js",
  "/js/notes-graph-srs-candidates.js",
  // Offline Pealim inflection dict loader (dataset itself is lazy, not precached)
  "/js/inflection-dict.js",
  // Function-word → Pealim dict-page link map loader (map JSON is lazy via /data/inflection/)
  "/js/pealim-function-links.js",
  // ②-note autogen resolver core (pure; shared with Node audit/parity smoke)
  "/js/notes-autogen.js",
  // i18n
  "/i18n/index.js",
  "/i18n/locales/ru.js",
  "/i18n/locales/en.js",
  "/i18n/locales/he.js",
  // Local DB layer (OPFS + wa-sqlite WASM glue)
  "/db/sqlite-api.js",
  "/db/sqlite-constants.js",
  "/db/IDBBatchAtomicVFS.js",
  "/db/IDBContext.js",
  "/db/AccessHandlePoolVFS.js",
  "/db/VFS.js",
  "/db/WebLocks.js",
  "/db/local-db.js",
  "/db/migrations.js",
  "/db/tag.js",
  "/db/db-worker.js",
  "/db/jszip.min.js",
  // TTS layer
  "/tts/core.js",
  "/tts/backends.js",
  "/tts/providerPolicy.js",
  "/tts/settings.js",
  // Fonts (Hebrew typography, Direction 1)
  "/fonts/frank-ruhl-libre-400.woff2",
  "/fonts/frank-ruhl-libre-500.woff2",
  "/fonts/frank-ruhl-libre-700.woff2",
  "/fonts/assistant-400.woff2",
  "/fonts/assistant-500.woff2",
  "/fonts/assistant-700.woff2",
  "/fonts/noto-sans-hebrew-400.woff2",
  "/fonts/noto-sans-hebrew-500.woff2",
  "/fonts/noto-sans-hebrew-700.woff2",
  // Icons
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon-180.png",
  "/icons/favicon-32.png",
  "/favicon.ico",
];

const CONFIG_URL_RE = /\/api\/client-config(\?|$)/;
const NETWORK_FIRST_TIMEOUT_MS = 2500;

// ── install ──────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // Use { cache: 'reload' } to bypass HTTP cache for the precache fetch
    // — we want fresh assets at install time, not whatever the browser
    // has stored.
    await Promise.all(
      PRECACHE_URLS.map((url) =>
        cache.add(new Request(url, { cache: "reload" })).catch((err) => {
          // Don't fail the whole install if one optional asset is missing
          // (e.g. a renamed file). Log and continue.
          console.warn("[sw] precache miss:", url, err && err.message);
        })
      )
    );
  })());
});

// ── activate ─────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PRECACHE, RUNTIME, CONFIG_CACHE, MORPH_CACHE, GRAPH_CACHE, INFLECTION_CACHE]);
    const names = await caches.keys();
    await Promise.all(
      names
        // Evicts stale precache/runtime/config/morph AND any OLD
        // linguistpro-graph-* bucket whose version no longer matches
        // GRAPH_CACHE — so a graph-asset bump cleans itself up here.
        .filter((n) => n.startsWith("linguistpro-") && !keep.has(n))
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// ── message ──────────────────────────────────────────────────────────────
// Receive {type:'SKIP_WAITING'} from the app when the user accepts the
// update toast. Other message types reserved for future telemetry.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── fetch ────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept mutations

  const url = new URL(req.url);

  // Only handle same-origin requests. Cross-origin (e.g. dev tools, future
  // CDN) goes straight to network.
  if (url.origin !== self.location.origin) return;

  // /api/client-config — network-first with timeout, fall back to cache.
  if (CONFIG_URL_RE.test(url.pathname + url.search)) {
    event.respondWith(networkFirst(req, CONFIG_CACHE, NETWORK_FIRST_TIMEOUT_MS));
    return;
  }

  // All other /api/* — network-only. Don't cache responses (would mask
  // quota/state/upload semantics).
  if (url.pathname.startsWith("/api/")) return;

  // /morph/* — dedicated cache bucket so the opt-in full-tier dict
  // (~5 MB gzipped, ~75 MB decompressed) can be evicted independently of
  // the app shell when quota pressure hits, and so MorphProvider can
  // surgically purge it via caches.delete('/morph/...') in clearCache().
  if (url.pathname.startsWith("/morph/")) {
    event.respondWith(morphCacheStrategy(req));
    return;
  }

  // /data/inflection/* — offline Pealim dataset, dedicated evictable bucket,
  // cache-first with quota guard (same posture as /morph/).
  if (url.pathname.startsWith("/data/inflection/")) {
    event.respondWith(inflectionCacheStrategy(req));
    return;
  }

  // v3.3.6 Knowledge Graph lazy chunks — dedicated versioned bucket.
  // Stale-while-revalidate: first open fetches over the network and
  // populates GRAPH_CACHE; subsequent opens are served instantly from
  // cache (offline-capable). Bumping GRAPH_CACHE_VERSION makes activate
  // evict the old bucket so a graph-asset change is never stale-loaded.
  if (GRAPH_CHUNK_RE.test(url.pathname)) {
    event.respondWith(graphCacheStrategy(req));
    return;
  }

  // Static + shell — stale-while-revalidate. Precached assets resolve
  // immediately from cache; runtime assets get cached on first hit.
  event.respondWith(staleWhileRevalidate(req));
});

// ── strategies ───────────────────────────────────────────────────────────
async function staleWhileRevalidate(req) {
  // Try precache first, then runtime cache, then network.
  const precache = await caches.open(PRECACHE);
  const runtime = await caches.open(RUNTIME);
  const cached = (await precache.match(req)) || (await runtime.match(req));

  const fetchPromise = fetch(req).then((res) => {
    // Only cache successful, basic (same-origin), non-opaque responses.
    if (res && res.ok && res.type === "basic") {
      // CRITICAL: clone EAGERLY before returning res. Otherwise the
      // page consumes res.body via res.text()/json() and the deferred
      // precache.match(...).then(...) cascade tries res.clone() AFTER
      // the body is already consumed → "Response body is already used"
      // TypeError, which propagates as an unhandled rejection out of
      // event.respondWith and turns the whole FetchEvent into a
      // network error. This breaks every uncached same-origin runtime
      // fetch (heb_morphology.bin, fonts on first hit, etc.).
      const cacheable = res.clone();
      precache.match(req).then((alreadyPrecached) => {
        if (!alreadyPrecached) runtime.put(req, cacheable).catch(() => {});
      });
    }
    return res;
  }).catch((err) => {
    // Network failed. If we have a cached response, the caller already
    // got it; otherwise propagate the error to the page.
    if (cached) return cached;
    throw err;
  });

  // Return cached immediately if available; otherwise wait for network.
  return cached || fetchPromise;
}

// Knowledge Graph chunk strategy — stale-while-revalidate against the
// versioned GRAPH_CACHE bucket. Cache hit returns instantly while a
// background fetch refreshes the entry; cache miss waits for network
// and stores it. Only same-origin GET (guaranteed by the fetch-handler
// guards above).
async function graphCacheStrategy(req) {
  const cache = await caches.open(GRAPH_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.ok && res.type === "basic") {
      const cacheable = res.clone();
      cache.put(req, cacheable).catch(() => {});
    }
    return res;
  }).catch((err) => {
    if (cached) return cached;
    throw err;
  });
  return cached || fetchPromise;
}

async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  let timeoutId;
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const winner = await Promise.race([networkPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    if (winner) return winner;
    // Timeout — try cache, fall back to a slower network wait.
    const cached = await cache.match(req);
    if (cached) return cached;
    return await networkPromise; // last resort
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

// Cache-first strategy for /morph/*. Background-revalidates so the dict
// stays fresh when a new tier is deployed. Bound to MORPH_CACHE so callers
// can purge the entire morph bucket atomically. Skips caching when the
// device is within MORPH_QUOTA_THRESHOLD of its storage quota — pertinent
// for iOS Safari where the per-origin quota can be as low as 50-200 MB.
async function morphCacheStrategy(req) {
  const cache = await caches.open(MORPH_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(async (res) => {
    if (res && res.ok && res.type === "basic") {
      const ok = await isStorageQuotaSafe();
      if (ok) {
        // Eager-clone before returning res, same caveat as
        // staleWhileRevalidate above.
        const copy = res.clone();
        cache.put(req, copy).catch(() => {});
      }
    }
    return res;
  }).catch((err) => {
    if (cached) return cached;
    throw err;
  });
  return cached || fetchPromise;
}

// Cache-first for /data/inflection/* — identical posture to morphCacheStrategy,
// bound to INFLECTION_CACHE so the dataset can be purged atomically.
async function inflectionCacheStrategy(req) {
  const cache = await caches.open(INFLECTION_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(async (res) => {
    if (res && res.ok && res.type === "basic") {
      const ok = await isStorageQuotaSafe();
      if (ok) { const copy = res.clone(); cache.put(req, copy).catch(() => {}); }
    }
    return res;
  }).catch((err) => { if (cached) return cached; throw err; });
  return cached || fetchPromise;
}

async function isStorageQuotaSafe() {
  try {
    if (!self.navigator || !self.navigator.storage || !self.navigator.storage.estimate) {
      // No quota API — assume safe (e.g. old browser). Fail-open.
      return true;
    }
    const est = await self.navigator.storage.estimate();
    if (!est || !est.quota || !est.usage) return true;
    return (est.usage / est.quota) < MORPH_QUOTA_THRESHOLD;
  } catch (_) { return true; }
}
