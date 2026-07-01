#!/usr/bin/env node
"use strict";
// build-context-overlay.js — BRR offline context-disambiguation overlay (strategic task #1).
// Design + owner-approved forks: docs/planning/BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md (§3, §8/§9).
//
// Replays the runtime Tier-3 seam (resolveCore → pickContextReading — the SAME exported functions
// the Room runs, not a port) in Node over the proclitic bake's CACHED Dicta sentence analyses →
// per-work sidecar public/data/benyehuda/context/<id>.json (volume-only, like proclitic/).
//
// The overlay stores FACTS (the Dicta context token: nq/pos/lem), never decisions (R9
// derived≠asserted): at tap time the runtime feeds the baked token through the SAME
// pickContextReading as live Tier-3, so baked and live context can never drift and the
// R11 precedence guards (offline-«exact» is never overwritten — the בקר trap) apply verbatim.
//
// Homograph-SELECTIVE storage + authoritative miss:
//   entry stored ⇔ replayed decision ≠ offline  OR  path-A candidate (offline non-decisive +
//   Dicta content-POS + nq not yet cached — promotable once --enrich fills nq).
//   `sents` lists the hash of EVERY analyzed sentence, which makes a lookup miss meaningful:
//   hash ∈ sents + no entry  → offline reading CONFIRMED at bake time (no live fallback needed);
//   hash ∉ sents             → sentence unknown (text drift / un-baked) → runtime treats as un-baked.
//
// Modes:
//   --budget          selection census across all cached works (NO writes to public/) —
//                     P2 measure-before-code artifact → docs/research/context-overlay/<date>/
//   --bake            emit per-work sidecars + ledger (pure local: cache + dict, NO Dicta calls)
//   --status          ledger / sidecar coverage
//   --enrich          targeted GENTLE Dicta re-fetch of ONLY the sentences that contain path-A
//                     candidates still lacking nq (legacy reduced cache rows). Circuit-breaker
//                     discipline (see feedback_bulk_dicta_bake_ratelimit): concurrency lanes ≤2,
//                     exp backoff, pause-probe-retry (never silent degrade).
//   --enrich-dry      list/count enrich targets without any network.
// Options: --work=<id>  --limit=N  --force  --sleep=MS(300)  --concurrency=N(2)  --retries=N(3)
//
// Cache co-ownership guard: the proclitic bake (build-proclitic-overlay.js) rewrites the shared
// Dicta cache from ITS in-memory copy — two concurrent writers lose updates. --enrich therefore
// REFUSES to start while the cache file has been written in the last 5 minutes.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const NA = require(path.join(REPO, "public", "js", "notes-autogen.js"));
const RD = require(path.join(REPO, "public", "js", "reader-dicta.js"));

const WORKS_DIR = path.join(REPO, "public", "data", "benyehuda", "works");
const OUT_DIR = path.join(REPO, "public", "data", "benyehuda", "context");
const DICT = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");
const TMP = path.join(REPO, ".tmp", "benyehuda");
const DICTA_CACHE = path.join(TMP, "proclitic-overlay-dicta-cache.json");
const LEDGER = path.join(TMP, "context-overlay-ledger.json");
const RESEARCH_DIR = path.join(REPO, "docs", "research", "context-overlay", "2026-07-02");

const VERSION = "context-overlay-v1";
const strip = RM.stripNiqqud;

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
const num = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? (parseInt(a.split("=")[1], 10) || d) : d; };
const str = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.split("=").slice(1).join("=") : d; };
const SLEEP = num("sleep", 300), RETRIES = num("retries", 3), LIMIT = num("limit", 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── sentence key: FNV-1a 32-bit over the normalized skeleton ─────────────────
// Normalization mirrors what survives the bundle→OPFS→reader chain verbatim (hebrew_plain →
// he_plain → row.he, see recon §2.3/§5.2): strip niqqud (plain text is already bare — safety),
// collapse whitespace, trim. Hash keys keep the sidecar small (8 hex chars vs full sentences).
function normSent(s) { return strip(String(s || "")).replace(/\s+/g, " ").trim(); }
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// ── engine (Node twin of reader-morph ensureEngine, same dataset + same builders) ──
function buildEng() {
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT)).toString("utf8"));
  if (!Array.isArray(ds.paradigms) || !ds.index) throw new Error("inflection dataset unavailable/malformed");
  const maps = NA.buildResolverMaps(ds.paradigms);
  const pidMap = new Map();
  for (const p of ds.paradigms) if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
  const lookup = (k, b) => { const ix = ds.index[String(k) + " " + String(b || "")]; return (ix != null && ds.paradigms[ix]) ? ds.paradigms[ix] : null; };
  return { NA, maps, pidMap, lookup, rootIndex: new Map(), procLex: null, _model: ds.model_version || "" };
}

