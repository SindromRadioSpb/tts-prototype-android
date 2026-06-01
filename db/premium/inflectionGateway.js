"use strict";

// Inflection gateway — conjugation (verbs) + declension (nouns/adj) paradigms.
// Mirrors morphologyGateway's shape. Single provider (Pealim scrape) with a
// shared server-side disk cache in front. A global politeness limiter caps
// concurrent outbound Pealim fetches + spaces them out (responsible scraping).

const pealim = require("./providers/pealim");
const cache = require("./pealimCache");

const MODEL_VERSION = pealim.MODEL_VERSION;

// ── politeness limiter: ≤ MAX_CONCURRENT outbound fetches, ≥ MIN_GAP_MS apart ─
const MAX_CONCURRENT = Number(process.env.PEALIM_CONCURRENCY || 2);
const MIN_GAP_MS = Number(process.env.PEALIM_MIN_GAP_MS || 350);
let _active = 0;
let _lastStart = 0;
const _queue = [];
function _runNext() {
  if (_active >= MAX_CONCURRENT || !_queue.length) return;
  const now = Date.now();
  const wait = Math.max(0, _lastStart + MIN_GAP_MS - now);
  const job = _queue.shift();
  _active++;
  _lastStart = now + wait;
  setTimeout(() => {
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => { _active--; _runNext(); });
  }, wait);
}
function _limited(fn) {
  return new Promise((resolve, reject) => { _queue.push({ fn, resolve, reject }); _runNext(); });
}

// inflect(lemma, { binyan?, pos?, root? }) → { ok, paradigm?, provider, degraded, reason?, model_version, cached? }
async function inflect(lemma, opts) {
  const text = String(lemma == null ? "" : lemma).trim();
  if (!text) return { ok: false, degraded: true, provider: "none", reason: "empty", model_version: MODEL_VERSION };
  const o = opts || {};

  // 1) shared disk cache (universal reference data)
  const key = cache.keyFor(text, o.binyan, o.pos, MODEL_VERSION);
  const hit = cache.get(key);
  if (hit) return { ok: true, paradigm: hit, provider: "pealim", degraded: false, model_version: MODEL_VERSION, cached: true };

  // 2) miss → scrape (rate-limited), pass the page cache for disambiguation reuse
  try {
    const r = await _limited(() => pealim.resolveLemma(text, {
      binyan: o.binyan, pos: o.pos, root: o.root,
      pageGet: (id) => cache.getPage(id, MODEL_VERSION),         // model-versioned: never reuse stale parsed cells
      pagePut: (id, p) => cache.putPage(id, p, MODEL_VERSION),
    }));
    if (r && r.ok && r.paradigm) {
      cache.put(key, r.paradigm);
      return { ok: true, paradigm: r.paradigm, provider: "pealim", degraded: false, model_version: MODEL_VERSION, cached: false };
    }
    return { ok: false, degraded: true, provider: "none", reason: (r && r.reason) || "no_result", model_version: MODEL_VERSION };
  } catch (e) {
    return { ok: false, degraded: true, provider: "none", reason: String(e && e.message ? e.message : e), model_version: MODEL_VERSION };
  }
}

module.exports = { inflect, MODEL_VERSION };
