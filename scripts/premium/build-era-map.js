#!/usr/bin/env node
"use strict";

// build-era-map.js — BRR-P1-014 A2.0 (Wikidata era enrichment · R9 + R7).
//
// pseudocatalogue.csv has NO era column. Most works (90.2%) carry an author Wikidata
// QID (author_uris). This step resolves each distinct QID to its life dates via the
// Wikidata SPARQL endpoint and derives a LITERARY ERA from the author's FLORUIT
// (≈ birth + 35; fallback death − 30) — never from raw death year, which would push a
// revival-era author who lived into the Mandate period into the wrong bucket (R7).
//
// R9 (authority-control / linked-data) invariants:
//   • identity by stable QID (name variants merge by QID, never by string);
//   • era is DERIVED (provenance: wikidata + rule + query date), never asserted/curated;
//     no dates → era = null (honest "unknown"), never a guess (R1);
//   • politeness: batched SPARQL VALUES, descriptive User-Agent, backoff, ON-DISK CACHE
//     so a re-run never re-hammers Wikidata; --offline rebuilds purely from cache.
//
// Output (committed, reproducible): public/data/benyehuda/author-era-map-v<N>.json
//   { schema, version, generated_from:"wikidata", boundaries, authors:{ "<QID>":
//     { era, birth, death, floruit, confidence, source:"wikidata" } } }
//
//   node scripts/premium/build-era-map.js                 # query Wikidata for missing QIDs, cache, write map
//   node scripts/premium/build-era-map.js --offline       # rebuild map from cache only (no network)
//   node scripts/premium/build-era-map.js --limit 50      # cap QIDs (smoke/dev)
//   node scripts/premium/build-era-map.js --version 2     # bump output version

const fs = require("fs");
const path = require("path");
const by = require("./lib/benyehuda");

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const CSV_PATH = path.resolve(arg("csv", path.join(REPO, ".tmp", "benyehuda", "pseudocatalogue.csv")));
const CACHE_PATH = path.resolve(arg("cache", path.join(REPO, ".tmp", "benyehuda", "wikidata-cache.json")));
const VERSION = Number(arg("version", 1)) || 1;
const OUT_PATH = path.resolve(arg("out", path.join(REPO, "public", "data", "benyehuda", "author-era-map-v" + VERSION + ".json")));
const OFFLINE = flag("offline");
const LIMIT = Number(arg("limit", 0)) || 0;
const BATCH = Number(arg("batch", 150)) || 150;

const SPARQL = "https://query.wikidata.org/sparql";
const UA = "LinguistPro-BRR/1.0 (https://linguistpro.kolosei.com; Ben-Yehuda era-map enrichment; contact peter@kolosei.com)";

// ── R7 era boundaries by FLORUIT year (aligned with build-corpus-catalog ERA_META). ──
// Tunable in one place; an author's floruit ≈ birth + 35 (peak productivity), so revival
// poets (Bialik fl. 1908) land in tehiya even though they died under the Mandate.
const FLORUIT_OFFSET = 35;   // birth → floruit
const DEATH_BACKOFF = 30;    // death → floruit (fallback when birth unknown)
const ERA_BOUNDS = [
  { era: "biblical", max: 600 },     // antiquity + piyyut (rare with QID dates)
  { era: "medieval", max: 1780 },    // Andalusian Golden Age + medieval + Renaissance
  { era: "haskalah", max: 1881 },
  { era: "tehiya", max: 1920 },
  { era: "mandate", max: 1948 },
  { era: "modern", max: 2000 },
  { era: "contemporary", max: Infinity },
];
function eraForFloruit(floruit) {
  if (floruit == null || !Number.isFinite(floruit)) return null;
  for (const b of ERA_BOUNDS) if (floruit <= b.max) return b.era;
  return "contemporary";
}

function qidFromUri(uri) {
  const m = /\/(Q\d+)\b/.exec(String(uri || ""));
  return m ? m[1] : null;
}
// First year out of an ISO/Wikidata date literal ("1056-01-01T00:00:00Z", "-0500-..").
function yearOf(v) {
  const m = /^(-?\d{1,7})-/.exec(String(v || ""));
  return m ? parseInt(m[1], 10) : null;
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch (_) { return {}; }
}
function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

