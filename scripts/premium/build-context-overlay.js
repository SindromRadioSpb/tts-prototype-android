#!/usr/bin/env node
"use strict";
// build-context-overlay.js — BRR offline context-disambiguation overlay (strategic task #1).
// Design + approved forks + ADVERSARIAL-CRITIQUE resolutions: docs/planning/
// BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md (§3, §8/§9, §10 — B1..B4 + MAJOR fixes live here).
//
// Replays the runtime Tier-3 seam (resolveCore → pickContextReading — the SAME exported functions
// the Room runs, not a port) in Node over the proclitic bake's CACHED Dicta sentence analyses →
// per-work sidecar public/data/benyehuda/context/<id>.json (volume-only, like proclitic/).
//
// The overlay stores FACTS (the Dicta context token: nq/pos + conf-bit + Dicta-stem when
// segmented), never decisions (R9 derived≠asserted): at tap time the runtime feeds the baked
// token through the SAME pickContextReading + contextPromotionGuard as live Tier-3, so baked and
// live context can never drift and the R11 precedence guards (offline-«exact» is never overwritten
// by path A — the בקר trap; promotions must match Dicta's own segmentation — the בעלות trap) apply
// verbatim.
//
// KEY DISCIPLINE (§10 B1): words come from alignSurfaceNiqqud(hebrew_plain, hebrew_niqqud) —
// surface = the PLAIN word (what the cache tokenized AND what the he-cell tap passes as
// data-surface), niqqud = its aligned vocalization ("" when the row has none — the runtime-exact
// baseline). Entries are keyed by the plain skeleton, PLUS an alias under the vocalized skeleton
// when ktiv male/chaser makes them differ (niqqud-column taps).
//
// MISS SEMANTICS (§10 B2): `sents` lists the hash of every sentence whose word tokens were ALL
// fully evaluated. hash ∈ sents + no entry → the bake found no applicable improvement (offline
// stands; no live fallback needed). hash ∉ sents → unknown (drift / un-analyzed / partially
// evaluated) → runtime treats as un-baked. Entries remain usable either way.
//
// Modes:
//   --budget          selection census across all cached works (NO writes to public/) —
//                     P2 measure-before-code artifact → docs/research/context-overlay/<date>/
//   --bake            emit per-work sidecars + ledger (pure local: cache + dict, NO Dicta calls)
//   --status          ledger / sidecar coverage (+ stale-sidecar warning)
//   --enrich          targeted GENTLE Dicta re-fetch of ONLY the sentences that contain path-A
//                     candidates never fetched rich (circuit-breaker; concurrency hard-capped 2 —
//                     feedback_bulk_dicta_bake_ratelimit). Writes rows with g:"e" generation
//                     stamps; merge-on-write + lockfile against the co-owning proclitic bake.
//   --enrich-dry      list/count enrich targets without any network.
// Options: --work=<id>  --limit=N  --force  --sleep=MS(300)  --concurrency=N(≤2)  --retries=N(3)
//
// ROLLOUT INVARIANT (§10, R11-F2): a sidecar ships to the volume ONLY when entriesPendingNq === 0
// (bake → enrich → re-bake → push); until then the work stays un-baked at runtime and the live
// Tier-3 path is preserved — no deploy-order regression for consented users.

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
const LOCK = path.join(TMP, "dicta-cache.lock");
const LEDGER = path.join(TMP, "context-overlay-ledger.json");
const WORKLIST = path.join(TMP, "context-overlay-enrich-worklist.json");
const SNAP_DIR = path.join(REPO, "Архив", "dicta-cache-snapshots");
const RESEARCH_DIR = path.join(REPO, "docs", "research", "context-overlay", "2026-07-02");

const VERSION = "context-overlay-v2";        // v2 = post-critique format (recon §10)
const strip = RM.stripNiqqud;

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
const num = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? (parseInt(a.split("=")[1], 10) || d) : d; };
const str = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.split("=").slice(1).join("=") : d; };
const SLEEP = num("sleep", 300), RETRIES = num("retries", 3), LIMIT = num("limit", 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const epochDay = () => Math.floor(Date.now() / 86400000);

// ── shared-file hygiene: atomic write + pid lockfile (both cache writers; §10 R11-F4) ──
function atomicWrite(file, data) {
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function readLock() { try { return JSON.parse(fs.readFileSync(LOCK, "utf8")); } catch (_) { return null; } }
function acquireLock(tag) {
  const cur = readLock();
  if (cur && cur.pid !== process.pid && Date.now() - cur.ts < 10 * 60 * 1000)
    throw new Error("Dicta cache is locked by pid " + cur.pid + " (" + cur.tag + ", heartbeat " + Math.round((Date.now() - cur.ts) / 1000) + "s ago) — refusing to co-write (lost-update hazard).");
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tag: tag, ts: Date.now() }));
}
function heartbeat(tag) { try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tag: tag, ts: Date.now() })); } catch (_) {} }
function releaseLock() { const cur = readLock(); if (cur && cur.pid === process.pid) { try { fs.unlinkSync(LOCK); } catch (_) {} } }