// ── cache access (shared with the proclitic bake; tolerate a mid-write read) ─────
function loadCache() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return JSON.parse(fs.readFileSync(DICTA_CACHE, "utf8")); }
    catch (e) { if (attempt === 2) throw new Error("Dicta cache unreadable (" + e.message + ")"); }
  }
}
const CONTENT_POS = new Set(["noun", "verb", "adjective"]);

// Mirror of ReaderDicta.tokenForSurface over the CACHED token shape {word, stem, ...}.
function tokenForCached(toks, s) {
  for (const t of toks) if (strip(t.word) === s || t.stem === s) return t;
  return null;
}

// ── per-work replay (the intellectual core: same seam, cached facts) ─────────────
// Returns { sents:[hash], ctx:{hash:{skel:entry}}, stats, enrichSents:Set<plain> }.
async function replayWork(id, eng, cache) {
  let bundle; try { bundle = JSON.parse(fs.readFileSync(path.join(WORKS_DIR, id + ".json"), "utf8")); } catch (_) { return null; }
  const texts = (bundle && bundle.library && bundle.library.texts) || [];
  const sents = [];
  const seenSent = new Set();
  const ctx = {};
  const enrichSents = new Set();
  const st = { rows: 0, analyzed: 0, tokens: 0, matched: 0, stored: 0, decGloss: 0, decContext: 0, decSoften: 0, candA: 0, offlineExact: 0 };
  for (const tx of texts) {
    for (const r of (tx.rows || [])) {
      const plain = String(r.hebrew_plain || "").trim();
      if (!plain || !/[א-ת]/.test(plain)) continue;
      st.rows++;
      const toks = cache[plain];
      if (!toks || !toks.length) continue;               // not analyzed → NOT in sents (honest absence)
      const h = fnv1a(normSent(plain));
      if (!seenSent.has(h)) { seenSent.add(h); sents.push(h); }
      st.analyzed++;
      const niq = String(r.hebrew_niqqud || "");
      const wordToks = RM.tokenize(niq || plain).filter((x) => x.isWord);
      const seenSkel = new Set();                        // runtime lookup is first-match per skeleton
      for (const tk of wordToks) {
        const surface = strip(tk.text);
        if (!surface || seenSkel.has(surface)) continue;
        seenSkel.add(surface);
        st.tokens++;
        const dt = tokenForCached(toks, surface);
        if (!dt) continue;
        st.matched++;
        let off; try { off = await RM.resolveCore(eng, surface, tk.text); } catch (_) { continue; }
        if (off.label === "exact" && !off.ambiguous) st.offlineExact++;
        // replay the EXACT runtime seam with the cached token (nq may be absent on legacy rows)
        let cx = null;
        if (dt.nq) { try { cx = await RM.resolveCore(eng, surface, dt.nq); } catch (_) { cx = null; } }
        const dec = RM.pickContextReading(off, cx, { posDicta: dt.pos || null }, surface);
        // Path-A candidate = promotable once nq arrives. Promotion (pickContextReading path A)
        // needs the DICT to resolve the Dicta-niqqud form decisively — a word wholly absent from
        // the offline dict (label unknown, no meaning/pid) can never promote, whatever its niqqud:
        // storing it would only bloat the sidecar and inflate the --enrich worklist.
        const dictReachable = !!(off.ambiguous || off.pealim_id || off.meaning);
        const candidateA = dec.use === "offline" && !dt.nq && off.label !== "exact" && CONTENT_POS.has(dt.pos || "") && dictReachable;
        if (dec.use === "offline" && !candidateA) continue;   // authoritative miss (sents covers it)
        const e = {};
        if (dt.nq) e.nq = dt.nq;
        if (dt.pos) e.pos = dt.pos;
        if (dt.lem && dt.lem !== surface) e.lem = dt.lem;
        if (!e.nq && !e.pos) continue;                        // nothing a runtime merge could use
        (ctx[h] || (ctx[h] = {}))[surface] = e;
        st.stored++;
        if (dec.use === "gloss") st.decGloss++;
        else if (dec.use === "context") st.decContext++;
        else if (dec.use === "soften") st.decSoften++;
        else { st.candA++; enrichSents.add(plain); }
      }
    }
  }
  return { sents, ctx, stats: st, enrichSents };
}

// ── ledger ────────────────────────────────────────────────────────────────────
function loadLedger() { try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch (_) { return { version: 1, works: {} }; } }
function saveLedger(l) { try { fs.mkdirSync(TMP, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2)); } catch (_) {} }
function listWorks() {
  let files; try { files = fs.readdirSync(WORKS_DIR).filter((f) => /^[A-Za-z0-9_-]{1,40}\.json$/.test(f)); } catch (_) { files = []; }
  return files.map((f) => f.replace(/\.json$/, "")).sort();
}

