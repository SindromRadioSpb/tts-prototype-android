#!/usr/bin/env node
"use strict";
// build-corpus-vocab.js — BRR-P1-007 «Следующий для тебя» (i+1) · SLICE 1 producer.
//
// Lemmatizes the BAKED corpus works OFFLINE (form-first over the shipped Pealim
// inflection dict pealim-infl-v12) and emits a per-work VOCAB PROFILE sidecar
// `corpus-vocab-v<V>.json`. The client lazy-loads it (like corpus-search) and
// computes i+1 coverage CLIENT-SIDE against the live getKnownWordStates() — the
// sidecar ships INGREDIENTS, never a frozen coverage %.
//
// Per-work payload (matched/learnable space only — drill coverage + ranking):
//   ids[] : ascending global lemma-id list of the work's MATCHED pid: lemmas
//   tok[] : parallel in-work token counts (token-weighted coverage; R2 usage>forms)
//   m     : matched token total   n : all-Hebrew token total   (reading-LOAD signal:
//           fallback share = 1 - m/n → the honest «много имён/архаики» flag, D2)
// Individual fallback keys (proper nouns / archaic / non-Pealim ≈13%) are NOT stored
// — they are not learnable cards; only their aggregate count (n-m) feeds reading-load.
//
// JOIN KEY: the global dict holds `pid:<id>` strings formatted by the SAME
// NotesAutoGen.lemmaKey the client uses (notes-autogen.js:355) → byte-identical to
// getKnownWordStates (local-db.js:2114). LOCKSTEP (D4): V is inherited from the
// catalog on disk; `smoke:corpus-vocab` BLOCKS publish on any version/parity/size drift.
//
//   node scripts/premium/build-corpus-vocab.js [--catalog-version N] [--out-dir DIR]
//       [--works-dir DIR] [--limit N] [--quiet]
//
// Design + measurement: docs/planning/BRR_P1_007_I_PLUS_1_DESIGN_2026_06_12.md
// NOTE (offline limitation, honest): form-first has no Dicta context → homograph pid
// may differ from the reader's context-resolved pid. Acceptable for a coverage ESTIMATE
// (badge = soft «≈ по твоим словам»); true join rate is measured post-ship on real profiles.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const NA = require("../../public/js/notes-autogen.js");   // canonical lemmaKey (D1 reuse)

const REPO = path.resolve(__dirname, "..", "..");
const NIQQUD_RE = /[֑-ׇ]/g;
const HEB_LETTER = /[א-ת]/;
const PROCLITIC = /^[והשכלבמ]/;
const stripNiqqud = (s) => String(s == null ? "" : s).replace(NIQQUD_RE, "").trim();

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.indexOf("--" + name) >= 0;

// detect latest corpus-catalog-v<N>.json on disk (lockstep default)
function detectCatalogVersion(outDir) {
  const vs = fs.readdirSync(outDir)
    .map((f) => (f.match(/^corpus-catalog-v(\d+)\.json$/) || [])[1])
    .filter(Boolean).map(Number).sort((a, b) => b - a);
  return vs[0] || null;
}

// build offline form-index: consonantal surface form → pealim_id (first paradigm wins)
function buildFormIndex() {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz"))));
  const form2pid = new Map();
  const validPid = new Set();
  for (const p of d.paradigms) {
    const pid = p.pealim_id != null ? String(p.pealim_id) : "";
    if (!pid) continue;
    validPid.add(pid);
    for (const k of [p.lemma, p.lemma_niqqud, p.form, p.root]) {
      const c = stripNiqqud(k); if (c && HEB_LETTER.test(c) && !form2pid.has(c)) form2pid.set(c, pid);
    }
    const cells = p.cells || {};
    for (const ck of Object.keys(cells)) {
      const c = stripNiqqud(cells[ck] && cells[ck].he);
      if (c && HEB_LETTER.test(c) && !form2pid.has(c)) form2pid.set(c, pid);
    }
  }
  return { form2pid, validPid, modelVersion: d.model_version || "pealim-infl-v12" };
}