// ── engine (Node twin of reader-morph ensureEngine, same dataset + same builders) ──
function buildEng() {
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT)).toString("utf8"));
  if (!Array.isArray(ds.paradigms) || !ds.index) throw new Error("inflection dataset unavailable/malformed");
  if (!ds.model_version) console.warn("⚠ inflection dataset has no model_version — sidecar dict provenance will be empty");
  const maps = NA.buildResolverMaps(ds.paradigms);
  const pidMap = new Map();
  for (const p of ds.paradigms) if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
  const lookup = (k, b) => { const ix = ds.index[String(k) + " " + String(b || "")]; return (ix != null && ds.paradigms[ix]) ? ds.paradigms[ix] : null; };
  return { NA, maps, pidMap, lookup, rootIndex: new Map(), procLex: null, _model: ds.model_version || "" };
}

// ── cache access (shared with the proclitic bake; tolerate a mid-write read) ─────
function loadCache() {
  for (let attempt = 0; ; attempt++) {
    try { return JSON.parse(fs.readFileSync(DICTA_CACHE, "utf8")); }
    catch (e) { if (attempt === 2) throw new Error("Dicta cache unreadable (" + e.message + ")"); }
  }
}
const CONTENT_POS = new Set(["noun", "verb", "adjective"]);
// legacy row = token never fetched by a rich-generation writer (nq key absent). nq:"" WITH a
// generation stamp (or any nq key) = Dicta answered (possibly empty) — NOT re-fetchable (§10 R9#8).
const isLegacyTok = (t) => t.nq === undefined;
const genOf = (t) => (t.g === "e" ? "enriched" : t.nq !== undefined ? "rich" : "legacy");

// TWO-PASS token match (lock-step mirror of ReaderDicta.tokenForSurface; §10 R1#4).
function tokenForCached(toks, s) {
  for (const t of toks) if (strip(t.word) === s) return t;
  for (const t of toks) if (t.stem === s) return t;
  return null;
}

