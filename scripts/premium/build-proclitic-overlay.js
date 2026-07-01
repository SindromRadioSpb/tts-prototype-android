#!/usr/bin/env node
"use strict";
// build-proclitic-overlay.js — BRR Phase-3 · bake-time Dicta per-work proclitic overlay.
//
// The offline FSA proclitic detector (public/js/proclitic-segment.js) is honest but ~95% — NOT
// the ≥99 do-no-harm bar. Dicta's pipe-segmentation ("בַּ|בַּיִת" → prefix ב) is the authoritative
// signal: this producer runs Dicta over each BAKED Ben-Yehuda work and emits a per-work overlay
// { skeleton → { pre, pn, conf } } that ships to the prod volume (like a body/FTS sidecar, NOT
// git). At runtime the detector merges offline-FSA + overlay → the overlay SUPPRESSES offline
// false positives (Dicta says whole word) and CONFIRMS known-stem segmentations (→ confident).
//
// Dicta is reachable directly from Node fetch (no browser/CORS): reader-dicta.js is dual-export,
// so ReaderDicta.analyzeSentence(sentence) works here and returns tokens with `.prefixes`.
//
// Modes:
//   --gold-fixture   run Dicta over the frozen R1 gold's context sentences → emit the FROZEN,
//                    committed overlay fixture the smoke gate reads (hermetic CI, no live Dicta).
//                    Output: docs/research/epic-proclitic-phase2/2026-07-01/overlay-fixture.json
//   --bake           run Dicta over baked works (public/data/benyehuda/works/*.json) → emit
//                    per-work public/data/benyehuda/proclitic/<id>.json (gitignored, volume-only).
//   --status         print bake ledger progress.
// Options: --limit=N  --work=<id>  --sleep=MS(120)  --retries=N(3)  --force
//
// Ledger (resume): .tmp/benyehuda/proclitic-overlay-ledger.json. Dicta cache: .tmp/benyehuda/
// proclitic-overlay-dicta-cache.json (sentence → tokens; polite + resumable).

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const RD = require(path.join(REPO, "public", "js", "reader-dicta.js"));
const PS = require(path.join(REPO, "public", "js", "proclitic-segment.js"));

const WORKS_DIR = path.join(REPO, "public", "data", "benyehuda", "works");
const OUT_DIR = path.join(REPO, "public", "data", "benyehuda", "proclitic");
const GOLD = path.join(REPO, "docs", "research", "epic-proclitic-phase2", "2026-07-01", "gold-frozen.json");
const FIXTURE = path.join(REPO, "docs", "research", "epic-proclitic-phase2", "2026-07-01", "overlay-fixture.json");
const AUDIT_CACHE = path.join(REPO, ".tmp", "benyehuda", "reader-morph-audit-dicta-cache.json");
const TMP = path.join(REPO, ".tmp", "benyehuda");
const DICTA_CACHE = path.join(TMP, "proclitic-overlay-dicta-cache.json");
const LEDGER = path.join(TMP, "proclitic-overlay-ledger.json");

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
const num = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? (parseInt(a.split("=")[1], 10) || d) : d; };
const str = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.split("=").slice(1).join("=") : d; };
const SLEEP = num("sleep", 120), RETRIES = num("retries", 3), LIMIT = num("limit", 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Dicta with retry + on-disk cache (sentence → tokens[]) ──────────────────────
let dictaCache = {};
try { dictaCache = JSON.parse(fs.readFileSync(DICTA_CACHE, "utf8")); } catch (_) { dictaCache = {}; }
let cacheDirty = 0;
const saveCache = () => { try { fs.mkdirSync(TMP, { recursive: true }); fs.writeFileSync(DICTA_CACHE, JSON.stringify(dictaCache)); cacheDirty = 0; } catch (_) {} };

// Rate-limit RESILIENCE (learned the hard way: an aggressive bake got Dicta to 503 everything).
// On sustained failures we do NOT silently degrade hundreds of rows — we OPEN a circuit: pause the
// WHOLE bake and probe Dicta until it recovers, then RETRY the row. A single shared recovery probe
// serves all concurrent lanes (single-flight).
let consecFail = 0, recoveryPromise = null;
async function waitForDictaRecovery() {
  for (let i = 0; ; i++) {
    const wait = Math.min(120000, 15000 * (i + 1));   // 15s,30s,…,120s cap
    process.stdout.write("\n  ⏸ Dicta unavailable (503/degraded) — pausing " + Math.round(wait / 1000) + "s (probe " + (i + 1) + ")…\n");
    await sleep(wait);
    let ok = false;
    try { const r = await RD.analyzeSentence("בית שדה"); ok = !!(r && r.ok && !r.degraded && r.tokens && r.tokens.length); } catch (_) { ok = false; }
    if (ok) { process.stdout.write("  ▶ Dicta recovered — resuming.\n"); return; }
  }
}
function ensureRecovery() { if (!recoveryPromise) recoveryPromise = waitForDictaRecovery().finally(() => { recoveryPromise = null; consecFail = 0; }); return recoveryPromise; }

async function analyze(sentence) {
  const key = String(sentence || "").trim();
  if (!key) return [];
  if (dictaCache[key]) return dictaCache[key];
  while (true) {                                        // loop (not recursion) so a flapping Dicta can't grow the stack
    let res = null;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try { res = await RD.analyzeSentence(key); } catch (e) { res = { ok: false, degraded: true, reason: String(e && e.message) }; }
      if (res && res.ok && !res.degraded && Array.isArray(res.tokens)) break;
      await sleep(Math.min(15000, 800 * Math.pow(2, attempt)));   // exp backoff 0.8→15s
    }
    if (res && res.ok && !res.degraded) {
      consecFail = 0;
      const toks = res.tokens.map((t) => ({ word: t.word, pre: t.prefixes || "", stem: t.stem || "", pos: t.posDicta || "", conf: !!t.confident }));
      dictaCache[key] = toks;
      if (++cacheDirty >= 20) saveCache();
      await sleep(SLEEP);
      return toks;
    }
    // Sustained failure ⇒ rate-limit/outage. After a few consecutive, PAUSE the bake until Dicta
    // recovers, then RETRY this sentence (never leave the row degraded to a transient rate-limit).
    if (++consecFail >= 4) { await ensureRecovery(); continue; }
    return null;                                        // isolated hiccup → degrade just this row
  }
}

