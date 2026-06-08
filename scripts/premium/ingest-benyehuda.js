#!/usr/bin/env node
"use strict";

// ingest-benyehuda.js — BRR-P0-004 Reading-Room corpus producer. RUN LOCALLY.
//
// Turns the Project Ben-Yehuda public-domain corpus into an honest bilingual
// (text-only; audio deferred) bundle v2.1 ZIP that fills corpus + shelves and
// imports straight into the OPFS Reading Room. Reuses the SHIPPED engine
// primitives — segmenter, the google-free / gcp translation providers, the
// niqqud gateway (sidecar → Dicta cloud), the transliterator, and the
// corpusMeta / shelfMeta contracts — but stays DB-FREE (no SQLite, no server,
// no lock contention): translation/niqqud are cached on disk for resume, the
// way scrape-pealim-all.js and build-notes-from-bundle.js do.
//
//   node scripts/premium/ingest-benyehuda.js --auto --limit 20 \
//     --provider google-free --out .tmp/benyehuda-pilot.zip
//
// Providers:  google-free (default, free workhorse) · gemini (GEMINI_API_KEY env,
//             quota-limited quality path) · gcp (Cloud Translate BYOK --gcp-key).
// Niqqud:     source-first — authentic source vocalization is PRESERVED; Dicta
//             only fills unvocalized lines (R1: never overwrite real vowels).
// Honesty:    review_status='machine', audio_status='none' (text-only); footer
//             stripped; translated works need orig_language or the build fails.
// Verify:     curl …/sw.js unaffected (producer/data only — no SW bump).
//
// First-step tripwire (RESOLVED 2026-06-08): the live pseudocatalogue.csv header
// is ID,path,title,authors,translators,author_uris,translator_uris,
// original_language,genre,source_edition (verified upstream). See lib/benyehuda.js.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const JSZip = require("../../public/db/jszip.min.js");
const { segment } = require("../../db/premium/segmenter");
const googleFree = require("../../db/premium/providers/googleFree");
const gcp = require("../../db/premium/providers/gcp");
const niqqudGateway = require("../../db/premium/niqqudGateway");
const dictaCloud = require("../../db/premium/providers/dictaCloud");
const { transliterateWithProfile } = require("../../db/premium/translit");
const corpusMeta = require("../../db/premium/corpusMeta");
const shelfMeta = require("../../db/premium/shelfMeta");
const by = require("./lib/benyehuda");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO, ".tmp");
const BY_DIR = path.join(TMP, "benyehuda");
const TXT_DIR = path.join(BY_DIR, "txt");
const RAW_BASE = "https://raw.githubusercontent.com/projectbenyehuda/public_domain_dump/master";

// ── args ──────────────────────────────────────────────────────────────────────
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const AUTO = flag("auto");
const MANIFEST = arg("manifest", null) || null; // explicit curation manifest (JSON); overrides auto
const CSV_PATH = String(arg("csv", path.join(BY_DIR, "pseudocatalogue.csv")));
const OUT = String(arg("out", path.join(TMP, "benyehuda-pilot.zip")));
const PROVIDER = String(arg("provider", "google-free"));
const LIMIT = Number(arg("limit", 20)) || 20;
const ACCESSIBLE_MAX = Number(arg("accessible", Math.ceil(LIMIT / 2)));
const LITERARY_MAX = Number(arg("literary", Math.floor(LIMIT / 2)));
const MAX_CHARS = Number(arg("max-chars", 8000));
const MIN_CHARS = Number(arg("min-chars", 40));
const MANIFEST_MAX = Number(arg("manifest-max-chars", 30000)); // skip novellas in curated manifest (R6/R8)
const NO_FETCH = flag("no-fetch");
const DRY = flag("dry-run");
const GCP_KEY = String(arg("gcp-key", process.env.GCP_TRANSLATE_API_KEY || ""));
const GEMINI_KEY = String(arg("gemini-key", process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""));
const GEMINI_MODEL = String(arg("gemini-model", "gemini-2.5-flash")); // pinned for predictable cost (owner decision 1)
const STAMP = new Date().toISOString();