// ── per-work replay (the intellectual core: same seam, cached facts) ─────────────
async function replayWork(id, eng, cache, sentTextGlobal) {
  let bundle; try { bundle = JSON.parse(fs.readFileSync(path.join(WORKS_DIR, id + ".json"), "utf8")); } catch (_) { return null; }
  const texts = (bundle && bundle.library && bundle.library.texts) || [];
  const sents = [];
  const ctx = {};
  const collided = new Set();
  const enrichSents = new Set();
  const st = { rows: 0, analyzed: 0, tokens: 0, matched: 0, unmatched: 0, stored: 0, alias: 0,
    decGloss: 0, decContext: 0, decSoften: 0, candA: 0, offlineExact: 0, guardRejected: 0,
    collisions: 0, partialSents: 0, gen: { legacy: 0, rich: 0, enriched: 0 } };
  const seenSentHash = new Set();
  for (const tx of texts) {
    for (const r of (tx.rows || [])) {
      const plain = String(r.hebrew_plain || "").trim();
      if (!plain || !/[א-ת]/.test(plain)) continue;
      st.rows++;
      const toks = cache[plain];
      if (!toks || !toks.length) continue;               // not analyzed → NOT in sents (honest absence)
      st.analyzed++;
      const norm = RM.normSent(plain);
      const h = RM.fnv1a(norm);
      // §10 collision detection: a 32-bit clash between two DIFFERENT sentences would transplant
      // facts across sentences and mint false authoritative misses — drop BOTH hashes, count it.
      const prev = sentTextGlobal.get(h);
      if (prev !== undefined && prev !== norm) { collided.add(h); st.collisions++; continue; }
      sentTextGlobal.set(h, norm);
      if (seenSentHash.has(h)) continue;                 // duplicate row of the same sentence
      seenSentHash.add(h);
      // §10 B1: pairs from the SAME aligner the Room renders with — surface = plain word
      // (cache tokenization + he-cell data-surface), niqqud = aligned vocalization or "".
      const pairs = RM.alignSurfaceNiqqud(plain, String(r.hebrew_niqqud || ""));
      let fullyEvaluated = true;
      const seenSkel = new Set();                        // runtime lookup is first-match per skeleton
      for (const pair of pairs) {
        const s = strip(pair.surface);
        if (!s || seenSkel.has(s)) continue;
        seenSkel.add(s);
        st.tokens++;
        const dt = tokenForCached(toks, s);
        if (!dt) { st.unmatched++; fullyEvaluated = false; continue; }   // §10 B2: unevaluated → sentence can't claim authority
        st.matched++;
        st.gen[genOf(dt)]++;
        let off;
        try { off = await RM.resolveCore(eng, s, pair.niqqud || ""); }   // runtime-exact baseline (R10#4)
        catch (_) { fullyEvaluated = false; continue; }
        if (off.label === "exact" && !off.ambiguous) st.offlineExact++;
        // replay the EXACT runtime seam with the cached token (nq may be absent on legacy rows)
        let cx = null;
        if (dt.nq) { try { cx = await RM.resolveCore(eng, s, dt.nq); } catch (_) { cx = null; } }
        let dec = RM.pickContextReading(off, cx, { posDicta: dt.pos || null }, s);
        // §10 B3: segmentation-consistency guard (identical call at runtime — lock-step)
        if (dec.use === "context" && !RM.contextPromotionGuard(eng, s, dt.stem, cx)) { st.guardRejected++; dec = { use: "offline" }; }
        // path-A candidate: promotable once nq arrives. NO dict-reachability filter (R10#3:
        // form-first matches vocalized CELLS — a bare-skeleton test forfeited 14.6% of real
        // promotions). Answered-empty rich rows are NOT candidates (isLegacyTok).
        const candidateA = dec.use === "offline" && isLegacyTok(dt) && off.label !== "exact" && CONTENT_POS.has(dt.pos || "");
        if (dec.use === "offline" && !candidateA) continue;   // no applicable improvement (sents covers it)
        const e = {};
        if (dt.nq) e.nq = dt.nq;
        if (dt.pos) e.pos = dt.pos;
        if (dt.conf) e.c = 1;                                            // Dicta self-confidence (R1#3; render policy → P3 measurement)
        const dtWordSkel = strip(dt.word);
        if (dt.stem && dt.stem !== dtWordSkel) e.st = dt.stem;           // Dicta segmentation → runtime guard input (B3)
        if (!e.nq && !e.pos) continue;                                   // nothing a runtime merge could use
        const bucket = ctx[h] || (ctx[h] = {});
        bucket[s] = e;
        // ktiv male/chaser alias: the niqqud-column tap key (vocalized skeleton) when it differs
        const vs = strip(pair.niqqud || "");
        if (vs && vs !== s && !bucket[vs]) { bucket[vs] = e; st.alias++; }
        st.stored++;
        if (dec.use === "gloss") st.decGloss++;
        else if (dec.use === "context") st.decContext++;
        else if (dec.use === "soften") st.decSoften++;
        else { st.candA++; enrichSents.add(plain); }
      }
      if (fullyEvaluated) sents.push(h);
      else st.partialSents++;
    }
  }
  // drop collided hashes entirely (both sides fall back to the honest un-baked path)
  for (const h of collided) { delete ctx[h]; }
  const sentsClean = sents.filter((h) => !collided.has(h));
  return { sents: sentsClean, ctx, stats: st, enrichSents };
}

// ── ledger ────────────────────────────────────────────────────────────────────
function loadLedger() { try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch (_) { return { version: 2, works: {} }; } }
function saveLedger(l) { try { fs.mkdirSync(TMP, { recursive: true }); atomicWrite(LEDGER, JSON.stringify(l, null, 2)); } catch (_) {} }
function listWorks() {
  let files; try { files = fs.readdirSync(WORKS_DIR).filter((f) => /^[A-Za-z0-9_-]{1,40}\.json$/.test(f)); } catch (_) { files = []; }
  return files.map((f) => f.replace(/\.json$/, "")).sort();
}