// ── overlay entry from a Dicta token (the shared core) ──────────────────────────
// Only proclitic-INITIAL words can carry a proclitic; others need no entry. The entry is the
// authoritative signal the detector consumes: pre = Dicta's explicit proclitic prefix (skeleton,
// "" = whole word), pn = proper-noun, conf = Dicta self-confidence.
function entryOf(tok) {
  const w = PS.skeleton(tok.word);
  if (!w || !PS.PROCLITIC_LETTERS[w[0]]) return null;
  // v = Dicta says the stem is a verb (→ a patach vav is the narrative wayyiqtol marker, not «and»).
  return { w: w, pre: PS.skeleton(tok.pre || ""), pn: tok.pos === "propernoun", v: tok.pos === "verb", conf: !!tok.conf };
}

// ── gold-fixture mode ───────────────────────────────────────────────────────────
// Map each gold surface to a real context sentence (from the audit Dicta cache, which is where
// the gold was sampled), run Dicta on that sentence, align the token, and freeze { id → entry }.
// Seeds not present in any sentence are analyzed standalone. This fixture is the HERMETIC input
// the smoke gate replays — the gate never calls live Dicta (oracle-independence + reproducible).
async function buildGoldFixture() {
  const gold = JSON.parse(fs.readFileSync(GOLD, "utf8")).gold;
  let audit = {};
  try { audit = JSON.parse(fs.readFileSync(AUDIT_CACHE, "utf8")); } catch (_) { audit = {}; }
  // surface-skeleton → a sentence that contains it (prefer the shortest for a cleaner Dicta pass)
  const sentFor = new Map();
  for (const sent of Object.keys(audit)) {
    for (const t of audit[sent]) {
      const w = PS.skeleton(t.word);
      if (!w) continue;
      const cur = sentFor.get(w);
      if (!cur || sent.length < cur.length) sentFor.set(w, sent);
    }
  }
  const fixture = {}; let hit = 0, standalone = 0, degraded = 0;
  for (let i = 0; i < gold.length; i++) {
    const g = gold[i];
    const gw = PS.skeleton(g.surface);
    const sent = sentFor.get(gw) || g.surface;   // fall back to the word itself (seeds)
    const toks = await analyze(sent);
    if (toks == null) { degraded++; continue; }   // Dicta down for this row → leave un-covered (offline fallback)
    let match = null;
    for (const t of toks) if (PS.skeleton(t.word) === gw) { match = t; break; }
    if (!match) { const solo = await analyze(g.surface); if (solo) { match = solo.find((t) => PS.skeleton(t.word) === gw) || null; if (match) standalone++; } }
    else if (sent === g.surface) standalone++; else hit++;
    if (match) { const e = entryOf(match); if (e) fixture[String(g.id)] = { pre: e.pre, pn: e.pn, v: e.v, conf: e.conf }; }
    if (i % 25 === 0) process.stdout.write("\r  gold-fixture " + (i + 1) + "/" + gold.length + " (ctx " + hit + " solo " + standalone + " degraded " + degraded + ")   ");
  }
  process.stdout.write("\n");
  saveCache();
  fs.writeFileSync(FIXTURE, JSON.stringify({
    _meta: {
      purpose: "FROZEN Dicta proclitic overlay for the R1 gold — the hermetic Tier-2 input the smoke gate replays (no live Dicta in CI).",
      model: RD.MODEL_VERSION, source: "build-proclitic-overlay.js --gold-fixture",
      keyed_by: "gold id", entry: "{ pre: Dicta proclitic prefix skeleton (''=whole word), pn: proper-noun, conf: Dicta confidence }",
      rows: gold.length, covered: Object.keys(fixture).length, context_hits: hit, standalone: standalone, degraded: degraded,
    },
    fixture: fixture,
  }, null, 2) + "\n");
  console.log("[proclitic-overlay] gold fixture → " + path.relative(REPO, FIXTURE) + "  (" + Object.keys(fixture).length + "/" + gold.length + " covered; " + degraded + " degraded)");
}

