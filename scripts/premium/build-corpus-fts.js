#!/usr/bin/env node
"use strict";
// build-corpus-fts.js — BRR-P2-001 full-text index producer ("поиск внутри текстов").
//
// Builds a custom Hebrew-morphology-aware INVERTED INDEX over the corpus Hebrew bodies
// and ships it as a thin manifest + per-first-letter exact shards + a lemma index +
// a skeleton→pid map (the Dicta-class recall lever). FTS5 is not compiled into our
// wa-sqlite, so this is a pure-JS index the client (public/js/corpus-fts.js) lazy-queries.
//
// PARITY: index-time normalisation reuses the SAME corpus-fts.js normalizeToken /
// tokenizeText the client uses at query time; the lemma pid reuses build-corpus-vocab's
// buildFormIndex/tokenToPid (the i+1 spine), so the FTS lemma key never drifts from i+1.
// Gate smoke:corpus-fts-parity asserts both; smoke:corpus-fts asserts manifest/determinism/size.
//
// Body source per work: a baked works/<id>.json if present (already in OPFS-ready shape),
// else the original Hebrew txt via ingestCore.fetchTxt (cache .tmp/benyehuda/txt, or GitHub
// dump unless --no-fetch). Works with no available body are skipped (honest — indexed once
// their body is fetched; coverage grows with the bake/fetch like the rest of the corpus).
//
//   node scripts/premium/build-corpus-fts.js [--catalog-version N] [--data-rev R]
//       [--out-dir DIR] [--by-dir DIR] [--limit N] [--no-fetch] [--quiet] [--dry-run]

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const FTS = require("../../public/js/corpus-fts.js");                 // shared normaliser (parity)
const { buildFormIndex, tokenToPid } = require("./build-corpus-vocab.js"); // lemma resolver (reuse)
const by = require("./lib/benyehuda.js");                              // CSV parse + footer strip
const { createIngestCore } = require("./lib/ingestCore.js");

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
const flag = (name) => process.argv.indexOf("--" + name) >= 0;