// ── bake / budget (pure local — no network) ──────────────────────────────────────
async function bake({ budgetOnly }) {
  const eng = buildEng();
  const cache = loadCache();
  const cacheMtime = fs.statSync(DICTA_CACHE).mtimeMs;
  const only = str("work", "");
  const ledger = loadLedger();
  let ids = only ? [only] : listWorks();
  if (!budgetOnly && !only && !has("force")) ids = ids.filter((id) => !(ledger.works[id] && ledger.works[id].status === "done" && ledger.works[id].cacheMtimeAtBake === cacheMtime));
  if (LIMIT) ids = ids.slice(0, LIMIT);
  const sentTextGlobal = new Map();                      // collision detection across the whole run
  const agg = { works: 0, withCache: 0, rows: 0, analyzed: 0, tokens: 0, matched: 0, unmatched: 0,
    stored: 0, alias: 0, decGloss: 0, decContext: 0, decSoften: 0, candA: 0, offlineExact: 0,
    guardRejected: 0, collisions: 0, partialSents: 0, sentsAuthoritative: 0, bytes: 0,
    gen: { legacy: 0, rich: 0, enriched: 0 }, enrich: new Set() };
  const madeISO = new Date().toISOString();
  let done = 0;
  for (const id of ids) {
    const res = await replayWork(id, eng, cache, sentTextGlobal);
    done++;
    if (!res) { if (!budgetOnly) ledger.works[id] = { status: "failed", bakedAt: madeISO }; continue; }
    agg.works++;
    const s = res.stats;
    if (s.analyzed > 0) agg.withCache++;
    for (const k of ["rows", "analyzed", "tokens", "matched", "unmatched", "stored", "alias", "decGloss", "decContext", "decSoften", "candA", "offlineExact", "guardRejected", "collisions", "partialSents"]) agg[k] += s[k];
    for (const g of ["legacy", "rich", "enriched"]) agg.gen[g] += s.gen[g];
    agg.sentsAuthoritative += res.sents.length;
    for (const p of res.enrichSents) agg.enrich.add(p);
    const payload = JSON.stringify({
      _meta: {
        v: VERSION, work: id, made: madeISO,
        parser: RD.MODEL_VERSION,                        // client parser tag — NOT the Dicta backend model (honest name; §10 R1#7/R9#2)
        dict: eng._model, resolver: RM.RESOLVER_REV,
        sents: res.sents.length, entries: s.stored, entriesPendingNq: s.candA,
        fetched: s.gen,                                  // generation census of the facts inside
      },
      sents: res.sents, ctx: res.ctx,
    });
    agg.bytes += payload.length;
    if (!budgetOnly) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      atomicWrite(path.join(OUT_DIR, id + ".json"), payload + "\n");
      ledger.works[id] = { status: "done", producer: VERSION, resolver: RM.RESOLVER_REV, bakedAt: madeISO,
        cacheMtimeAtBake: cacheMtime, sents: res.sents.length, entries: s.stored, entriesPendingNq: s.candA };
      if (done % 25 === 0) saveLedger(ledger);
    }
    if (done % 25 === 0 || done === ids.length) process.stdout.write("\r  " + (budgetOnly ? "census" : "baked") + " " + done + "/" + ids.length + "  (entries " + agg.stored + ")      ");
  }
  if (!budgetOnly) saveLedger(ledger);
  process.stdout.write("\n");
  const report = {
    _meta: {
      purpose: "P2 measure-before-code budget census — context-overlay selection over the cached Dicta analyses (recon §4/§10).",
      producer: "build-context-overlay.js --" + (budgetOnly ? "budget" : "bake"), version: VERSION,
      resolver: RM.RESOLVER_REV, made: madeISO,
      note: "decisions replayed with the SHIPPED resolver; cand_A_pending_nq = promotable once --enrich fills nq (never-fetched legacy rows only); entries keyed by PLAIN skeleton + ktiv alias",
    },
    works_total: agg.works, works_with_cache: agg.withCache,
    rows: agg.rows, sentences_analyzed: agg.analyzed,
    sentences_authoritative: agg.sentsAuthoritative, sentences_partial: agg.partialSents, hash_collisions_dropped: agg.collisions,
    word_tokens: agg.tokens, dicta_matched: agg.matched, dicta_unmatched: agg.unmatched, offline_exact: agg.offlineExact,
    entries_stored: agg.stored, alias_keys: agg.alias, promotion_guard_rejected: agg.guardRejected,
    by_reason: { gloss_B: agg.decGloss, context_A: agg.decContext, soften_C: agg.decSoften, cand_A_pending_nq: agg.candA },
    facts_generation: agg.gen,
    enrich_sentences_needed: agg.enrich.size,
    size_bytes_total: agg.bytes, size_mb_total: +(agg.bytes / 1048576).toFixed(2),
    size_avg_bytes_per_work: agg.works ? Math.round(agg.bytes / agg.works) : 0,
  };
  console.log("[context-overlay] " + (budgetOnly ? "BUDGET census" : "bake done") + ":");
  console.log(JSON.stringify(report, null, 2));
  // enrich worklist refreshed by BOTH modes (§10 R11-F10: a bake after new cache data must not
  // leave --enrich running against a stale list)
  fs.mkdirSync(TMP, { recursive: true });
  atomicWrite(WORKLIST, JSON.stringify(Array.from(agg.enrich)) + "\n");
  if (budgetOnly) {
    fs.mkdirSync(RESEARCH_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESEARCH_DIR, "budget-report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("[context-overlay] budget report → " + path.relative(REPO, path.join(RESEARCH_DIR, "budget-report.json")));
  } else {
    console.log("[context-overlay] sidecars → " + path.relative(REPO, OUT_DIR) + "/<id>.json");
    console.log("[context-overlay] ROLLOUT INVARIANT: push ONLY works with entriesPendingNq===0 (bake → enrich → re-bake → push).");
  }
  console.log("[context-overlay] enrich worklist (" + agg.enrich.size + " sentences) → " + path.relative(REPO, WORKLIST));
}