// ── bake / budget (pure local — no network) ──────────────────────────────────────
async function bake({ budgetOnly }) {
  const eng = buildEng();
  const cache = loadCache();
  const only = str("work", "");
  const ledger = loadLedger();
  let ids = only ? [only] : listWorks();
  if (LIMIT) ids = ids.slice(0, LIMIT);
  const agg = { works: 0, withCache: 0, rows: 0, analyzed: 0, tokens: 0, matched: 0, stored: 0, decGloss: 0, decContext: 0, decSoften: 0, candA: 0, offlineExact: 0, bytes: 0, enrich: new Set() };
  let done = 0;
  for (const id of ids) {
    const res = await replayWork(id, eng, cache);
    done++;
    if (!res) continue;
    agg.works++;
    const s = res.stats;
    if (s.analyzed > 0) agg.withCache++;
    for (const k of ["rows", "analyzed", "tokens", "matched", "stored", "decGloss", "decContext", "decSoften", "candA", "offlineExact"]) agg[k] += s[k];
    for (const p of res.enrichSents) agg.enrich.add(p);
    const payload = JSON.stringify({
      _meta: { v: VERSION, model: RD.MODEL_VERSION, dict: eng._model, work: id, sents: res.sents.length, entries: s.stored },
      sents: res.sents, ctx: res.ctx,
    });
    agg.bytes += payload.length;
    if (!budgetOnly) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, id + ".json"), payload + "\n");
      ledger.works[id] = { status: "done", sents: res.sents.length, entries: s.stored, candA: s.candA };
      if (done % 25 === 0) saveLedger(ledger);
    }
    if (done % 25 === 0 || done === ids.length) process.stdout.write("\r  " + (budgetOnly ? "census" : "baked") + " " + done + "/" + ids.length + "  (entries " + agg.stored + ")      ");
  }
  if (!budgetOnly) saveLedger(ledger);
  process.stdout.write("\n");
  const report = {
    _meta: {
      purpose: "P2 measure-before-code budget census — context-overlay selection over the cached Dicta analyses (docs/planning/BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md §4).",
      producer: "build-context-overlay.js --" + (budgetOnly ? "budget" : "bake"), version: VERSION, generated_by_commit: "see git log",
      note: "decisions replayed with the SHIPPED resolver (same exported functions the Room runs); cand_a = path-A candidates promotable once --enrich fills nq on legacy rows",
    },
    works_total: agg.works, works_with_cache: agg.withCache,
    rows: agg.rows, sentences_analyzed: agg.analyzed,
    word_tokens: agg.tokens, dicta_matched: agg.matched, offline_exact: agg.offlineExact,
    entries_stored: agg.stored,
    by_reason: { gloss_B: agg.decGloss, context_A: agg.decContext, soften_C: agg.decSoften, cand_A_pending_nq: agg.candA },
    enrich_sentences_needed: agg.enrich.size,
    size_bytes_total: agg.bytes, size_mb_total: +(agg.bytes / 1048576).toFixed(2),
    size_avg_bytes_per_work: agg.works ? Math.round(agg.bytes / agg.works) : 0,
  };
  console.log("[context-overlay] " + (budgetOnly ? "BUDGET census" : "bake done") + ":");
  console.log(JSON.stringify(report, null, 2));
  if (budgetOnly) {
    fs.mkdirSync(RESEARCH_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESEARCH_DIR, "budget-report.json"), JSON.stringify(report, null, 2) + "\n");
    // enrich worklist is a scratch input for --enrich, not a user artifact → .tmp
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(path.join(TMP, "context-overlay-enrich-worklist.json"), JSON.stringify(Array.from(agg.enrich)) + "\n");
    console.log("[context-overlay] budget report → " + path.relative(REPO, path.join(RESEARCH_DIR, "budget-report.json")));
    console.log("[context-overlay] enrich worklist (" + agg.enrich.size + " sentences) → .tmp/benyehuda/context-overlay-enrich-worklist.json");
  } else {
    console.log("[context-overlay] sidecars → " + path.relative(REPO, OUT_DIR) + "/<id>.json  (" + agg.enrich.size + " sentences still need --enrich for path-A)");
  }
}