function detectCatalogVersion(dir) {
  const vs = fs.readdirSync(dir).map((f) => (f.match(/^corpus-catalog-v(\d+)\.json$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => b - a);
  return vs[0] || null;
}

// ── core (CLI + smoke gate call this) ─────────────────────────────────────────
async function buildCorpusFts(opts = {}) {
  const outDir = opts.outDir || path.join(REPO, "public", "data", "benyehuda");
  const V = Number(opts.catalogVersion || detectCatalogVersion(outDir));
  if (!V) throw new Error("no corpus-catalog-v<N>.json to inherit version from");
  const dataRev = Number(opts.dataRev || 1);
  const worksDir = opts.worksDir || path.join(outDir, "works");
  const byDir = opts.byDir || path.join(REPO, ".tmp", "benyehuda");
  const noFetch = opts.noFetch == null ? true : !!opts.noFetch;   // default cache-only (polite)
  const limit = Number(opts.limit || 0) || 0;
  const log = opts.quiet ? () => {} : (...a) => console.log("[fts]", ...a);

  const search = JSON.parse(fs.readFileSync(path.join(outDir, "corpus-search-v" + V + ".json"), "utf8"));
  const idToOrd = new Map(); search.forEach((r, i) => idToOrd.set(String(r.id), i));

  let idToPath = new Map();
  try {
    const csv = by.parseCsv(fs.readFileSync(path.join(byDir, "pseudocatalogue.csv"), "utf8"));
    for (const r of csv.rows) { const id = by.cleanField(r.ID), p = by.cleanField(r.path); if (id && p) idToPath.set(String(id), p); }
  } catch (e) { log("no pseudocatalogue.csv — only baked works indexed:", e.message); }

  const core = createIngestCore({ byDir, noFetch, log: () => {} });
  const { form2pid } = buildFormIndex();

  function readyBodyText(id) {
    const wf = path.join(worksDir, id + ".json");
    if (!fs.existsSync(wf)) return null;
    let w; try { w = JSON.parse(fs.readFileSync(wf, "utf8")); } catch (_) { return null; }
    const texts = (w && w.library && w.library.texts) || [];
    let s = "";
    for (const t of texts) for (const row of (t.rows || [])) s += (row.hebrew_niqqud || row.hebrew_plain || "") + "\n";
    return s;
  }
  async function bodyText(id) {
    const ready = readyBodyText(id);
    if (ready != null) return ready;
    const p = idToPath.get(id); if (!p) return null;
    try { const raw = await core.fetchTxt(p); return by.stripFooter(raw).body; } catch (_) { return null; }
  }

  // DF cap drops ONLY ubiquitous function words (appear in nearly every work — את/של/היה…), NOT
  // common CONTENT words (love/king appear in many works but are real search targets). 0.92 = drop
  // a term only when it is in >92% of indexed works.
  const maxDfRatio = opts.maxDfRatio != null ? Number(opts.maxDfRatio) : 0.92;
  const exact = new Map();      // skeleton → Map(ord → tf)
  const lemma = new Map();      // pid → Map(ord → tf)
  const lemmaMap = new Map();   // skeleton → pid (first-wins)
  let indexed = 0, missing = 0, totalTok = 0, matchedTok = 0, collisions = 0;

  const ids = search.map((r) => String(r.id));
  const todo = limit ? ids.slice(0, limit) : ids;
  let done = 0;
  for (const id of todo) {
    const ord = idToOrd.get(id);
    let text = null;
    try { text = await bodyText(id); } catch (_) { text = null; }
    if (text == null) { missing++; continue; }
    const toks = FTS.tokenizeText(text);
    if (!toks.length) { missing++; continue; }
    let any = false;
    for (const tk of toks) {
      const skel = FTS.normalizeToken(tk); if (!skel) continue;
      any = true; totalTok++;
      const pid = tokenToPid(form2pid, tk);
      if (pid) {
        // CONTENT word → the lemma field collapses all its inflections/proclitics into one pid
        // (Dicta-class recall + compact: no per-surface-form explosion). lemmamap resolves a
        // query skeleton → pid without shipping the 3.3 MB dict.
        matchedTok++;
        if (!lemmaMap.has(skel)) lemmaMap.set(skel, pid);
        else if (lemmaMap.get(skel) !== pid) collisions++;
        let lm = lemma.get(pid); if (!lm) { lm = new Map(); lemma.set(pid, lm); } lm.set(ord, (lm.get(ord) || 0) + 1);
      } else {
        // FALLBACK token (proper noun / archaic / non-Pealim ≈15%) → the lemma field can't hold
        // it, so the exact-skeleton field carries it (keeps name/place search; small because the
        // proclitic-inflated content vocabulary lives in the lemma field, not here).
        let m = exact.get(skel); if (!m) { m = new Map(); exact.set(skel, m); } m.set(ord, (m.get(ord) || 0) + 1);
      }
    }
    if (any) indexed++;
    if (++done % 500 === 0) log(done + "/" + todo.length + " · indexed " + indexed + " · missing " + missing);
  }

  // Document-frequency cap (standard IR stopword removal): a skeleton/pid that appears in more
  // than maxDfRatio of the indexed works is non-discriminating (function words, proclitic
  // forms, את/של/היה…) — a search for it would match nearly everything. Dropping the top band
  // collapses the bulk (the long posting lists) while losing NOTHING a reader would search for.
  const maxDf = Math.max(50, Math.ceil(maxDfRatio * Math.max(1, indexed)));
  let droppedExact = 0, droppedLemma = 0;
  for (const [skel, m] of exact) { if (m.size > maxDf) { exact.delete(skel); droppedExact++; } }
  const keptPids = new Set();
  for (const [pid, m] of lemma) { if (m.size > maxDf) { lemma.delete(pid); droppedLemma++; } else keptPids.add(pid); }

  // flat [w0,c0,dw1,c1,...] (ord ascending, delta-encoded) — lossless, gzip-friendly
  function encode(m) {
    const arr = Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
    const out = []; let prev = 0;
    for (const [ord, c] of arr) { out.push(ord - prev, c); prev = ord; }
    return out;
  }
  const sortObj = (o) => { const out = {}; for (const k of Object.keys(o).sort()) out[k] = o[k]; return out; };

  const buckets = {};
  for (const [skel, m] of exact) { const b = FTS.bucketOf(skel); if (!b) continue; (buckets[b] || (buckets[b] = {}))[skel] = encode(m); }
  for (const b of Object.keys(buckets)) buckets[b] = sortObj(buckets[b]);
  const lemmaObj = {}; for (const [pid, m] of lemma) lemmaObj[pid] = encode(m);
  // lemmamap = query-skeleton → pid for the SURVIVING content lemmas. Two sources so ANY
  // query form resolves: (1) skeletons actually seen in the corpus, plus (2) EVERY dictionary
  // form of those pids (so the bare lemma «מלך» resolves even when the corpus only carries
  // «המלך/מלכים»). All from the SAME form2pid the build used → parity, no 3.3 MB dict at query time.
  const PURE_HEB = /^[א-ת]+$/;   // dict fields can carry English ("conjugation of …") — keep only clean Hebrew skeletons
  const lemmaMapObj = {};
  for (const [skel, pid] of lemmaMap) if (keptPids.has(pid) && PURE_HEB.test(skel)) lemmaMapObj[skel] = pid;
  for (const [form, pid] of form2pid) {
    if (!keptPids.has(pid)) continue;
    const skel = FTS.normalizeToken(form);
    if (skel && PURE_HEB.test(skel) && lemmaMapObj[skel] == null) lemmaMapObj[skel] = pid;
  }

  const manifest = {
    schema: 1, version: V, data_rev: dataRev,
    fields: ["exact", "lemma"],
    works_file: "corpus-search-v" + V + ".json",
    lemma_file: "fts/lemma-v" + V + ".json",
    lemmamap_file: "fts/lemmamap-v" + V + ".json",
    buckets: Object.keys(buckets).sort(),
    max_df_ratio: maxDfRatio,
    counts: { works: search.length, indexed, missing, exact_keys: exact.size, lemma_keys: lemma.size, dropped_exact: droppedExact, dropped_lemma: droppedLemma, collisions, total_tokens: totalTok, matched_tokens: matchedTok },
  };

  return {
    V, dataRev, manifest, buckets,
    lemmaObj: sortObj(lemmaObj), lemmaMapObj: sortObj(lemmaMapObj),
    stats: manifest.counts,
  };
}

function writeArtifacts(outDir, res) {
  const ftsDir = path.join(outDir, "fts");
  fs.mkdirSync(ftsDir, { recursive: true });
  let raw = 0, gz = 0;
  const write = (p, obj) => {
    const json = JSON.stringify(obj);
    fs.writeFileSync(p, json);
    raw += Buffer.byteLength(json);
    gz += zlib.gzipSync(Buffer.from(json), { level: 9 }).length;
  };
  // clean stale shards for this version first (a shrunk bucket set must not leave orphans)
  for (const f of fs.readdirSync(ftsDir)) { if (new RegExp("-v" + res.V + "\\.json$").test(f)) fs.unlinkSync(path.join(ftsDir, f)); }
  for (const b of Object.keys(res.buckets)) write(path.join(ftsDir, "ex-" + b + "-v" + res.V + ".json"), res.buckets[b]);
  write(path.join(ftsDir, "lemma-v" + res.V + ".json"), res.lemmaObj);
  write(path.join(ftsDir, "lemmamap-v" + res.V + ".json"), res.lemmaMapObj);
  const manRaw = JSON.stringify(res.manifest);
  fs.writeFileSync(path.join(outDir, "corpus-fts-v" + res.V + ".json"), manRaw);
  raw += Buffer.byteLength(manRaw); gz += zlib.gzipSync(Buffer.from(manRaw), { level: 9 }).length;
  return { raw, gz };
}

if (require.main === module) {
  (async () => {
    const outDir = arg("out-dir", path.join(REPO, "public", "data", "benyehuda"));
    const res = await buildCorpusFts({
      outDir, byDir: arg("by-dir", undefined),
      catalogVersion: arg("catalog-version", undefined), dataRev: arg("data-rev", 1),
      limit: arg("limit", undefined), noFetch: flag("no-fetch") ? true : (flag("fetch") ? false : true),
      quiet: flag("quiet"),
    });
    const s = res.stats;
    console.log("[fts] indexed " + s.indexed + "/" + s.works + " works · missing-body " + s.missing +
      " · exact-keys " + s.exact_keys + " · lemma-keys " + s.lemma_keys + " · collisions " + s.collisions +
      " · match " + (s.total_tokens ? (100 * s.matched_tokens / s.total_tokens).toFixed(1) : "0") + "%");
    if (flag("dry-run")) { console.log("[fts] dry-run — nothing written"); return; }
    const sz = writeArtifacts(outDir, res);
    const per = res.stats.indexed ? sz.gz / res.stats.indexed : 0;
    console.log("[fts] size raw " + (sz.raw / 1048576).toFixed(2) + "MB · gz " + (sz.gz / 1048576).toFixed(2) + "MB · " +
      (per * 1000 / 1024).toFixed(0) + "KB-gz/1000-works · extrap @26455≈" + (per * 26455 / 1048576).toFixed(1) + "MB-gz");
    console.log("[fts] wrote corpus-fts-v" + res.V + ".json + fts/ shards (bump SW CACHE_VERSION + FTS_DATA_REV; lockstep catalog v" + res.V + ")");
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { buildCorpusFts, writeArtifacts, detectCatalogVersion };
