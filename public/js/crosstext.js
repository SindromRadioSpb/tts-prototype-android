// public/js/crosstext.js — Cross-text "Где встречается" lookup service.
//
// v3.3.2 Direction 15. Implements the §8 service surface from
// docs/PHASE_PLAN_v3_3_2.md.
//
// Public surface (window.CrossText):
//   findOccurrences(word, opts) → Promise<Occurrence[]>
//   invalidate()                → void
//   getStats()                  → object
//
// Privacy invariant (matches morph-provider.js requirement #17 and the
// v3.3.2 plan §12): NO event emission, NO telemetry on word lookups,
// NO fetch(). All operations run against the local sentences table via
// window.__localDB.dbQuery — the same surface that morph-provider.js
// already trusts.
//
// Index strategy: lazy build on first findOccurrences call. Module-private
// IndexState. Invalidation hooks:
//   - CrossText.invalidate() — public API for the call site
//   - visibilitychange + idle > 5 min → drop the index (saves memory)
//   - explicit local-db hook wiring is the caller's responsibility for
//     v3.3.2; an automatic listener requires a local-db event surface
//     that doesn't currently exist (deferred to v3.3.3+).

(function () {
  'use strict';

  // ── module state ───────────────────────────────────────────────────────
  let _index = null;             // IndexState | null
  let _building = null;          // Promise<void> | null (deduplicate concurrent builds)
  let _queryCache = new Map();   // LRU: cacheKey → Occurrence[]
  let _lastQueryMs = 0;
  const _MAX_QUERY_CACHE = 200;
  const _IDLE_INVALIDATE_MS = 5 * 60 * 1000;
  let _idleTimer = null;

  // ── helpers ────────────────────────────────────────────────────────────
  // Hebrew character ranges:
  //   Letters: U+05D0..U+05EA (אבגדהוזחטיכךלמםנןסעפףצץקרשת)
  //   Marks  : U+0591..U+05C7 (niqqud + cantillation)
  // We tokenize letters+marks together so the snippet retains niqqud.
  const HEBREW_TOKEN_RE = /[א-ת֑-ׇ]+/gu;

  function normalize(word) {
    if (typeof window === 'undefined' || !window.MorphNormalize ||
        typeof window.MorphNormalize.normalizeHebrew !== 'function') {
      return String(word || '').trim();
    }
    return window.MorphNormalize.normalizeHebrew(word);
  }

  async function _q(sql, params) {
    const ldb = (typeof window !== 'undefined') && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== 'function') {
      throw new Error('crosstext: local-db not ready (window.__localDB.dbQuery missing)');
    }
    return ldb.dbQuery(sql, params || []);
  }

  // Resolve the morphology root for a word, if both the morph dict is
  // available AND it has an analysis. Otherwise returns null. We do NOT
  // build the cross-text index against the dict; this is per-lookup.
  async function _resolveRoot(word) {
    if (typeof window === 'undefined' || !window.MorphProvider) return null;
    if (typeof window.MorphProvider.analyze !== 'function') return null;
    try {
      const analyses = await window.MorphProvider.analyze(word);
      if (!Array.isArray(analyses) || analyses.length === 0) return null;
      // Take the first analysis with a non-empty root (the morph dict
      // returns them in priority order — Tier 1 hspell wins over Tier 2).
      for (const a of analyses) {
        if (a && a.r) return { root: String(a.r), binyan: a.b || null };
      }
      return null;
    } catch (_) { return null; }
  }

  // ── tokenization ───────────────────────────────────────────────────────
  // Returns Array<{ token, start, end, normalized }> for every Hebrew
  // token in `text`. Single-pass.
  function tokenize(text) {
    if (!text) return [];
    const out = [];
    HEBREW_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = HEBREW_TOKEN_RE.exec(text)) !== null) {
      const tok = m[0];
      const norm = normalize(tok);
      if (!norm) continue;
      out.push({ token: tok, start: m.index, end: m.index + tok.length, normalized: norm });
    }
    return out;
  }

  // ── index build ────────────────────────────────────────────────────────
  async function _buildIndex() {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    const rows = await _q(
      `SELECT s.id AS sentence_id,
              s.text_id AS text_id,
              s.order_index AS order_index,
              s.he_plain AS he_plain,
              t.title AS text_title
       FROM sentences s
       JOIN texts t ON t.id = s.text_id
       WHERE t.is_archived = 0
       ORDER BY t.last_opened_at DESC, s.order_index ASC`,
      []
    );

    const forward = new Map();      // normalized_key → IndexEntry[]
    const textsSet = new Set();
    let distinctKeys = 0;

    for (const row of rows) {
      const tokens = tokenize(row.he_plain || '');
      if (!tokens.length) continue;
      textsSet.add(row.text_id);

      // Bucket positions per normalized key within THIS sentence.
      const perKey = new Map();
      for (const tok of tokens) {
        let bucket = perKey.get(tok.normalized);
        if (!bucket) { bucket = []; perKey.set(tok.normalized, bucket); }
        bucket.push(tok.start);
      }

      // Append one IndexEntry per (sentence, key) pair.
      for (const [key, positions] of perKey) {
        const entry = {
          text_id:     row.text_id,
          text_title:  row.text_title,
          sentence_id: row.sentence_id,
          order_index: Number(row.order_index) || 0,
          he_plain:    row.he_plain || '',
          positions:   positions.slice(),
        };
        let list = forward.get(key);
        if (!list) { list = []; forward.set(key, list); distinctKeys++; }
        list.push(entry);
      }
    }

    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

    _index = {
      forward,
      built_at: Date.now(),
      build_ms: Math.round(elapsed),
      texts_indexed:    textsSet.size,
      sentences_indexed: rows.length,
      distinct_keys:    distinctKeys,
    };
    _queryCache.clear();
    _scheduleIdleInvalidate();
  }

  function _scheduleIdleInvalidate() {
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    if (typeof window === 'undefined' || typeof setTimeout !== 'function') return;
    // If the tab is hidden continuously for > _IDLE_INVALIDATE_MS, drop the
    // index to save memory. Page becoming visible again will rebuild on
    // next lookup. We attach a single visibility listener (idempotent).
    if (!_idleTimerInstalled) {
      _idleTimerInstalled = true;
      try {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            if (_idleTimer) clearTimeout(_idleTimer);
            _idleTimer = setTimeout(() => { invalidate(); }, _IDLE_INVALIDATE_MS);
          } else {
            if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
          }
        });
      } catch (_) { /* no document, e.g. node smoke without DOM — skip */ }
    }
  }
  let _idleTimerInstalled = false;

  async function ensureIndex() {
    if (_index) return;
    if (_building) return _building;
    _building = _buildIndex().finally(() => { _building = null; });
    return _building;
  }

  // ── snippet construction ──────────────────────────────────────────────
  // 80-char window (40 before + 40 after the match), clamped to sentence
  // bounds. Marks the start/end of the match within the snippet for the
  // UI to wrap in <mark>. Source text is passed through unchanged — we do
  // NOT strip niqqud so the user sees the authored form.
  function makeSnippet(he_plain, matchStart, matchEnd, halfWindow = 40) {
    const total = he_plain.length;
    let from = Math.max(0, matchStart - halfWindow);
    let to   = Math.min(total, matchEnd + halfWindow);
    let snippet = he_plain.slice(from, to);
    let leadingEllipsis = from > 0;
    let trailingEllipsis = to < total;
    if (leadingEllipsis)  snippet = '…' + snippet;
    if (trailingEllipsis) snippet = snippet + '…';
    const offset = leadingEllipsis ? 1 : 0;
    return {
      snippet,
      snippet_match: {
        start: matchStart - from + offset,
        end:   matchEnd   - from + offset,
      },
      leading_ellipsis: leadingEllipsis,
      trailing_ellipsis: trailingEllipsis,
    };
  }

  // ── public API: findOccurrences ───────────────────────────────────────
  async function findOccurrences(word, opts) {
    opts = opts || {};
    const limit = Math.max(1, Math.min(1000, Number(opts.limit) || 200));
    const includeRoot = !!opts.includeRoot;
    const excludeTextId = opts.excludeTextId ? String(opts.excludeTextId) : null;

    await ensureIndex();

    const tStart = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    const queryKey = normalize(word);
    if (!queryKey) {
      _lastQueryMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart);
      return [];
    }

    // Cache key encodes the params that affect the result set.
    const cacheKey = JSON.stringify({ k: queryKey, r: includeRoot, x: excludeTextId, l: limit });
    if (_queryCache.has(cacheKey)) {
      // Move-to-end for LRU semantics.
      const cached = _queryCache.get(cacheKey);
      _queryCache.delete(cacheKey);
      _queryCache.set(cacheKey, cached);
      _lastQueryMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart);
      return cached;
    }

    // Gather candidate keys: the surface normalized form, plus the root
    // (if includeRoot and morph dict resolves one).
    const candidateKeys = new Set([queryKey]);
    let rootInfo = null;
    if (includeRoot) {
      rootInfo = await _resolveRoot(word);
      if (rootInfo && rootInfo.root) {
        const rKey = normalize(rootInfo.root);
        if (rKey) candidateKeys.add(rKey);
      }
    }

    // Walk forward index for each candidate key, dedupe by sentence_id.
    const seen = new Set();
    const out = [];
    for (const key of candidateKeys) {
      const list = _index.forward.get(key) || [];
      for (const entry of list) {
        if (excludeTextId && entry.text_id === excludeTextId) continue;
        if (seen.has(entry.sentence_id)) continue;
        seen.add(entry.sentence_id);

        // Pick the first position for the snippet anchor.
        const firstPos = entry.positions[0] || 0;
        // The matched form is the raw text at that position. Since
        // tokenizer captured letters+niqqud, the match length is the
        // original token length (we don't store it explicitly; reconstruct
        // by scanning forward through letters+niqqud from firstPos).
        let matchLen = 0;
        const pln = entry.he_plain || '';
        while (firstPos + matchLen < pln.length) {
          const c = pln.charCodeAt(firstPos + matchLen);
          // Hebrew letter or niqqud mark
          if ((c >= 0x05D0 && c <= 0x05EA) || (c >= 0x0591 && c <= 0x05C7)) {
            matchLen++;
          } else break;
        }
        const matchEnd = firstPos + matchLen;
        const snipResult = makeSnippet(pln, firstPos, matchEnd);

        out.push({
          text_id:       entry.text_id,
          text_title:    entry.text_title,
          sentence_id:   entry.sentence_id,
          order_index:   entry.order_index,
          snippet:       snipResult.snippet,
          snippet_match: snipResult.snippet_match,
          matched_form:  pln.slice(firstPos, matchEnd),
          positions_in_sentence: entry.positions.length,
          // root/binyan only populated when includeRoot took effect AND the
          // morph dict had a confident analysis for the queried word.
          root:   rootInfo ? rootInfo.root  : undefined,
          binyan: rootInfo ? rootInfo.binyan : undefined,
        });
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }

    // Sort: by text_id, then order_index, for stable presentation.
    out.sort((a, b) => {
      if (a.text_id < b.text_id) return -1;
      if (a.text_id > b.text_id) return 1;
      return a.order_index - b.order_index;
    });

    // Insert into LRU.
    _queryCache.set(cacheKey, out);
    if (_queryCache.size > _MAX_QUERY_CACHE) {
      // Drop oldest (first inserted) — Map preserves insertion order.
      const oldest = _queryCache.keys().next().value;
      if (oldest != null) _queryCache.delete(oldest);
    }

    _lastQueryMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart);
    return out;
  }

  // ── public API: invalidate ────────────────────────────────────────────
  function invalidate() {
    _index = null;
    _queryCache.clear();
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  }

  // ── public API: getStats ──────────────────────────────────────────────
  function getStats() {
    if (!_index) {
      return {
        index_built: false,
        texts_indexed: 0,
        sentences_indexed: 0,
        distinct_keys: 0,
        last_query_ms: _lastQueryMs,
        query_cache_size: _queryCache.size,
      };
    }
    return {
      index_built: true,
      built_at: _index.built_at,
      build_ms: _index.build_ms,
      texts_indexed: _index.texts_indexed,
      sentences_indexed: _index.sentences_indexed,
      distinct_keys: _index.distinct_keys,
      last_query_ms: _lastQueryMs,
      query_cache_size: _queryCache.size,
    };
  }

  // ── expose ─────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.CrossText = {
      findOccurrences,
      invalidate,
      getStats,
      // Internals exposed for testing only; not part of the contract.
      _tokenize: tokenize,
      _normalize: normalize,
      _ensureIndex: ensureIndex,
    };
  }
})();
