#!/usr/bin/env node
// scripts/premium/scrape-pealim-all.js — RUN LOCALLY (where Pealim is reachable).
//
// Crawls the whole Pealim dictionary (/ru/dict/<id>-/, id ~1..9300), parses each
// paradigm with the SAME parser the app uses (db/premium/providers/pealim.js), and
// packs an offline shipped dataset:
//   public/data/inflection/pealim-infl-<model>.json.gz   (+ .meta.json)
//
// Why: the prod server can't scrape Pealim (container-level block; host can) →
// ship the data so conjugation/declension works for any word offline + on prod.
//
// Resumable: parsed pages are cached on disk by pealimCache.putPage(id, model)
// (model-versioned), so a re-run skips everything already fetched. Polite: reuses
// the gateway's limiter (≤2 concurrent, ≥350ms apart); 429 → exponential backoff.
//
// Usage:
//   node scripts/premium/scrape-pealim-all.js                  # full crawl 1..9400
//   node scripts/premium/scrape-pealim-all.js --start 1 --end 60   # sample
//   node scripts/premium/scrape-pealim-all.js --pack-only      # rebuild gz from cache
//   env: PEALIM_CONCURRENCY=2 PEALIM_MIN_GAP_MS=350
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const pealim = require("../../db/premium/providers/pealim");
const cache = require("../../db/premium/pealimCache");

const MODEL = pealim.MODEL_VERSION;
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "public", "data", "inflection");
const PROGRESS_FILE = path.join(ROOT, "data", "inflection-cache", "scrape-progress.json");

function arg(name, dflt) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }
const START = Number(arg("start", 1));
const END = Number(arg("end", 9400));
const PACK_ONLY = flag("pack-only");