// ── bake mode (per-work volume overlays) ────────────────────────────────────────
function listWorks() {
  let files; try { files = fs.readdirSync(WORKS_DIR).filter((f) => /^[A-Za-z0-9_-]{1,40}\.json$/.test(f)); } catch (_) { files = []; }
  return files.map((f) => f.replace(/\.json$/, "")).sort();
}
function loadLedger() { try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch (_) { return { version: 1, works: {} }; } }
function saveLedger(l) { try { fs.mkdirSync(TMP, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2)); } catch (_) {} }

async function bakeWork(id) {
  let bundle; try { bundle = JSON.parse(fs.readFileSync(path.join(WORKS_DIR, id + ".json"), "utf8")); } catch (_) { return null; }
  const texts = (bundle && bundle.library && bundle.library.texts) || [];
  const overlay = {}; const conflict = new Set();
  let rows = 0, entries = 0, degradedRows = 0;
  for (const tx of texts) {
    for (const r of (tx.rows || [])) {
      const he = String(r.hebrew_plain || "").trim();
      if (!he || !/[א-ת]/.test(he)) continue;
      rows++;
      const toks = await analyze(he);
      if (toks == null) { degradedRows++; continue; }
      for (const t of toks) {
        const e = entryOf(t); if (!e) continue;
        const prev = overlay[e.w];
        if (prev) { if (prev.pre !== e.pre || prev.pn !== e.pn) { conflict.add(e.w); } }
        else { overlay[e.w] = { pre: e.pre, pn: e.pn, v: e.v, conf: e.conf }; entries++; }
      }
    }
  }
  for (const w of conflict) { delete overlay[w]; entries--; }   // ambiguous across occurrences → offline fallback
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, id + ".json"), JSON.stringify({
    _meta: { model: RD.MODEL_VERSION, work: id, rows: rows, entries: entries, conflicts_dropped: conflict.size, degraded_rows: degradedRows },
    overlay: overlay,
  }) + "\n");
  return { rows, entries, conflicts: conflict.size, degradedRows };
}