// ── enrich (the ONLY networked mode; gentle, circuit-breaker, additive merge) ────
async function enrich(dry) {
  let worklist = [];
  try { worklist = JSON.parse(fs.readFileSync(WORKLIST, "utf8")); } catch (_) {
    console.error("no enrich worklist — run --budget or --bake first"); process.exit(1);
  }
  const cache = loadCache();
  // per-token target test (§10 R11-F10: a MIXED row — some tokens rich, a candidate still
  // legacy — must still be re-fetched; the whole row is re-analyzed in one call anyway)
  const targets = worklist.filter((s) => { const t = cache[s]; return t && t.length && t.some(isLegacyTok); });
  console.log("[context-overlay] enrich targets: " + targets.length + "/" + worklist.length + " sentences still have never-fetched tokens");
  if (dry || !targets.length) return;
  acquireLock("context-enrich");
  // belt+braces vs an OLD-code proclitic bake (no lock support): recent external write → refuse
  const age = Date.now() - fs.statSync(DICTA_CACHE).mtimeMs;
  if (age < 5 * 60 * 1000) {
    releaseLock();
    console.error("⛔ the shared Dicta cache was written " + Math.round(age / 1000) + "s ago by another process — refusing to co-write. Re-run after the other bake finishes.");
    process.exit(1);
  }
  const CONC = Math.max(1, Math.min(2, num("concurrency", 2)));   // hard-capped at 2 (feedback_bulk_dicta_bake_ratelimit)
  let consecFail = 0, recoveryPromise = null, doneN = 0, degraded = 0, dirty = 0;
  // merge-on-write: prefer rows that carry nq (ours or theirs) — never revert rich data (§10 R11-F4)
  const mergedSave = () => {
    let disk = {}; try { disk = JSON.parse(fs.readFileSync(DICTA_CACHE, "utf8")); } catch (_) { disk = {}; }
    for (const k of Object.keys(disk)) {
      if (!cache[k]) cache[k] = disk[k];
      else if (!cache[k].some((t) => t.nq !== undefined) && disk[k].some((t) => t.nq !== undefined)) cache[k] = disk[k];
    }
    atomicWrite(DICTA_CACHE, JSON.stringify(cache));
    heartbeat("context-enrich");
    dirty = 0;
  };
  async function waitRecovery() {
    for (let i = 0; ; i++) {
      const wait = Math.min(120000, 15000 * (i + 1));
      process.stdout.write("\n  ⏸ Dicta unavailable — pausing " + Math.round(wait / 1000) + "s (probe " + (i + 1) + ")…\n");
      heartbeat("context-enrich");
      await sleep(wait);
      try { const r = await RD.analyzeSentence("בית שדה"); if (r && r.ok && !r.degraded && r.tokens && r.tokens.length) { process.stdout.write("  ▶ recovered.\n"); return; } } catch (_) {}
    }
  }
  const ensureRecovery = () => { if (!recoveryPromise) recoveryPromise = waitRecovery().finally(() => { recoveryPromise = null; consecFail = 0; }); return recoveryPromise; };
  let idx = 0;
  const day = epochDay();
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
          cache[sent] = res.tokens.map((t) => ({ word: t.word, pre: t.prefixes || "", stem: t.stem || "", pos: t.posDicta || "", conf: !!t.confident, nq: t.niqqud || "", lem: t.lemma || "", lems: t.lemmas || [], bin: t.binyan || null, g: "e", d: day }));
          if (++dirty >= 20) mergedSave();
          stored = true;
          await sleep(SLEEP);
        } else if (++consecFail >= 4) { await ensureRecovery(); }
        else { degraded++; stored = true; }                       // isolated hiccup → keep legacy row, re-run later
      }
      doneN++;
      if (doneN % 10 === 0 || doneN === targets.length) { process.stdout.write("\r  enriched " + doneN + "/" + targets.length + (degraded ? " (" + degraded + " skipped)" : "") + "      "); heartbeat("context-enrich"); }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, lane));
    mergedSave();
    snapshotCache();
  } finally { releaseLock(); }
  process.stdout.write("\n");
  console.log("[context-overlay] enrich done: " + doneN + " sentences (" + degraded + " skipped — re-run --budget && --enrich to retry). Now RE-BAKE (--bake --force) before any push.");
}