// ── politeness limiter (mirror inflectionGateway) ─────────────────────────
const MAX_CONCURRENT = Number(process.env.PEALIM_CONCURRENCY || 2);
const MIN_GAP_MS = Number(process.env.PEALIM_MIN_GAP_MS || 350);
let _active = 0, _lastStart = 0; const _q = [];
function _runNext() {
  if (_active >= MAX_CONCURRENT || !_q.length) return;
  const now = Date.now(); const wait = Math.max(0, _lastStart + MIN_GAP_MS - now);
  const job = _q.shift(); _active++; _lastStart = now + wait;
  setTimeout(() => { Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { _active--; _runNext(); }); }, wait);
}
function limited(fn) { return new Promise((res, rej) => { _q.push({ fn, resolve: res, reject: rej }); _runNext(); }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build the canonical paradigm envelope — identical shape to pealim.resolveLemma's
// output, so the client renderer + saveLemmaInflection consume it unchanged.
function envelope(parsed, id) {
  return {
    lemma: pealim.stripNiqqud(parsed.lemma_niqqud) || "",
    lemma_niqqud: parsed.lemma_niqqud || "",
    root: parsed.root || null,
    pos: parsed.pos || null,
    binyan: parsed.binyan || null,
    kind: parsed.kind || null,
    meaning: parsed.meaning || null,
    source: "pealim",
    pealim_id: String(id),
    pealim_url: "https://www.pealim.com/ru/dict/" + id + "-/",
    model_version: MODEL,
    gizra_note: parsed.gizra_note || null,
    disambig: "match",
    cells: parsed.cells || {},
    form: parsed.form || null,
  };
}

async function fetchOne(id) {
  let parsed = cache.getPage(id, MODEL);
  if (parsed) return { id, parsed, cached: true };
  let attempt = 0;
  for (;;) {
    try {
      const html = await pealim._get("/ru/dict/" + id + "-/");
      parsed = pealim.parsePealimPage(html);
      if (parsed && (parsed.lemma_niqqud || parsed.cells)) { cache.putPage(id, parsed, MODEL); return { id, parsed, cached: false }; }
      return { id, parsed: null, reason: "unparsable" };
    } catch (e) {
      const st = e && e.status;
      if (st === 404) return { id, parsed: null, reason: "404" };
      if (st === 429) { attempt++; if (attempt > 5) return { id, parsed: null, reason: "429-giveup" }; const back = Math.min(120000, 5000 * Math.pow(2, attempt - 1)); console.warn(`[scrape] 429 at id ${id} → backoff ${back / 1000}s (try ${attempt})`); await sleep(back); continue; }
      attempt++; if (attempt > 2) return { id, parsed: null, reason: "err:" + (e && e.message ? e.message.slice(0, 40) : e) };
      await sleep(800);
    }
  }
}

// ── collision-aware multi-alias index build ───────────────────────────────
function classRank(p) {
  // richer paradigms win over invariants; verbs/nominals with cells beat formless
  const hasCells = p.cells && Object.keys(p.cells).length > 0;
  if (hasCells && (p.pos === "verb")) return 3;
  if (hasCells) return 2;
  if (p.kind === "invariant" || p.form) return 1;
  return 0;
}
function buildIndex(paradigms) {
  const index = {};          // "key binyan" -> paradigm array idx
  const owner = {};          // key -> chosen paradigm (for collision policy)
  const collisions = [];
  function consider(key, idx, p, isExactLemma) {
    const k = key;
    const prev = owner[k];
    if (!prev) { owner[k] = { idx, p, exact: isExactLemma }; index[k] = idx; return; }
    // collision policy: richer class > ; exact-lemma > root-alias ; tie → lower id
    const a = prev, b = { idx, p, exact: isExactLemma };
    let win = a;
    const ra = classRank(a.p), rb = classRank(b.p);
    if (rb > ra) win = b;
    else if (rb === ra) {
      if (b.exact && !a.exact) win = b;
      else if (b.exact === a.exact && Number(b.p.pealim_id) < Number(a.p.pealim_id)) win = b;
    }
    collisions.push({ key: k, kept: win.p.pealim_id, dropped: (win === a ? b : a).p.pealim_id });
    owner[k] = win; index[k] = win.idx;
  }
  paradigms.forEach((p, idx) => {
    const binyan = p.binyan || "";
    const lemmaPlain = p.lemma || pealim.stripNiqqud(p.lemma_niqqud) || "";
    if (lemmaPlain) consider(lemmaPlain + " " + binyan, idx, p, true);
    if (p.root) consider(p.root + " " + binyan, idx, p, false); // verbs/nominals read by ROOT
  });
  return { index, collisions };
}

function pack(paradigms) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const { index, collisions } = buildIndex(paradigms);
  const dataset = { model_version: MODEL, paradigms, index };
  const json = JSON.stringify(dataset);
  const gz = zlib.gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  const base = path.join(OUT_DIR, MODEL); // MODEL already = "pealim-infl-vN"
  fs.writeFileSync(base + ".json.gz", gz);
  const meta = {
    format_version: 1, model_version: MODEL, source: "pealim",
    entry_count: paradigms.length, key_count: Object.keys(index).length,
    collision_count: collisions.length,
    raw_bytes: json.length, gz_bytes: gz.length,
    build_timestamp: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    note: "Offline Pealim inflection paradigms. Multi-alias index (root+lemma per binyan).",
  };
  fs.writeFileSync(base + ".meta.json", JSON.stringify(meta, null, 2));
  if (collisions.length) fs.writeFileSync(base + ".collisions.json", JSON.stringify(collisions.slice(0, 5000), null, 0));
  return meta;
}

function loadCachedParadigms(ids) {
  const out = [];
  for (const id of ids) { const p = cache.getPage(id, MODEL); if (p && (p.lemma_niqqud || p.cells)) out.push(envelope(p, id)); }
  return out;
}

async function main() {
  console.log(`[scrape] model=${MODEL} range=${START}..${END} concurrency=${MAX_CONCURRENT} gap=${MIN_GAP_MS}ms${PACK_ONLY ? " (PACK-ONLY)" : ""}`);
  const ids = []; for (let i = START; i <= END; i++) ids.push(i);

  if (PACK_ONLY) {
    const paradigms = loadCachedParadigms(ids);
    const meta = pack(paradigms);
    console.log("[scrape] PACK-ONLY done:", JSON.stringify(meta));
    return;
  }

  let done = 0, ok = 0, gaps = 0, errs = 0, cachedN = 0;
  const stats = { "404": 0, "429-giveup": 0, unparsable: 0, err: 0 };
  const t0 = Date.now();
  const results = await Promise.all(ids.map((id) => limited(async () => {
    const r = await fetchOne(id);
    done++;
    if (r.parsed) { ok++; if (r.cached) cachedN++; }
    else if (r.reason === "404") { gaps++; stats["404"]++; }
    else { errs++; if (r.reason && r.reason.startsWith("err")) stats.err++; else if (stats[r.reason] != null) stats[r.reason]++; }
    if (done % 200 === 0) console.log(`[scrape] ${done}/${ids.length} ok=${ok}(cached ${cachedN}) gaps=${gaps} errs=${errs} ${Math.round((Date.now() - t0) / 1000)}s`);
    return r;
  })));

  const paradigms = results.filter((r) => r.parsed).map((r) => envelope(r.parsed, r.id));
  const meta = pack(paradigms);
  try { fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true }); fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ at: meta.build_timestamp, range: [START, END], ok, gaps, errs, stats }, null, 2)); } catch (_) {}
  console.log(`\n[scrape] DONE in ${Math.round((Date.now() - t0) / 1000)}s — ok=${ok} gaps=${gaps} errs=${errs} stats=${JSON.stringify(stats)}`);
  console.log(`[scrape] dataset: ${meta.entry_count} paradigms, ${meta.key_count} keys, ${meta.collision_count} collisions, gz=${(meta.gz_bytes / 1048576).toFixed(2)}MB raw=${(meta.raw_bytes / 1048576).toFixed(2)}MB`);
}

main().catch((e) => { console.error("[scrape] fatal:", e); process.exit(1); });