async function bake() {
  const only = str("work", "");
  const ledger = loadLedger();
  let ids = only ? [only] : listWorks();
  if (!ids.length) { console.error("no baked works under " + path.relative(REPO, WORKS_DIR)); process.exit(1); }
  // --redo-degraded: also re-bake works marked done but whose rows degraded (Dicta rate-limit),
  // so a clean re-run (with the circuit-breaker + gentle rate) fills the gaps they left.
  const redoDeg = has("redo-degraded");
  const pending = ids.filter((id) => {
    if (only || has("force")) return true;
    const e = ledger.works[id];
    if (!(e && e.status === "done")) return true;              // not done → bake
    if (redoDeg && (e.degradedRows || 0) > 0) return true;     // done-but-degraded → re-bake
    return false;
  });
  const todo = LIMIT ? pending.slice(0, LIMIT) : pending;
  // Works are independent (own overlay file) → bake CONC of them concurrently. Each work's Dicta
  // calls are still sequential, so CONC concurrent works ≈ CONC concurrent Dicta calls. A ~752-work
  // full bake is ~5h sequential → ~1h at CONC=5. Ledger keys are per-work (no cross-work race).
  const CONC = Math.max(1, num("concurrency", 2));   // default 2 (concurrency=5 rate-limited Dicta to 503); circuit-breaker backs off further
  console.log("[proclitic-overlay] bake: " + todo.length + " work(s) (of " + ids.length + " total, " + (ids.length - pending.length) + " done) · concurrency=" + CONC);
  let done = 0, idx = 0;
  async function lane() {
    while (true) {
      const i = idx++; if (i >= todo.length) return;
      const id = todo[i];
      let res = null; try { res = await bakeWork(id); } catch (_) { res = null; }
      if (!res) { ledger.works[id] = { status: "failed" }; }
      else { ledger.works[id] = { status: "done", entries: res.entries, rows: res.rows, conflicts: res.conflicts, degradedRows: res.degradedRows }; }
      done++;
      if (done % 5 === 0 || done === todo.length) { saveLedger(ledger); saveCache(); }
      process.stdout.write("\r  baked " + done + "/" + todo.length + "  (last " + id + (res ? " " + res.entries + "e/" + res.degradedRows + "deg" : " FAILED") + ")      ");
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, lane));
  saveLedger(ledger); saveCache();
  process.stdout.write("\n");
  console.log("[proclitic-overlay] bake done: " + done + " work(s) → " + path.relative(REPO, OUT_DIR) + "/<id>.json");
}

// ── attested-words mode (corpus-vocab recall boost) ────────────────────────────
// Aggregate every whole word Dicta saw UN-segmented (prefixes="") across the bake's Dicta cache →
// a shipped skeleton lexicon that widens the detector's residual-stop set beyond Pealim (more
// archaic stems the overlay can CONFIRM → higher confident recall, measured do-no-harm-clean).
// POS-routed: nominal = Dicta noun/adj (safe for the article gate); content = + verbs.
const ATTESTED = path.join(REPO, "public", "data", "inflection", "corpus-attested-words-v1.json.gz");
function buildAttested() {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(DICTA_CACHE, "utf8")); } catch (_) { cache = {}; }
  const nominal = new Set(), content = new Set();
  let toks = 0, whole = 0;
  for (const arr of Object.values(cache)) for (const t of arr) {
    toks++;
    if ((t.pre || "") !== "") continue;                 // only Dicta-whole words (no proclitic stripped)
    const w = PS.skeleton(t.word); if (!w || w.length < 2) continue;
    whole++;
    const pos = t.pos || "";
    if (pos === "noun" || pos === "adjective") { nominal.add(w); content.add(w); }
    else if (pos === "verb") { content.add(w); }         // verb → content (residual-stop) but NOT nominal (no false article)
    // null / function / propernoun POS → skip (func + names are handled by their own gazetteers)
  }
  const out = {
    _meta: {
      purpose: "Corpus-attested whole words (Dicta prefixes='' ⇒ real words) — widens the proclitic detector's residual-stop lexicon for higher CONFIDENT recall (do-no-harm-safe, 100% precision measured).",
      model: RD.MODEL_VERSION, source: "build-proclitic-overlay.js --attested", tokens: toks, whole_words: whole,
      content: content.size, nominal: nominal.size,
    },
    content: Array.from(content).sort(), nominal: Array.from(nominal).sort(),
  };
  fs.mkdirSync(path.dirname(ATTESTED), { recursive: true });
  fs.writeFileSync(ATTESTED, zlib.gzipSync(Buffer.from(JSON.stringify(out), "utf8")));
  console.log("[proclitic-overlay] attested → " + path.relative(REPO, ATTESTED) + "  (" + content.size + " content, " + nominal.size + " nominal, from " + whole + " whole-word tokens)");
}

function status() {
  const ledger = loadLedger();
  const ids = listWorks();
  const works = ledger.works || {};
  const done = Object.keys(works).filter((k) => works[k].status === "done").length;
  const failed = Object.keys(works).filter((k) => works[k].status === "failed").length;
  const entries = Object.keys(works).reduce((a, k) => a + ((works[k].entries) || 0), 0);
  console.log("[proclitic-overlay] status: " + done + "/" + ids.length + " works baked (" + failed + " failed), " + entries + " total overlay entries");
}

(async () => {
  if (has("status")) return status();
  if (has("gold-fixture")) return buildGoldFixture();
  if (has("attested")) return buildAttested();
  if (has("bake")) return bake();
  console.log("usage: build-proclitic-overlay.js [--gold-fixture | --bake | --status] [--limit=N] [--work=<id>] [--sleep=MS] [--force]");
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
