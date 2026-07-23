"use strict";

// H2.4 — single-flight, on-demand Dicta Nakdan client.
// This path is deliberately separate from providers/dictaCloud.js: the latter is a
// batch-pipeline adapter that degrades failed segments to empty strings. An explicit
// owner action must instead fail loudly with the stable NAKDAN_UNAVAILABLE code.

const crypto = require("crypto");

const DEFAULT_URL = process.env.DICTA_NAKDAN_URL || "https://nakdan-5-1.loadbalancer.dicta.org.il/api";
const MODEL_VERSION = "dicta-nakdan-modern-2026-07-23";
const TIMEOUT_MS = 10_000;
const MIN_START_INTERVAL_MS = 1_000;
const CIRCUIT_FAILURES = 3;
const CIRCUIT_OPEN_MS = 30_000;
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_MAX = 50;
const MAX_TEXT_CHARS = 100_000;

class NakdanError extends Error {
  constructor(code, details) {
    super(code);
    this.name = "NakdanError";
    this.code = code;
    if (details && details.retry_after_ms != null) this.retry_after_ms = details.retry_after_ms;
  }
}

function normalizeSource(text) {
  return String(text == null ? "" : text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n");
}

function sourceHash(text) {
  return crypto.createHash("sha256").update(normalizeSource(text), "utf8").digest("hex");
}

function parseResponse(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) throw new NakdanError("NAKDAN_UNAVAILABLE");
  let out = "";
  for (const token of tokens) {
    if (token == null) continue;
    if (typeof token === "string") { out += token; continue; }
    if (Array.isArray(token)) {
      const best = token[0];
      out += Array.isArray(best) ? String(best[0] || "") : String(best || "");
      continue;
    }
    if (typeof token !== "object") continue;
    const options = Array.isArray(token.options) ? token.options : [];
    if (options.length) {
      const best = options[0];
      out += (Array.isArray(best) ? String(best[0] || token.word || "") : String(best || token.word || ""));
    } else {
      out += String(token.word || "");
    }
    if (typeof token.sep === "string") out += token.sep;
  }
  out = out.replace(/\|/g, "");
  if (!out.trim() || !/[\u0590-\u05ff]/.test(out)) throw new NakdanError("NAKDAN_UNAVAILABLE");
  return out;
}

function createNakdanClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const url = options.url || DEFAULT_URL;
  const timeoutMs = options.timeoutMs || TIMEOUT_MS;
  const cache = new Map();
  const inflight = new Map();
  let queue = Promise.resolve();
  let lastStartAt = 0;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;

  function pruneCache(at) {
    for (const [key, value] of cache) if (value.expires_at <= at) cache.delete(key);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }

  async function upstream(text) {
    const at = now();
    if (at < circuitOpenUntil) {
      throw new NakdanError("NAKDAN_UNAVAILABLE", { retry_after_ms: circuitOpenUntil - at });
    }
    const waitMs = Math.max(0, MIN_START_INTERVAL_MS - (at - lastStartAt));
    if (waitMs) await sleep(waitMs);
    lastStartAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "LinguistPro-Nakdan-H2.4/1.0",
        },
        body: JSON.stringify({ task: "nakdan", genre: "modern", data: text, addmorph: false, keepqq: false }),
        signal: controller.signal,
      });
      if (!response || !response.ok) throw new NakdanError("NAKDAN_UNAVAILABLE");
      const niqqud = parseResponse(await response.json());
      consecutiveFailures = 0;
      circuitOpenUntil = 0;
      return niqqud;
    } catch (error) {
      consecutiveFailures++;
      if (consecutiveFailures >= CIRCUIT_FAILURES) circuitOpenUntil = now() + CIRCUIT_OPEN_MS;
      if (error && error.code === "NAKDAN_UNAVAILABLE") throw error;
      throw new NakdanError("NAKDAN_UNAVAILABLE", { retry_after_ms: Math.max(0, circuitOpenUntil - now()) });
    } finally {
      clearTimeout(timer);
    }
  }

  async function vocalize(text) {
    // H2.3 imports store non-empty trimmed lines in OPFS. Canonicalize before
    // hashing and before Dicta so preview and persisted-body hashes cannot drift
    // merely because the proposal contains blank or indented lyric lines.
    const input = normalizeSource(text);
    if (!input || input.length > MAX_TEXT_CHARS || !/[\u0590-\u05ff]/.test(input)) {
      throw new NakdanError("NAKDAN_INVALID_INPUT");
    }
    const hash = sourceHash(input);
    const at = now();
    pruneCache(at);
    const hit = cache.get(hash);
    if (hit && hit.expires_at > at) return Object.freeze({ ...hit.value, from_cache: true });
    const pending = inflight.get(hash);
    if (pending) return Object.freeze({ ...(await pending), from_cache: true });

    const work = (async () => {
      const run = queue.then(() => upstream(input));
      queue = run.catch(() => undefined);
      const niqqud = await run;
      const generatedAt = new Date(now()).toISOString();
      const date = generatedAt.slice(0, 10).replace(/-/g, "_");
      const value = Object.freeze({
        niqqud,
        source_hash: hash,
        niqqud_provenance: `DICTA_NAKDAN_${date}`,
        model_version: MODEL_VERSION,
        generated_at: generatedAt,
        from_cache: false,
      });
      cache.set(hash, { value, expires_at: now() + CACHE_TTL_MS });
      pruneCache(now());
      return value;
    })();
    inflight.set(hash, work);
    try { return await work; }
    finally { inflight.delete(hash); }
  }

  return Object.freeze({ vocalize, parseResponse, sourceHash });
}

const defaultClient = createNakdanClient();

module.exports = {
  vocalize: defaultClient.vocalize,
  createNakdanClient,
  parseResponse,
  sourceHash,
  normalizeSource,
  NakdanError,
  DEFAULT_URL,
  MODEL_VERSION,
  TIMEOUT_MS,
  MIN_START_INTERVAL_MS,
};
