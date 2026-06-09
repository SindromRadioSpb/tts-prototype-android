"use strict";

// scripts/premium/lib/ingestCore.js — BRR-P0-004/006 shared ingestion core.
//
// The translate + niqqud + fetch orchestration was previously inline in
// ingest-benyehuda.js. It is extracted here as a FACTORY so the pilot producer
// (ingest-benyehuda.js) and the full-corpus runner (run-corpus-prebake.js) call the
// SAME logic — zero drift, one R1 path. Behaviour is byte-faithful to the producer
// EXCEPT one correctness fix the resumable runner requires:
//   • translateCached now caches ONLY non-empty translations (like niqqudCached),
//     so a transient/quota/timeout empty is RETRIED on the next run instead of being
//     frozen as a permanent empty. (The old producer cached empties — fine for a
//     one-shot run, wrong for a multi-day resumable one.)
//
// createIngestCore(cfg) → { loadOrFetchCsv, fetchTxt, translateWork, translateAndBuild,
//                           saveCaches, computeTextKey, normalizeSourceText, thash,
//                           stats, quotaExhausted (getter), resetQuota() }
// cfg = { provider, geminiKey, geminiModel, geminiChunk, geminiTimeout, gcpKey,
//         byDir, csvPath, rawBase, noFetch, stamp, log }

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { segment } = require("../../../db/premium/segmenter");
const googleFree = require("../../../db/premium/providers/googleFree");
const gcp = require("../../../db/premium/providers/gcp");
const niqqudGateway = require("../../../db/premium/niqqudGateway");
const dictaCloud = require("../../../db/premium/providers/dictaCloud");
const { transliterateWithProfile } = require("../../../db/premium/translit");
const corpusMeta = require("../../../db/premium/corpusMeta");
const by = require("./benyehuda");

const DEFAULT_RAW_BASE = "https://raw.githubusercontent.com/projectbenyehuda/public_domain_dump/master";
const NIQ_RE = /[֑-ׇ]/; // non-global (safe for .test in loops)