// surface token → pid (matched) | null (fallback). Mirrors the reader's offline form-first.
function tokenToPid(form2pid, token) {
  const c = stripNiqqud(token);
  if (!c || !HEB_LETTER.test(c)) return undefined;
  let pid = form2pid.get(c);
  if (pid) return pid;
  if (PROCLITIC.test(c) && c.length >= 3) { pid = form2pid.get(c.slice(1)); if (pid) return pid; }
  return null;   // fallback (counts toward reading-load, not a learnable key)
}

function workTokens(work) {
  const out = [];
  const texts = (work && work.library && work.library.texts) || [];
  for (const t of texts) for (const row of (t.rows || [])) {
    const heb = row.hebrew_niqqud || row.hebrew_plain || ""; if (!heb) continue;
    for (const p of String(heb).split(/[^א-ת֑-ׇ]+/)) { const c = stripNiqqud(p); if (c && HEB_LETTER.test(c)) out.push(p); }
  }
  return out;
}

// ── core: deterministic, reusable (CLI + smoke gate call this) ────────────────
function buildCorpusVocab(opts = {}) {
  const outDir = opts.outDir || path.join(REPO, "public", "data", "benyehuda");
  const worksDir = opts.worksDir || path.join(outDir, "works");
  const V = Number(opts.catalogVersion || detectCatalogVersion(outDir));
  if (!V) throw new Error("no corpus-catalog-v<N>.json found to inherit version from");
  const limit = Number(opts.limit || 0) || 0;
  const log = opts.quiet ? () => {} : (...a) => console.log("[vocab]", ...a);

  const catalog = JSON.parse(fs.readFileSync(path.join(outDir, "corpus-catalog-v" + V + ".json"), "utf8"));
  // baked = has a body (coverage.text). The THIN root carries these as pointers.ready
  // (cards.filter(coverage.text)); older/full catalogs may inline works[]. Either source.
  const bakedIds = Array.isArray(catalog.pointers && catalog.pointers.ready)
    ? catalog.pointers.ready.map(String)
    : (catalog.works || []).filter((c) => c.coverage && c.coverage.text).map((c) => String(c.id));
  const { form2pid, validPid, modelVersion } = buildFormIndex();
  log(`catalog v${V} · ${bakedIds.length} baked works · dict ${modelVersion} (${form2pid.size} forms)`);

  const worksOut = {};            // id → { ids, tok, m, n }
  const keyFreq = new Map();      // pid-key → global token freq (for stable id + stats)
  let processed = 0, totalTok = 0, totalMatched = 0, missingBody = 0;
  const ids = limit ? bakedIds.slice(0, limit) : bakedIds;

  for (const id of ids) {
    const wf = path.join(worksDir, id + ".json");
    if (!fs.existsSync(wf)) { missingBody++; continue; }
    let work; try { work = JSON.parse(fs.readFileSync(wf, "utf8")); } catch (_) { missingBody++; continue; }
    const toks = workTokens(work);
    if (!toks.length) continue;
    const counts = new Map();     // pid-key → in-work token count
    let matched = 0;
    for (const tk of toks) {
      const pid = tokenToPid(form2pid, tk);
      if (pid === undefined) continue;           // not a Hebrew token
      if (pid === null) continue;                // fallback — only the aggregate (n-m) matters
      const key = NA.lemmaKey({ pealim_id: pid }); // byte-identical canonical key
      counts.set(key, (counts.get(key) || 0) + 1);
      matched++;
      keyFreq.set(key, (keyFreq.get(key) || 0) + 1);
    }
    worksOut[id] = { _counts: counts, m: matched, n: toks.length };
    processed++; totalTok += toks.length; totalMatched += matched;
  }

  // global dict — STABLE SORT by numeric pid (deterministic re-runs; D1/R3 invariant)
  const dictKeys = Array.from(keyFreq.keys()).sort((a, b) => {
    const pa = Number(a.slice(4)), pb = Number(b.slice(4));
    return pa - pb || (a < b ? -1 : a > b ? 1 : 0);
  });
  const key2id = new Map(dictKeys.map((k, i) => [k, i]));

  // S3 cold-start easiness — PROFILE-INDEPENDENT intrinsic score (build-time, not a stale
  // per-user verdict): common-vocab concentration × low proper-noun load × coherent length.
  // The «С чего начать» rail sorts by ez; fragments/scraps (n<MIN) sink, archaic/name-heavy
  // sink (low matchedShare). Validated in .tmp/benyehuda/easiness-recon.js (top=accessible
  // modern lyric/prose, bottom=title-scraps). top-1000 global-frequency lemma set:
  const topKeyIds = new Set(
    Array.from(keyFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 1000).map((e) => key2id.get(e[0]))
  );
  const EZ_MIN_LEN = 80, EZ_BIG_LEN = 1500;
  const lenShape = (n) => (n < EZ_MIN_LEN ? (n / EZ_MIN_LEN) * 0.6 : (n > EZ_BIG_LEN ? Math.max(0.4, EZ_BIG_LEN / n) : 1));

  // finalize per-work payload: ascending id list DELTA-encoded (gaps → smaller numbers
  // → ~33% better gzip, lossless) + parallel token counts. Client reconstructs absolute
  // ids by prefix-sum. tok[i] = in-work token count of lemma ids[i] (token-weighted i+1).
  const works = {};
  for (const id of Object.keys(worksOut)) {
    const w = worksOut[id];
    const pairs = Array.from(w._counts.entries(), ([k, c]) => [key2id.get(k), c]).sort((a, b) => a[0] - b[0]);
    let prev = 0, headTok = 0; const d = [];
    for (const [absId, c] of pairs) { d.push(absId - prev); prev = absId; if (topKeyIds.has(absId)) headTok += c; }
    const headShare = w.m ? headTok / w.m : 0;        // common-vocab concentration
    const matchedShare = w.n ? w.m / w.n : 0;          // 1 - fallback (low proper-noun load)
    const ez = +(headShare * matchedShare * lenShape(w.n)).toFixed(3);
    works[id] = { ids: d, tok: pairs.map((p) => p[1]), m: w.m, n: w.n, ez: ez };
  }

  const sidecar = {
    schema: 1, version: V, model_id: modelVersion, catalog_version: V,
    id_encoding: "delta",   // ids[] are ascending deltas; client prefix-sums to absolute
    generated_from: "offline form-first pealim-infl-v12 over baked work bodies",
    // dict: pid-strings (the numeric Pealim id); client rebuilds "pid:"+s to join getKnownWordStates
    dict: dictKeys.map((k) => k.slice(4)),
    works,
  };
  return { sidecar, V, stats: { processed, missingBody, totalTok, totalMatched, dict: dictKeys.length, validPidCount: validPid.size } };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const outDir = arg("out-dir", path.join(REPO, "public", "data", "benyehuda"));
  const { sidecar, V, stats } = buildCorpusVocab({
    outDir, worksDir: arg("works-dir", undefined),
    catalogVersion: arg("catalog-version", undefined),
    limit: arg("limit", undefined), quiet: flag("quiet"),
  });
  const json = JSON.stringify(sidecar);
  const raw = Buffer.byteLength(json);
  const gz = zlib.gzipSync(Buffer.from(json), { level: 9 }).length;
  const perWork = gz / Math.max(1, stats.processed);   // gz bytes per processed work
  console.log("[vocab] processed " + stats.processed + " works · " + stats.dict + " distinct lemmas · " +
    "match " + (100 * stats.totalMatched / stats.totalTok).toFixed(1) + "% · missing-body " + stats.missingBody);
  console.log("[vocab] size raw " + (raw / 1024).toFixed(0) + "KB · gz " + (gz / 1024).toFixed(0) + "KB · " +
    (perWork * 1000 / 1024).toFixed(0) + "KB-gz/1000-works · extrap @8099≈" + (perWork * 8099 / 1048576).toFixed(1) + "MB-gz · @26455≈" + (perWork * 26455 / 1048576).toFixed(1) + "MB-gz");
  if (!flag("dry-run")) {
    const out = path.join(outDir, "corpus-vocab-v" + V + ".json");
    fs.writeFileSync(out, json);
    console.log("[vocab] wrote " + path.relative(REPO, out) + " (bump SW CACHE_VERSION + lockstep w/ catalog v" + V + ")");
  } else {
    console.log("[vocab] dry-run — nothing written");
  }
}

module.exports = { buildCorpusVocab, buildFormIndex, tokenToPid, workTokens, detectCatalogVersion };
