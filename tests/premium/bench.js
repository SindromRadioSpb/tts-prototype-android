#!/usr/bin/env node
"use strict";

// Offline bench harness for the premium pipeline.
//
//   node tests/premium/bench.js
//
// Runs deterministic offline pieces (segmenter + translit) against the
// authored corpus, computes P/R/F1 on segment-level refs, exact/near-match
// rate on translit spot-checks, and per-call latency p50/p95. Results land
// in tests/premium/bench-results/ as bench-<iso>.json plus latest.json.
//
// Online providers (sidecar nikud, GCP/MADLAD translation) are intentionally
// out of scope for this pass — add them after 5.2 confirms the sidecar
// actually runs on the target machine.

const path = require("node:path");
const fs   = require("node:fs");
const { performance } = require("node:perf_hooks");

const { segment }       = require("../../db/premium/segmenter");
const { transliterate } = require("../../db/premium/translit");

const FIXTURE_PATH = path.join(__dirname, "fixtures", "bench-corpus.json");
const OUT_DIR      = path.join(__dirname, "bench-results");

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function quantile(sortedNums, q) {
  if (!sortedNums.length) return null;
  const pos = (sortedNums.length - 1) * q;
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos);
  if (lo === hi) return sortedNums[lo];
  const frac = pos - lo;
  return sortedNums[lo] * (1 - frac) + sortedNums[hi] * frac;
}

function segmentF1(produced, expected) {
  const p = produced.slice();
  const e = expected.slice();
  const eCount = new Map();
  for (const s of e) eCount.set(s, (eCount.get(s) || 0) + 1);
  let tp = 0;
  for (const s of p) {
    const c = eCount.get(s) || 0;
    if (c > 0) {
      tp++;
      eCount.set(s, c - 1);
    }
  }
  const precision = p.length ? tp / p.length : 0;
  const recall    = e.length ? tp / e.length : 0;
  const f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
  return { tp, fp: p.length - tp, fn: e.length - tp, precision, recall, f1 };
}

function round(n, digits = 3) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const k = Math.pow(10, digits);
  return Math.round(n * k) / k;
}

function pct(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return round(n * 100, digits);
}

function runBench() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  const results = {
    timestamp: new Date().toISOString(),
    fixture_version: fixture.version,
    entries: [],
    translit_checks: [],
    aggregate: {},
    notes: "offline bench: segmenter + translit only; online providers not exercised",
  };

  const segLatencies = [];
  const translitLatencies = [];

  let segF1Sum = 0, segF1Count = 0;
  let exactSum = 0, exactCount = 0;
  const perCategory = {};

  for (const entry of fixture.entries) {
    const t0 = performance.now();
    const segs = segment(entry.text).map(s => s.he);
    const tMs = performance.now() - t0;
    segLatencies.push(tMs);

    const row = {
      id: entry.id,
      category: entry.category,
      chars: entry.text.length,
      produced: segs,
      latency_ms: round(tMs, 3),
    };

    if (entry.ref && Array.isArray(entry.ref.segments)) {
      const scores = segmentF1(segs, entry.ref.segments);
      row.ref_segments = entry.ref.segments;
      row.scores = {
        precision: round(scores.precision),
        recall:    round(scores.recall),
        f1:        round(scores.f1),
        tp: scores.tp, fp: scores.fp, fn: scores.fn,
      };
      row.exact_match = (scores.f1 === 1);
      segF1Sum += scores.f1;
      segF1Count++;
      if (row.exact_match) exactSum++;
      exactCount++;

      if (!perCategory[entry.category]) {
        perCategory[entry.category] = { entries: 0, exact_match: 0, f1_sum: 0 };
      }
      perCategory[entry.category].entries++;
      perCategory[entry.category].f1_sum += scores.f1;
      if (row.exact_match) perCategory[entry.category].exact_match++;
    }

    results.entries.push(row);
  }

  let translitExactN = 0, translitNearN = 0;
  for (const check of (fixture.translit_checks || [])) {
    const t0 = performance.now();
    const got = transliterate(check.niqqud);
    const tMs = performance.now() - t0;
    translitLatencies.push(tMs);

    const exact = (got === check.expected);
    const editDist = exact ? 0 : levenshtein(got, check.expected);
    const near = exact || (editDist <= 2 && check.expected.length >= 3);

    if (exact) translitExactN++;
    if (near)  translitNearN++;

    results.translit_checks.push({
      id: check.id,
      niqqud: check.niqqud,
      expected: check.expected,
      got,
      exact,
      near,
      edit_distance: editDist,
      latency_ms: round(tMs, 3),
    });
  }

  segLatencies.sort((a, b) => a - b);
  translitLatencies.sort((a, b) => a - b);

  results.aggregate = {
    entries_total: fixture.entries.length,
    segmentation: {
      entries_with_ref: segF1Count,
      mean_f1:         round(segF1Count ? segF1Sum / segF1Count : 0),
      exact_match_rate: pct(exactCount ? exactSum / exactCount : 0),
      latency_ms_p50:  round(quantile(segLatencies, 0.5),  3),
      latency_ms_p95:  round(quantile(segLatencies, 0.95), 3),
      by_category: Object.fromEntries(
        Object.entries(perCategory).map(([cat, v]) => [cat, {
          entries: v.entries,
          exact_match_rate: pct(v.exact_match / v.entries),
          mean_f1: round(v.f1_sum / v.entries),
        }])
      ),
    },
    translit: {
      checks_total: (fixture.translit_checks || []).length,
      exact_rate:    pct(results.translit_checks.length ? translitExactN / results.translit_checks.length : 0),
      near_rate:     pct(results.translit_checks.length ? translitNearN  / results.translit_checks.length : 0),
      latency_ms_p50: round(quantile(translitLatencies, 0.5),  3),
      latency_ms_p95: round(quantile(translitLatencies, 0.95), 3),
    },
  };

  return results;
}