const PROVIDERS = new Set(["google-free", "gemini", "gcp"]);
if (!PROVIDERS.has(PROVIDER)) { console.error("[ingest] unsupported provider: " + PROVIDER + " (use google-free|gemini|gcp)"); process.exit(2); }

const log = (...a) => console.log("[ingest]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NIQ_RE = /[֑-ׇ]/; // non-global (safe for .test in loops)
function thash(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }

// computeTextKey — byte-identical to db/libraryRepo.js#computeTextKey (kept inline
// to avoid pulling SQLite into a standalone producer). Stable text_key = re-ingest
// idempotency + dedup against any existing OPFS text. KEEP IN SYNC with libraryRepo.
function normalizeSourceText(s) { return String(s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(); }
function computeTextKey(sourceText) {
  const payload = { v: 1, sourceText: normalizeSourceText(sourceText), ttsProfile: null, tableModelMeta: null };
  return crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

// ── disk caches (resume) ────────────────────────────────────────────────────
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return {}; } }
const transCachePath = path.join(BY_DIR, "trans-cache.json");
const niqCachePath = path.join(BY_DIR, "niqqud-cache.json");
let transCache = loadJson(transCachePath);
let niqCache = loadJson(niqCachePath);
function saveCaches() {
  try { fs.writeFileSync(transCachePath, JSON.stringify(transCache)); } catch (_) {}
  try { fs.writeFileSync(niqCachePath, JSON.stringify(niqCache)); } catch (_) {}
}

// ── HTTP (polite, resumable) ────────────────────────────────────────────────
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
  if (fs.existsSync(CSV_PATH)) { log("csv (cached):", CSV_PATH); return fs.readFileSync(CSV_PATH, "utf8"); }
  if (NO_FETCH) throw new Error("csv not found and --no-fetch set: " + CSV_PATH);
  log("fetching pseudocatalogue.csv from upstream…");
  const txt = await httpGet(RAW_BASE + "/pseudocatalogue.csv");
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, txt);
  log("csv saved:", CSV_PATH, "(" + Math.round(txt.length / 1024) + " KB)");
  return txt;
}

async function fetchTxt(byPath) {
  // byPath like "/p46/m16" → txt/p46/m16.txt
  const rel = String(byPath || "").replace(/^\//, "");
  const cacheFile = path.join(TXT_DIR, rel + ".txt");
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
  if (NO_FETCH) throw new Error("txt not cached and --no-fetch: " + byPath);
  const txt = await httpGet(RAW_BASE + "/txt/" + rel + ".txt");
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, txt);
  return txt;
}