function createIngestCore(cfg) {
  cfg = cfg || {};
  const provider = cfg.provider || "google-free";
  const geminiKey = cfg.geminiKey || "";
  const geminiModelName = cfg.geminiModel || "gemini-2.5-flash";
  const GEMINI_CHUNK = Number(cfg.geminiChunk || 50) || 50;
  const GEMINI_TIMEOUT_MS = Number(cfg.geminiTimeout || 90000) || 90000;
  const gcpKey = cfg.gcpKey || "";
  const byDir = cfg.byDir;
  if (!byDir) throw new Error("ingestCore: cfg.byDir required");
  const txtDir = cfg.txtDir || path.join(byDir, "txt");
  const csvPath = cfg.csvPath || path.join(byDir, "pseudocatalogue.csv");
  const rawBase = (cfg.rawBase || DEFAULT_RAW_BASE).replace(/\/+$/, "");
  const noFetch = !!cfg.noFetch;
  const stamp = cfg.stamp || new Date().toISOString();
  const log = typeof cfg.log === "function" ? cfg.log : () => {};

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const thash = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
  const normalizeSourceText = (s) => String(s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  function computeTextKey(sourceText) {
    const payload = { v: 1, sourceText: normalizeSourceText(sourceText), ttsProfile: null, tableModelMeta: null };
    return crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  }

  // ── disk caches (resume) ────────────────────────────────────────────────
  function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return {}; } }
  const transCachePath = path.join(byDir, "trans-cache.json");
  const niqCachePath = path.join(byDir, "niqqud-cache.json");
  let transCache = loadJson(transCachePath);
  let niqCache = loadJson(niqCachePath);
  function saveCaches() {
    try { fs.writeFileSync(transCachePath, JSON.stringify(transCache)); } catch (_) {}
    try { fs.writeFileSync(niqCachePath, JSON.stringify(niqCache)); } catch (_) {}
  }

  const stats = { geminiRequests: 0 };
  let quotaExhausted = false;

  // ── HTTP (polite, resumable) ──────────────────────────────────────────────
  async function httpGet(url) {
    if (typeof fetch !== "function") throw new Error("global fetch unavailable — Node >=18 required");
    let attempt = 0;
    for (;;) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "linguistpro-benyehuda-ingest/1.0" } });
        if (res.status === 404) { const e = new Error("404"); e.status = 404; throw e; }
        if (res.status === 429) { attempt++; if (attempt > 5) throw new Error("429-giveup"); const b = Math.min(60000, 3000 * 2 ** (attempt - 1)); log("429 → backoff " + b / 1000 + "s"); await sleep(b); continue; }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.text();
      } catch (e) {
        if (e && e.status === 404) throw e;
        attempt++; if (attempt > 3) throw e;
        await sleep(800);
      }
    }
  }

  async function loadOrFetchCsv() {
    if (fs.existsSync(csvPath)) { log("csv (cached):", csvPath); return fs.readFileSync(csvPath, "utf8"); }
    if (noFetch) throw new Error("csv not found and noFetch set: " + csvPath);
    log("fetching pseudocatalogue.csv from upstream…");
    const txt = await httpGet(rawBase + "/pseudocatalogue.csv");
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, txt);
    return txt;
  }

  async function fetchTxt(byPath) {
    const rel = String(byPath || "").replace(/^\//, "");
    const cacheFile = path.join(txtDir, rel + ".txt");
    if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
    if (noFetch) throw new Error("txt not cached and noFetch: " + byPath);
    const txt = await httpGet(rawBase + "/txt/" + rel + ".txt");
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, txt);
    return txt;
  }

  // ── translation providers (DB-free dispatch + disk cache) ─────────────────
  let _genaiModel = null;
  function geminiModel() {
    if (!geminiKey) throw new Error("provider gemini needs a Gemini API key (cfg.geminiKey)");
    if (!_genaiModel) {
      const { GoogleGenerativeAI } = require("@google/generative-ai");
      _genaiModel = new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: geminiModelName });
    }
    return _genaiModel;
  }
  function looksLikeQuota(msg) { return /\b429\b|quota|RESOURCE_EXHAUSTED|too many requests/i.test(String(msg || "")); }
  async function _geminiCallOnce(segs) {
    const model = geminiModel();
    const numbered = segs.map((s) => s.index + "\t" + s.he).join("\n");
    const prompt =
      "Translate each numbered Hebrew line into natural literary Russian. Keep the SAME line numbers. " +
      "Return ONLY a JSON array of objects {\"i\": <number>, \"ru\": \"<russian>\"}, one per input line, no markdown.\n\n" + numbered;
    stats.geminiRequests++; // every actual model call counts toward the daily budget
    try {
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, rej) => setTimeout(() => rej(new Error("gemini timeout " + GEMINI_TIMEOUT_MS + "ms")), GEMINI_TIMEOUT_MS)),
      ]);
      const raw = (await result.response).text().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      let arr; try { arr = JSON.parse(raw); } catch (_) { return null; }
      const m = {}; for (const x of (Array.isArray(arr) ? arr : [])) if (x && x.i != null) m[Number(x.i)] = String(x.ru || "");
      return m;
    } catch (e) {
      const msg = (e && e.message) || e;
      if (looksLikeQuota(msg)) { quotaExhausted = true; log("  gemini QUOTA/429 — stop after this work: " + msg); }
      else log("  gemini call error: " + msg);
      return null;
    }
  }
  async function geminiTranslateBatch(segs) {
    const out = {};
    for (let i = 0; i < segs.length; i += GEMINI_CHUNK) {
      if (quotaExhausted) break; // stop issuing new calls once the daily quota is hit
      const chunk = segs.slice(i, i + GEMINI_CHUNK);
      let m = await _geminiCallOnce(chunk);
      if (!m && !quotaExhausted) { await sleep(1500); m = await _geminiCallOnce(chunk); }
      if (!m && chunk.length > 1 && !quotaExhausted) {
        const mid = Math.ceil(chunk.length / 2);
        for (const part of [chunk.slice(0, mid), chunk.slice(mid)]) {
          const r = await geminiTranslateBatch(part);
          for (const x of r.results) if (x.ru) out[x.index] = x.ru;
        }
        continue;
      }
      if (m) { for (const k in m) out[k] = m[k]; }
      else if (!quotaExhausted) log("  gemini: " + chunk.length + " line(s) untranslated after retry (honest empty ru)");
    }
    return { results: segs.map((s) => ({ index: s.index, ru: out[s.index] || "" })) };
  }
  async function providerTranslate(segs) {
    if (provider === "gcp") {
      if (!gcpKey) throw new Error("provider gcp needs cfg.gcpKey");
      return gcp.translateBatchWithApiKey(segs, "ru", gcpKey);
    }
    if (provider === "gemini") return geminiTranslateBatch(segs);
    return googleFree.translateBatch(segs, "ru");
  }

  async function translateCached(segs, plain) {
    const out = {};
    const todo = [];
    const provTag = provider === "gemini" ? "gemini:" + geminiModelName : provider;
    segs.forEach((s, i) => {
      const key = thash(provTag + "|ru|" + plain[i]);
      if (Object.prototype.hasOwnProperty.call(transCache, key)) out[s.index] = transCache[key];
      else todo.push({ index: s.index, he: plain[i], _key: key });
    });
    if (todo.length) {
      const resp = await providerTranslate(todo.map((t) => ({ index: t.index, he: t.he })));
      const byIdx = {}; for (const r of (resp.results || [])) byIdx[r.index] = r.ru || "";
      for (const t of todo) {
        const ru = byIdx[t.index] || "";
        out[t.index] = ru;
        if (ru) transCache[t._key] = ru; // cache only real translations → empties retry next run
      }
      saveCaches();
    }
    return out;
  }

  async function niqqudCached(plainList) {
    const uniq = [...new Set(plainList.filter(Boolean))];
    const todo = uniq.filter((p) => !niqCache[thash(p)]);
    if (todo.length) {
      const resp = await niqqudGateway.fetchNiqqud(todo);
      const gw = Array.isArray(resp.results) ? resp.results : [];
      const need2 = [];
      todo.forEach((p, i) => { const nq = gw[i] || ""; if (NIQ_RE.test(nq)) niqCache[thash(p)] = nq; else need2.push(p); });
      if (need2.length) {
        log("niqqud: " + need2.length + "/" + todo.length + " → Dicta cloud fallback (sidecar empty)");
        let remaining = need2.slice();
        for (let attempt = 0; attempt < 3 && remaining.length; attempt++) {
          if (attempt) await sleep(4000 * attempt);
          try {
            const c = await dictaCloud.nakdan(remaining);
            const cr = (c && c.body && c.body.results) || [];
            const stillEmpty = [];
            remaining.forEach((p, i) => { const nq = cr[i] || ""; if (NIQ_RE.test(nq)) niqCache[thash(p)] = nq; else stillEmpty.push(p); });
            remaining = stillEmpty;
          } catch (e) { log("  dicta-cloud attempt " + (attempt + 1) + " failed: " + e.message); }
        }
        const filled = need2.length - remaining.length;
        log("niqqud: cloud filled " + filled + "/" + need2.length + (remaining.length ? " (" + remaining.length + " still empty — honest, retried next run)" : ""));
      }
      saveCaches();
    }
    const m = {}; for (const p of uniq) m[p] = niqCache[thash(p)] || "";
    return m;
  }

  async function translateWork(body) {
    const segs = segment(body);
    if (!segs.length) return [];
    const plain = segs.map((s) => by.stripNiqqud(s.he));
    const ruMap = await translateCached(segs, plain);
    const needPlain = segs.filter((s) => !by.hasNiqqud(s.he)).map((s) => by.stripNiqqud(s.he));
    const niqMap = await niqqudCached(needPlain);
    return segs.map((s, i) => {
      const srcNiq = by.hasNiqqud(s.he);
      let he_niqqud = "", translit = "", translit_ru = "";
      if (!srcNiq) {
        const nq = niqMap[plain[i]] || "";
        he_niqqud = nq;
        if (nq) { try { translit = transliterateWithProfile(nq, "sbl") || ""; } catch (_) {} try { translit_ru = transliterateWithProfile(nq, "ru-phonetic") || ""; } catch (_) {} }
      }
      return { he: s.he, he_niqqud, translit, translit_ru, ru: ruMap[s.index] || "" };
    });
  }

  // One curated/selected work → bundle text item (shared by producer auto+manifest
  // paths and the runner). `derived` = corpus overrides. Returns {textItem,textKey,
  // corpus,reportRow} or null on corpus R1 error.
  async function translateAndBuild(r, body, derived, plainLen, opts) {
    const o = opts || {};
    const tRows = await translateWork(body);
    const rows = by.buildBundleRows(tRows, { makeRowId: (i) => "r" + i });
    const content_hash = corpusMeta.computeContentHash(rows.map((x) => x.hebrew_plain));
    let corpus;
    try { corpus = by.corpusFromRow(r, { ...derived, content_hash, audio_status: derived.audio_status || "none" }); }
    catch (e) { log("  skip [" + r.ID + "]: " + e.message); return null; }
    const textKey = computeTextKey(body);
    const title = o.title || by.cleanField(r.title) || ("Без названия #" + r.ID);
    const textId = o.textId || ("by-" + r.ID);
    const textItem = by.buildTextItem({ textId, textKey, title, corpus, rows, sourceText: body, createdAt: stamp });
    const vocalizedRatio = rows.length ? rows.filter((x) => by.hasNiqqud(x.hebrew_niqqud)).length / rows.length : 0;
    const reportRow = { id: r.ID, title, author: by.cleanField(r.authors), track: corpus.track, register: corpus.register, era: corpus.era, genre: corpus.genre, orig_language: corpus.orig_language, rows: rows.length, chars: plainLen, vocalized_ratio: Math.round(vocalizedRatio * 100) / 100, review_status: corpus.review_status, audio_status: corpus.audio_status, content_hash: !!corpus.content_hash, ru_filled: rows.filter((x) => x.russian).length };
    return { textItem, textKey, corpus, reportRow };
  }

  return {
    loadOrFetchCsv, fetchTxt, translateWork, translateAndBuild, saveCaches,
    computeTextKey, normalizeSourceText, thash, stats,
    get quotaExhausted() { return quotaExhausted; },
    resetQuota() { quotaExhausted = false; },
  };
}

module.exports = { createIngestCore };