// ── enrich (the ONLY networked mode; gentle, circuit-breaker, additive merge) ────
async function enrich(dry) {
  let worklist = [];
  try { worklist = JSON.parse(fs.readFileSync(path.join(TMP, "context-overlay-enrich-worklist.json"), "utf8")); } catch (_) {
    console.error("no enrich worklist — run --budget first"); process.exit(1);
  }
  const cache = loadCache();
  const targets = worklist.filter((s) => { const t = cache[s]; return t && t.length && !t.some((x) => x.nq); });
  console.log("[context-overlay] enrich targets: " + targets.length + "/" + worklist.length + " sentences still lack nq");
  if (dry || !targets.length) return;
  // co-ownership guard: refuse while another bake is actively writing the shared cache
  const age = Date.now() - fs.statSync(DICTA_CACHE).mtimeMs;
  if (age < 5 * 60 * 1000) {
    console.error("⛔ the shared Dicta cache was written " + Math.round(age / 1000) + "s ago — another bake (proclitic) appears to be RUNNING.");
    console.error("   Two writers lose updates (each rewrites the file from its own memory). Re-run --enrich after it finishes.");
    process.exit(1);
  }
  const CONC = Math.max(1, Math.min(2, num("concurrency", 2)));   // hard-capped at 2 (feedback_bulk_dicta_bake_ratelimit)
  let consecFail = 0, recoveryPromise = null, doneN = 0, degraded = 0, dirty = 0;
  const save = () => { fs.writeFileSync(DICTA_CACHE, JSON.stringify(cache)); dirty = 0; };
  async function waitRecovery() {
    for (let i = 0; ; i++) {
      const wait = Math.min(120000, 15000 * (i + 1));
      process.stdout.write("\n  ⏸ Dicta unavailable — pausing " + Math.round(wait / 1000) + "s (probe " + (i + 1) + ")…\n");
      await sleep(wait);
      try { const r = await RD.analyzeSentence("בית שדה"); if (r && r.ok && !r.degraded && r.tokens && r.tokens.length) { process.stdout.write("  ▶ recovered.\n"); return; } } catch (_) {}
    }
  }
  const ensureRecovery = () => { if (!recoveryPromise) recoveryPromise = waitRecovery().finally(() => { recoveryPromise = null; consecFail = 0; }); return recoveryPromise; };
  let idx = 0;
  async function lane() {
    while (true) {
      const i = idx++; if (i >= targets.length) return;
      const sent = targets[i];
      let stored = false;
      while (!stored) {
        let res = null;
        for (let a = 0; a <= RETRIES; a++) {
          try { res = await RD.analyzeSentence(sent); } catch (e) { res = { ok: false, degraded: true }; }
          if (res && res.ok && !res.degraded && Array.isArray(res.tokens)) break;
          await sleep(Math.min(15000, 800 * Math.pow(2, a)));
        }
        if (res && res.ok && !res.degraded) {
          consecFail = 0;
          cache[sent] = res.tokens.map((t) => ({ word: t.word, pre: t.prefixes || "", stem: t.stem || "", pos: t.posDicta || "", conf: !!t.confident, nq: t.niqqud || "", lem: t.lemma || "", lems: t.lemmas || [], bin: t.binyan || null }));
          if (++dirty >= 20) save();
          stored = true;
          await sleep(SLEEP);
        } else if (++consecFail >= 4) { await ensureRecovery(); }
        else { degraded++; stored = true; }                       // isolated hiccup → keep legacy row, re-run later
      }
      doneN++;
      if (doneN % 10 === 0 || doneN === targets.length) process.stdout.write("\r  enriched " + doneN + "/" + targets.length + (degraded ? " (" + degraded + " skipped)" : "") + "      ");
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, lane));
  save();
  process.stdout.write("\n");
  console.log("[context-overlay] enrich done: " + doneN + " sentences (" + degraded + " skipped — re-run --budget && --enrich to retry)");
}

function status() {
  const ledger = loadLedger();
  const ids = Object.keys(ledger.works || {});
  let entries = 0, candA = 0;
  for (const id of ids) { entries += ledger.works[id].entries || 0; candA += ledger.works[id].candA || 0; }
  let sidecars = 0; try { sidecars = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length; } catch (_) {}
  console.log("[context-overlay] ledger: " + ids.length + " work(s), " + entries + " entries, " + candA + " path-A pending; sidecars on disk: " + sidecars);
}

(async () => {
  if (has("budget")) return bake({ budgetOnly: true });
  if (has("bake")) return bake({ budgetOnly: false });
  if (has("enrich-dry")) return enrich(true);
  if (has("enrich")) return enrich(false);
  if (has("status")) return status();
  console.log("usage: node scripts/premium/build-context-overlay.js --budget | --bake | --enrich[-dry] | --status  [--work=<id> --limit=N --sleep=MS --concurrency=N]");
})().catch((e) => { console.error("fatal:", e && e.message || e); process.exit(1); });