// ── translation providers (DB-free dispatch + disk cache) ───────────────────
let _genaiModel = null;
function geminiModel() {
  if (!GEMINI_KEY) throw new Error("--provider gemini needs GEMINI_API_KEY env (or --gemini-key)");
  if (!_genaiModel) {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    _genaiModel = new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({ model: GEMINI_MODEL });
  }
  return _genaiModel;
}
// One Gemini call per chunk: numbered Hebrew lines → numbered Russian. Returns an
// index→ru map, or null if the model didn't return parseable JSON (caller retries/splits).
const GEMINI_TIMEOUT_MS = Number(arg("gemini-timeout", 90000));
async function _geminiCallOnce(segs) {
  const model = geminiModel();
  const numbered = segs.map((s) => s.index + "\t" + s.he).join("\n");
  const prompt =
    "Translate each numbered Hebrew line into natural literary Russian. Keep the SAME line numbers. " +
    "Return ONLY a JSON array of objects {\"i\": <number>, \"ru\": \"<russian>\"}, one per input line, no markdown.\n\n" + numbered;
  try {
    // The @google/generative-ai SDK has NO request timeout — a hung call would stall the
    // whole bulk indefinitely (observed). Race it against a hard timeout; on timeout/error
    // return null so the caller retries/splits/degrades gracefully.
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error("gemini timeout " + GEMINI_TIMEOUT_MS + "ms")), GEMINI_TIMEOUT_MS)),
    ]);
    const raw = (await result.response).text().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    let arr; try { arr = JSON.parse(raw); } catch (_) { return null; }
    const m = {}; for (const x of (Array.isArray(arr) ? arr : [])) if (x && x.i != null) m[Number(x.i)] = String(x.ru || "");
    return m;
  } catch (e) { log("  gemini call error: " + (e && e.message || e)); return null; }
}
// Robust Gemini translation: chunk long works (a 150+-line single prompt often returns
// truncated/non-JSON), retry once, then split-and-recurse; a chunk that still fails after
// all that degrades to EMPTY ru for those lines (logged) rather than aborting the whole bulk.
const GEMINI_CHUNK = Number(arg("gemini-chunk", 50));
async function geminiTranslateBatch(segs) {
  const out = {};
  for (let i = 0; i < segs.length; i += GEMINI_CHUNK) {
    const chunk = segs.slice(i, i + GEMINI_CHUNK);
    let m = await _geminiCallOnce(chunk);
    if (!m) { await sleep(1500); m = await _geminiCallOnce(chunk); } // transient retry
    if (!m && chunk.length > 1) { // split-and-recurse on persistent non-JSON
      const mid = Math.ceil(chunk.length / 2);
      for (const part of [chunk.slice(0, mid), chunk.slice(mid)]) {
        const r = await geminiTranslateBatch(part);
        for (const x of r.results) if (x.ru) out[x.index] = x.ru;
      }
      continue;
    }
    if (m) { for (const k in m) out[k] = m[k]; }
    else log("  gemini: " + chunk.length + " line(s) untranslated after retry (honest empty ru)");
  }
  return { results: segs.map((s) => ({ index: s.index, ru: out[s.index] || "" })) };
}
async function providerTranslate(segs) {
  if (PROVIDER === "gcp") {
    if (!GCP_KEY) throw new Error("--provider gcp needs --gcp-key (or GCP_TRANSLATE_API_KEY env)");
    return gcp.translateBatchWithApiKey(segs, "ru", GCP_KEY);
  }
  if (PROVIDER === "gemini") return geminiTranslateBatch(segs);
  return googleFree.translateBatch(segs, "ru");
}

// Translate a list of plain segments with per-segment disk cache. Returns map index→ru.
async function translateCached(segs, plain) {
  const out = {};
  const todo = [];
  const provTag = PROVIDER === "gemini" ? "gemini:" + GEMINI_MODEL : PROVIDER;
  segs.forEach((s, i) => {
    const key = thash(provTag + "|ru|" + plain[i]);
    if (Object.prototype.hasOwnProperty.call(transCache, key)) out[s.index] = transCache[key];
    else todo.push({ index: s.index, he: plain[i], _key: key });
  });
  if (todo.length) {
    const resp = await providerTranslate(todo.map((t) => ({ index: t.index, he: t.he })));
    const byIdx = {}; for (const r of (resp.results || [])) byIdx[r.index] = r.ru || "";
    for (const t of todo) { const ru = byIdx[t.index] || ""; out[t.index] = ru; transCache[t._key] = ru; }
    saveCaches();
  }
  return out;
}