// durable harvest snapshot (§10 R9#4): the .tmp cache is the substrate of cheap re-selection —
// losing it means a full-corpus re-fetch against a fragile API. Архив/ = kept, not committed.
function snapshotCache() {
  try {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 16);
    fs.writeFileSync(path.join(SNAP_DIR, "dicta-cache-" + stamp + ".json.gz"), zlib.gzipSync(fs.readFileSync(DICTA_CACHE)));
    const rd = path.join(SNAP_DIR, "README.md");
    if (!fs.existsSync(rd)) fs.writeFileSync(rd, "# Dicta cache snapshots\n\nGzip snapshots of `.tmp/benyehuda/proclitic-overlay-dicta-cache.json` — the sentence→tokens harvest\nboth overlay producers (proclitic + context) bake from. `.tmp` is disposable; this folder is the durable\ncopy (kept out of git via the Архив/ convention). Restore: gunzip over the .tmp path.\nRe-fetching from scratch costs ~43K gentle Dicta calls (~20h) — do not delete casually.\n");
    console.log("[context-overlay] cache snapshot → " + path.relative(REPO, SNAP_DIR));
  } catch (e) { console.warn("⚠ cache snapshot failed: " + (e && e.message)); }
}

function status() {
  const ledger = loadLedger();
  const ids = Object.keys(ledger.works || {});
  let entries = 0, pend = 0, failed = 0;
  for (const id of ids) { const w = ledger.works[id]; entries += w.entries || 0; pend += w.entriesPendingNq || 0; if (w.status === "failed") failed++; }
  let sidecars = 0; try { sidecars = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length; } catch (_) {}
  console.log("[context-overlay] ledger: " + ids.length + " work(s), " + entries + " entries, " + pend + " pending-nq, " + failed + " failed; sidecars on disk: " + sidecars);
  try {
    const cacheM = fs.statSync(DICTA_CACHE).mtimeMs;
    let newest = 0;
    for (const f of fs.readdirSync(OUT_DIR)) { const m = fs.statSync(path.join(OUT_DIR, f)).mtimeMs; if (m > newest) newest = m; }
    if (sidecars && cacheM > newest) console.warn("⚠ cache is NEWER than every sidecar — re-run --bake (stale sidecars must not be pushed).");
  } catch (_) {}
  const lock = readLock();
  if (lock && Date.now() - lock.ts < 10 * 60 * 1000) console.log("[context-overlay] cache lock held by pid " + lock.pid + " (" + lock.tag + ")");
}

(async () => {
  if (has("budget")) return bake({ budgetOnly: true });
  if (has("bake")) return bake({ budgetOnly: false });
  if (has("enrich-dry")) return enrich(true);
  if (has("enrich")) return enrich(false);
  if (has("status")) return status();
  console.log("usage: node scripts/premium/build-context-overlay.js --budget | --bake [--force] | --enrich[-dry] | --status  [--work=<id> --limit=N --sleep=MS --concurrency=N]");
})().catch((e) => { console.error("fatal:", e && e.message || e); releaseLock(); process.exit(1); });