async function sparqlBatch(qids, tries = 4) {
  const values = qids.map((q) => "wd:" + q).join(" ");
  const query = `SELECT ?item ?birth ?death WHERE { VALUES ?item { ${values} } OPTIONAL { ?item wdt:P569 ?birth. } OPTIONAL { ?item wdt:P570 ?death. } }`;
  const url = SPARQL + "?format=json&query=" + encodeURIComponent(query);
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60000);
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/sparql-results+json" }, signal: ac.signal });
      clearTimeout(timer);
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) { lastErr = new Error("HTTP " + r.status); }
      else if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
      else {
        const json = await r.json();
        const out = {}; // QID → { birth, death }
        for (const b of (json.results && json.results.bindings) || []) {
          const qid = qidFromUri(b.item && b.item.value);
          if (!qid) continue;
          const rec = out[qid] || (out[qid] = { birth: null, death: null });
          const by_ = b.birth ? yearOf(b.birth.value) : null;
          const dy = b.death ? yearOf(b.death.value) : null;
          // earliest non-null (a person may have multiple dated statements)
          if (by_ != null && (rec.birth == null || by_ < rec.birth)) rec.birth = by_;
          if (dy != null && (rec.death == null || dy < rec.death)) rec.death = dy;
        }
        // QIDs with no dates still get a cache entry (so we don't re-query them next run)
        for (const q of qids) if (!out[q]) out[q] = { birth: null, death: null };
        return out;
      }
    } catch (e) { clearTimeout(timer); if (e.name === "AbortError") lastErr = new Error("timeout"); else lastErr = e; }
    if (attempt < tries) await new Promise((res) => setTimeout(res, 1500 * attempt * attempt));
  }
  throw lastErr || new Error("sparql batch failed");
}

(async () => {
  console.log(`[era-map] BRR-P1-014 A2.0 · csv=${path.relative(REPO, CSV_PATH)} · out=${path.relative(REPO, OUT_PATH)} · v${VERSION}${OFFLINE ? " (offline)" : ""}`);
  if (!fs.existsSync(CSV_PATH)) { console.error("[era-map] CSV not found: " + CSV_PATH); process.exit(2); }
  const { rows } = by.parseCsv(fs.readFileSync(CSV_PATH, "utf8"));

  // distinct author QIDs (+ keep a sample name for the report; identity is the QID, never the name)
  const qidName = new Map();
  for (const r of rows) {
    const qid = qidFromUri(by.firstQid(r.author_uris));
    if (qid && !qidName.has(qid)) qidName.set(qid, by.cleanField(r.authors) || "");
  }
  let qids = Array.from(qidName.keys());
  if (LIMIT) qids = qids.slice(0, LIMIT);
  console.log(`[era-map] works=${rows.length} · distinct author QIDs=${qids.length}`);

  // resolve life dates (cache-first; query only the missing unless --offline)
  const cache = loadCache();
  const missing = qids.filter((q) => !(q in cache));
  if (missing.length && !OFFLINE) {
    console.log(`[era-map] querying Wikidata for ${missing.length} new QID(s) in batches of ${BATCH}…`);
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const res = await sparqlBatch(batch);
      Object.assign(cache, res);
      saveCache(cache);
      process.stdout.write(`  resolved ${Math.min(i + BATCH, missing.length)}/${missing.length}\r`);
      if (i + BATCH < missing.length) await new Promise((r) => setTimeout(r, 400)); // politeness gap
    }
    process.stdout.write("\n");
  } else if (missing.length && OFFLINE) {
    console.log(`[era-map] --offline: ${missing.length} QID(s) absent from cache → era=null for them (honest unknown)`);
  }

  // derive era per QID (floruit bucketing) — R7 boundaries, R9 provenance
  const authors = {};
  const dist = {}; let resolved = 0;
  for (const qid of qids) {
    const rec = cache[qid] || { birth: null, death: null };
    const birth = rec.birth, death = rec.death;
    const floruit = birth != null ? birth + FLORUIT_OFFSET : (death != null ? death - DEATH_BACKOFF : null);
    const era = eraForFloruit(floruit);
    const confidence = birth != null ? "high" : (death != null ? "medium" : "none");
    if (era) resolved++;
    dist[era || "unknown"] = (dist[era || "unknown"] || 0) + 1;
    authors[qid] = { era, birth, death, floruit, confidence, source: "wikidata" };
  }

  // works-coverage: how many of the 26K rows now get a known era through this map
  let worksWithEra = 0;
  for (const r of rows) { const q = qidFromUri(by.firstQid(r.author_uris)); if (q && authors[q] && authors[q].era) worksWithEra++; }

  const out = {
    schema: 1,
    version: VERSION,
    generated_from: "wikidata",
    rule: { floruit_offset: FLORUIT_OFFSET, death_backoff: DEATH_BACKOFF, boundaries: ERA_BOUNDS.map((b) => ({ era: b.era, max_floruit: b.max === Infinity ? null : b.max })) },
    counts: { qids: qids.length, resolved, by_era: dist, works_total: rows.length, works_with_era: worksWithEra },
    authors,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`[era-map] QIDs resolved-to-era ${resolved}/${qids.length} · works covered ${worksWithEra}/${rows.length} (${(100 * worksWithEra / rows.length).toFixed(1)}%)`);
  console.log(`[era-map] era distribution: ${Object.entries(dist).sort((a, b) => (b[1] - a[1])).map(([e, n]) => e + " " + n).join(" · ")}`);
  console.log(`[era-map] wrote ${path.relative(REPO, OUT_PATH)} (${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)} KB)`);
})().catch((e) => { console.error("[era-map] fatal:", (e && e.stack) || e); process.exit(1); });