// Niqqud for plain segments — local gateway first, accurate Dicta CLOUD fallback for
// anything the local sidecar doesn't vocalize. Per-segment disk cache (only real niqqud
// is cached, so a transient miss is retried). Returns map plain→niqqud.
// Why the cloud fallback: the gateway only auto-falls-back when the sidecar is UNREACHABLE
// (status 0); a reachable-but-empty sidecar (observed: its /nakdan returns {result} not the
// {results} the gateway reads) would otherwise silently yield NO niqqud for plain prose.
// Dicta cloud is the same specialized vocalizer (accurate) — far better than a machine guess.
async function niqqudCached(plainList) {
  const uniq = [...new Set(plainList.filter(Boolean))];
  const todo = uniq.filter((p) => !niqCache[thash(p)]); // only retry items without a cached niqqud
  if (todo.length) {
    const resp = await niqqudGateway.fetchNiqqud(todo);
    const gw = Array.isArray(resp.results) ? resp.results : [];
    const need2 = [];
    todo.forEach((p, i) => {
      const nq = gw[i] || "";
      if (NIQ_RE.test(nq)) niqCache[thash(p)] = nq; else need2.push(p);
    });
    if (need2.length) {
      log("niqqud: " + need2.length + "/" + todo.length + " → Dicta cloud fallback (sidecar empty)");
      // Retry empties with exponential backoff — Dicta's public API throttles under bulk
      // load (observed: 0/N filled once warmed up). Items that stay empty are left honest-
      // empty and cached as such NO (only real niqqud is cached) → retried on the next run.
      let remaining = need2.slice();
      for (let attempt = 0; attempt < 3 && remaining.length; attempt++) {
        if (attempt) await sleep(4000 * attempt); // 0, 4s, 8s backoff
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

// One work → translateTable-shaped rows {he, he_niqqud, translit, translit_ru, ru}
// (DB-free). buildBundleRows applies the source-first niqqud merge afterwards.
async function translateWork(body) {
  const segs = segment(body); // [{index, he}] — paragraph→line→sentence (poetry & prose)
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

// ── selection ───────────────────────────────────────────────────────────────
function selectWorks(rows) {
  // originals only (translated works need a curated orig_language — out of auto pilot)
  const originals = rows.filter((r) => !by.cleanField(r.translators) && by.cleanField(r.path) && by.cleanField(r.ID));
  // prefer recognizable canon (known-author era map) for a better pilot, then the rest
  const known = originals.filter((r) => by.eraForAuthor(r.authors));
  const rest = originals.filter((r) => !by.eraForAuthor(r.authors));
  return [...known, ...rest];
}

// One curated/selected work → bundle text item (shared by auto + manifest paths).
// `derived` = corpus overrides (track/register/era/themes/orig_language/review_status/
// audio_status). Returns { textItem, textKey, corpus, reportRow } or null on corpus error.
async function translateAndBuild(r, body, derived, plainLen) {
  const tRows = await translateWork(body);
  const rows = by.buildBundleRows(tRows, { makeRowId: (i) => "r" + i });
  const content_hash = corpusMeta.computeContentHash(rows.map((x) => x.hebrew_plain));
  let corpus;
  try { corpus = by.corpusFromRow(r, { ...derived, content_hash, audio_status: derived.audio_status || "none" }); }
  catch (e) { log("  skip [" + r.ID + "]: " + e.message); return null; }
  const textKey = computeTextKey(body);
  const title = by.cleanField(r.title) || ("Без названия #" + r.ID);
  const textItem = by.buildTextItem({ textId: "by-" + r.ID, textKey, title, corpus, rows, sourceText: body, createdAt: STAMP });
  const vocalizedRatio = rows.length ? rows.filter((x) => by.hasNiqqud(x.hebrew_niqqud)).length / rows.length : 0;
  const reportRow = { id: r.ID, title, author: by.cleanField(r.authors), track: corpus.track, register: corpus.register, era: corpus.era, genre: corpus.genre, orig_language: corpus.orig_language, rows: rows.length, chars: plainLen, vocalized_ratio: Math.round(vocalizedRatio * 100) / 100, review_status: corpus.review_status, audio_status: corpus.audio_status, content_hash: !!corpus.content_hash, ru_filled: rows.filter((x) => x.russian).length };
  return { textItem, textKey, corpus, reportRow };
}

(async () => {
  fs.mkdirSync(BY_DIR, { recursive: true });
  const csvText = await loadOrFetchCsv();
  const parsed = by.parseCsv(csvText);
  log("csv rows:", parsed.rows.length, "| provider:", PROVIDER, MANIFEST ? "| manifest: " + MANIFEST : "| auto limit " + LIMIT + " (acc " + ACCESSIBLE_MAX + " / lit " + LITERARY_MAX + ")");

  const texts = [];
  const reportRows = [];
  let shelves = [];

  if (MANIFEST) {
    // ── explicit curation (R6/R7): manifest works + manifest shelves ──────────
    const man = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    const byId = new Map(); for (const r of parsed.rows) if (by.cleanField(r.ID)) byId.set(String(r.ID), r);
    const shelfItems = {}; // slug → [text_key]
    for (const w of (man.works || [])) {
      const r = byId.get(String(w.byehuda_id));
      if (!r) { console.error("[ingest] manifest byehuda_id not in CSV: " + w.byehuda_id); process.exit(5); }
      let raw; try { raw = await fetchTxt(r.path); } catch (e) { console.error("[ingest] txt fetch failed for " + w.byehuda_id + ": " + e.message); process.exit(6); }
      const { body } = by.stripFooter(raw);
      if (!body) { console.error("[ingest] empty body for " + w.byehuda_id); process.exit(6); }
      const plainLen = by.stripNiqqud(body).length;
      const lineCount = body.split("\n").filter((l) => l.trim()).length;
      // Guard: a novella-length work bloats the shelf bundle, costs ~tokens, and a
      // 500+-row bilingual table is unwieldy (R6/R8). Skip-with-warning (curated set
      // should be digestible works; long-reads belong in a future track / BYOK-on-open).
      if (plainLen > MANIFEST_MAX) { log("  ⚠ skip [" + w.byehuda_id + "] " + (by.cleanField(r.title) || "?") + ": " + plainLen + " ch > " + MANIFEST_MAX + " (novella — excluded from shelf bundle)"); continue; }
      log("→ [" + r.ID + "] " + (by.cleanField(r.title) || "?") + " — " + (by.cleanField(r.authors) || "?") + " (" + w.track + "/" + w.register + ", " + lineCount + " lines, " + plainLen + " ch)");
      const derived = { track: w.track, register: w.register, era: w.era, themes: w.themes || [], orig_language: w.orig_language || undefined, review_status: w.review_status || undefined, audio_status: "none" };
      const built = await translateAndBuild(r, body, derived, plainLen);
      if (!built) { console.error("[ingest] curated work " + w.byehuda_id + " failed corpus build (R1) — not silently dropped"); process.exit(3); }
      texts.push(built.textItem); reportRows.push(built.reportRow);
      const slug = w.shelf || ("by-" + built.corpus.track);
      (shelfItems[slug] = shelfItems[slug] || []).push(built.textKey);
    }
    shelves = (man.shelves || []).map((s) => shelfMeta.buildShelf({ slug: s.slug, title: s.title, track: s.track, era: s.era, genre: s.genre, editorial_intro: s.editorial_intro, items: shelfItems[s.slug] || [], order: s.order }));
    log("manifest:", texts.length, "works,", shelves.length, "shelves");
  } else if (AUTO) {
    // ── heuristic auto-select (originals; known-canon first) ──────────────────
    const candidates = selectWorks(parsed.rows);
    log("candidates (originals):", candidates.length, "| known-canon first:", candidates.filter((r) => by.eraForAuthor(r.authors)).length);
    const shelfItems = { accessible: [], literary: [] };
    let accN = 0, litN = 0, scanned = 0;
    for (const r of candidates) {
      if (accN >= ACCESSIBLE_MAX && litN >= LITERARY_MAX) break;
      if (texts.length >= LIMIT) break;
      scanned++;
      let raw; try { raw = await fetchTxt(r.path); } catch (e) { continue; }
      const { body } = by.stripFooter(raw);
      if (!body) continue;
      const plainLen = by.stripNiqqud(body).length;
      if (plainLen < MIN_CHARS || plainLen > MAX_CHARS) continue;
      const lineCount = body.split("\n").filter((l) => l.trim()).length;
      const cls = by.classifyWork({ genre: r.genre, author: r.authors, shape: { lineCount, charCount: plainLen } });
      if (cls.track === "accessible" && accN >= ACCESSIBLE_MAX) continue;
      if (cls.track === "literary" && litN >= LITERARY_MAX) continue;
      log("→ [" + r.ID + "] " + (by.cleanField(r.title) || "?") + " — " + (by.cleanField(r.authors) || "?") + " (" + cls.track + "/" + cls.register + ", " + lineCount + " lines, " + plainLen + " ch)");
      const built = await translateAndBuild(r, body, { ...cls, audio_status: "none" }, plainLen);
      if (!built) continue;
      texts.push(built.textItem); reportRows.push(built.reportRow);
      shelfItems[built.corpus.track].push(built.textKey);
      if (built.corpus.track === "accessible") accN++; else litN++;
    }
    log("selected:", texts.length, "(accessible " + accN + " / literary " + litN + ") from", scanned, "scanned");
    if (shelfItems.accessible.length) shelves.push(shelfMeta.buildShelf({ slug: "by-accessible", title: "Доступная полка", track: "accessible", editorial_intro: "Короткие стихи и простые тексты — мягкий вход в чтение на иврите. (Автоподборка пилота; кураторский маршрут — на этапе bulk.)", items: shelfItems.accessible, order: 0 }));
    if (shelfItems.literary.length) shelves.push(shelfMeta.buildShelf({ slug: "by-literary", title: "Литературная полка", track: "literary", editorial_intro: "Канонические тексты для уверенного чтения с морфо-опорой. (Автоподборка пилота; кураторский маршрут — на этапе bulk.)", items: shelfItems.literary, order: 1 }));
  } else {
    console.error("[ingest] pass --manifest <path> (curated) or --auto (heuristic)"); process.exit(2);
  }

  if (!texts.length) { console.error("[ingest] no works selected — check manifest/--limit/--max-chars or fetch"); process.exit(4); }

  const lib = by.buildLibraryJson({ texts, shelves });

  // ── R1 honesty gate ──────────────────────────────────────────────────────
  const gate = by.validateLibrary(lib);
  log("R1 gate:", JSON.stringify(gate.classes), "| errors:", gate.errors.length, "| warnings:", gate.warnings.length);
  for (const w of gate.warnings) log("  warn [" + (w.text_id || w.slug || "?") + "]: " + w.warning);
  const accCount = texts.filter((t) => (corpusMeta.getCorpus(t) || {}).track === "accessible").length;
  const report = { generated_at: STAMP, provider: PROVIDER, mode: MANIFEST ? "manifest" : "auto", selected: texts.length, accessible: accCount, literary: texts.length - accCount, classes: gate.classes, errors: gate.errors, warnings: gate.warnings, works: reportRows };
  const reportPath = path.join(TMP, "benyehuda-ingest-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log("QA report →", reportPath);
  if (!gate.ok) {
    console.error("[ingest] R1 honesty gate FAILED:");
    for (const e of gate.errors) console.error("  " + (e.text_id || e.slug) + ": " + (e.errors || []).join("; "));
    process.exit(3);
  }

  if (DRY) { log("dry-run — no ZIP written"); return; }

  const zip = new JSZip();
  const rowCount = texts.reduce((a, t) => a + t.rows.length, 0);
  zip.file("manifest.json", JSON.stringify(by.buildManifest({ textCount: texts.length, rowCount, noteCount: 0, createdAt: STAMP }), null, 2));
  zip.file("library/library.json", JSON.stringify(lib));
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  log("bundle →", OUT, "(" + Math.round(buf.length / 1024) + " KB, " + texts.length + " texts, " + rowCount + " rows, " + shelves.length + " shelves)");
  log("next: import into the OPFS Reading Room and open @380px RTL (both tracks).");
})().catch((e) => { console.error("[ingest] fatal:", e); process.exit(1); });