function writeResults(results) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const tsSlug = results.timestamp.replace(/[:.]/g, "-");
  const runFile = path.join(OUT_DIR, `bench-${tsSlug}.json`);
  const latestFile = path.join(OUT_DIR, "latest.json");
  fs.writeFileSync(runFile,    JSON.stringify(results, null, 2) + "\n");
  fs.writeFileSync(latestFile, JSON.stringify(results, null, 2) + "\n");
  return { runFile, latestFile };
}

function printSummary(results) {
  const a = results.aggregate;
  console.log(`\n=== Premium bench (${results.timestamp}) ===`);
  console.log(`corpus entries: ${a.entries_total}`);
  console.log("");
  console.log("Segmentation (offline):");
  console.log(`  entries with refs : ${a.segmentation.entries_with_ref}/${a.entries_total}`);
  console.log(`  mean F1           : ${a.segmentation.mean_f1}`);
  console.log(`  exact-match rate  : ${a.segmentation.exact_match_rate}%`);
  console.log(`  latency p50/p95   : ${a.segmentation.latency_ms_p50} / ${a.segmentation.latency_ms_p95} ms`);
  console.log("  by category:");
  for (const [cat, v] of Object.entries(a.segmentation.by_category)) {
    console.log(`    ${cat.padEnd(18)} n=${v.entries} exact=${v.exact_match_rate}% meanF1=${v.mean_f1}`);
  }
  console.log("");
  console.log("Transliteration (offline SBL spot-checks):");
  console.log(`  checks            : ${a.translit.checks_total}`);
  console.log(`  exact rate        : ${a.translit.exact_rate}%`);
  console.log(`  near rate (≤2 ed.): ${a.translit.near_rate}%`);
  console.log(`  latency p50/p95   : ${a.translit.latency_ms_p50} / ${a.translit.latency_ms_p95} ms`);

  const segMisses = results.entries.filter(r => r.scores && r.scores.f1 < 1);
  if (segMisses.length) {
    console.log("\nSegmentation misses:");
    for (const r of segMisses) {
      console.log(`  ${r.id} [${r.category}] F1=${r.scores.f1}`);
      console.log(`    got: ${JSON.stringify(r.produced)}`);
      console.log(`    ref: ${JSON.stringify(r.ref_segments)}`);
    }
  }

  const translitMisses = results.translit_checks.filter(c => !c.exact);
  if (translitMisses.length) {
    console.log("\nTranslit misses:");
    for (const c of translitMisses) {
      console.log(`  ${c.id}: got='${c.got}' ref='${c.expected}' (edit=${c.edit_distance})`);
    }
  }
}

function main() {
  const results = runBench();
  const { runFile, latestFile } = writeResults(results);
  printSummary(results);
  console.log(`\nWrote ${path.relative(process.cwd(), runFile)}`);
  console.log(`Wrote ${path.relative(process.cwd(), latestFile)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("bench failed:", e);
    process.exit(1);
  }
}

module.exports = { runBench };
