#!/usr/bin/env node
"use strict";

// measure-corpus-prerun.js — BRR-P0-006 planning artifact (RUN LOCALLY, read-only).
//
// Produces the "volume × cost × time" estimate the ticket DoD requires BEFORE the
// full ~26.5K pre-run. It does NOT translate/vocalize/bake anything — it downloads a
// RANDOM SAMPLE of the corpus, segments each work with the SAME engine the producer
// uses (db/premium/segmenter#segment + lib/benyehuda helpers), measures the per-work
// distribution (chars / segments / vocalized ratio), and extrapolates to the full
// originals population. Estimates are reported with explicit assumptions so the owner
// can make a grounded go/no-go (and tune --sample for a tighter bound).
//
//   node scripts/premium/measure-corpus-prerun.js --sample 200 --seed 7
//   node scripts/premium/measure-corpus-prerun.js --sample 400 --concurrency 8 --out .tmp/by-prerun-estimate.json
//
// Network: fetches sample txt from the same RAW_BASE the producer uses, cached under
// .tmp/benyehuda/txt (so re-runs are warm). Honest: failed fetches are counted, not
// silently dropped, and the extrapolation states its sample size + assumptions.

const fs = require("fs");
const path = require("path");

const { segment } = require("../../db/premium/segmenter");
const by = require("./lib/benyehuda");

const REPO = path.resolve(__dirname, "..", "..");
const BY_DIR = path.join(REPO, ".tmp", "benyehuda");
const TXT_DIR = path.join(BY_DIR, "txt");
const CSV_PATH = path.join(BY_DIR, "pseudocatalogue.csv");
const RAW_BASE = "https://raw.githubusercontent.com/projectbenyehuda/public_domain_dump/master";

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
const SAMPLE = Number(arg("sample", 200)) || 200;
const SEED = Number(arg("seed", 7)) || 7;
const CONCURRENCY = Math.max(1, Number(arg("concurrency", 6)) || 6);
const OUT = String(arg("out", path.join(REPO, ".tmp", "by-prerun-estimate.json")));

// ── model assumptions (explicit + tunable; calibrated from the canon-v3 audio bake) ──
const GEMINI_CHUNK = Number(arg("gemini-chunk", 50));       // segments per Gemini call (producer default)
const GEMINI_OVERHEAD = 1.10;                                // +10% calls for retry/split on long works
const GEMINI_FREE_PER_DAY = Number(arg("gemini-per-day", 1500)); // free-tier requests/day (owner)
const WAVENET_FREE_CHARS_MONTH = 4_000_000;                  // GCP WaveNet free tier chars/month
const AVG_CLIP_BYTES = 305 * 1024 * 1024 / 6446;             // canon-v3: 305MB / 6446 clips ≈ 49.6 KB
const CLIP_DEDUP = 0.97;                                     // canon: 6446 unique / 6646 rows ≈ 0.97

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// deterministic LCG so a given --seed reproduces the same sample
function lcg(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

async function httpGet(url, tries = 3) {
  for (let a = 1; a <= tries; a++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "linguistpro-prerun-measure/1.0" } });
      if (res.status === 404) { const e = new Error("404"); e.status = 404; throw e; }
      if (res.status === 429) { await sleep(2000 * a); continue; }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (e) { if (e && e.status === 404) throw e; if (a === tries) throw e; await sleep(600 * a); }
  }
  throw new Error("fetch failed");
}

async function fetchTxt(byPath) {
  const rel = String(byPath || "").replace(/^\//, "");
  const cacheFile = path.join(TXT_DIR, rel + ".txt");
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
  const txt = await httpGet(RAW_BASE + "/txt/" + rel + ".txt");
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, txt);
  return txt;
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  const lane = async () => { while (true) { const i = idx++; if (i >= items.length) return; await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}

function pct(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; }
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

(async () => {
  if (!fs.existsSync(CSV_PATH)) { console.error("CSV not found: " + CSV_PATH + " (run ingest-benyehuda once to fetch it)"); process.exit(2); }
  const { rows } = by.parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const originals = rows.filter((r) => !by.cleanField(r.translators) && by.cleanField(r.path) && by.cleanField(r.ID));
  const translations = rows.filter((r) => by.cleanField(r.translators));
  log(`Corpus: ${rows.length} works | originals ${originals.length} | translations ${translations.length}`);
  log(`Sampling ${SAMPLE} originals (seed ${SEED}, concurrency ${CONCURRENCY})…`);

  // deterministic random sample of originals
  const rnd = lcg(SEED);
  const pool = originals.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const sample = pool.slice(0, Math.min(SAMPLE, pool.length));

  const perWork = []; // {chars, segments, unvocSegments, vocRatio}
  let fetched = 0, failed = 0, emptyBody = 0, done = 0;
  await runPool(sample, CONCURRENCY, async (r) => {
    try {
      const raw = await fetchTxt(r.path);
      fetched++;
      const { body } = by.stripFooter(raw);
      if (!body || !body.trim()) { emptyBody++; return; }
      const segs = segment(body);
      const unvoc = segs.filter((s) => !by.hasNiqqud(s.he)).length;
      const chars = by.stripNiqqud(body).length;
      perWork.push({ chars, segments: segs.length, unvocSegments: unvoc, vocRatio: segs.length ? (segs.length - unvoc) / segs.length : 0 });
    } catch (e) { failed++; }
    done++;
    if (done % 25 === 0 || done === sample.length) process.stdout.write(`  measured ${done}/${sample.length} (ok ${perWork.length}, fail ${failed})\r`);
  });
  process.stdout.write("\n");
  if (!perWork.length) { console.error("no works measured (network?)"); process.exit(1); }

  const N = originals.length;
  const charsArr = perWork.map((w) => w.chars);
  const segArr = perWork.map((w) => w.segments);
  const unvocArr = perWork.map((w) => w.unvocSegments);
  const mChars = mean(charsArr), mSeg = mean(segArr), mUnvoc = mean(unvocArr);
  const mVocRatio = mean(perWork.map((w) => w.vocRatio));

  // extrapolate originals (translations measured separately at bulk; excluded from this pass)
  const totalSeg = Math.round(mSeg * N);
  const totalUnvoc = Math.round(mUnvoc * N);     // niqqud calls (source-first → only unvocalized)
  const totalChars = Math.round(mChars * N);
  const geminiReqs = Math.round((totalSeg / GEMINI_CHUNK) * GEMINI_OVERHEAD);
  const geminiDays = Math.ceil(geminiReqs / GEMINI_FREE_PER_DAY);
  const clips = Math.round(totalSeg * CLIP_DEDUP);
  const audioGB = (clips * AVG_CLIP_BYTES) / (1024 ** 3);
  const ttsChars = Math.round(totalChars * 1.30);            // vocalized ≈ +30% over consonantal
  const wavenetMonths = ttsChars / WAVENET_FREE_CHARS_MONTH; // free-tier months to bake all audio

  const est = {
    generated_at_note: "stamp after run (Date.now avoided)",
    corpus: { total: rows.length, originals: N, translations: translations.length },
    sample: { requested: SAMPLE, measured: perWork.length, fetched, failed, emptyBody },
    perWork: {
      chars: { mean: Math.round(mChars), p50: pct(charsArr, 50), p90: pct(charsArr, 90), p99: pct(charsArr, 99), max: Math.max(...charsArr) },
      segments: { mean: Math.round(mSeg), p50: pct(segArr, 50), p90: pct(segArr, 90), p99: pct(segArr, 99), max: Math.max(...segArr) },
      unvocalizedSegments: { mean: Math.round(mUnvoc) },
      sourceVocalizedRatio: Math.round(mVocRatio * 100) / 100,
    },
    extrapolated_originals: {
      totalSegments: totalSeg,
      totalUnvocalizedSegments: totalUnvoc,
      totalPlainChars: totalChars,
    },
    translation_gemini: { requests_est: geminiReqs, chunk: GEMINI_CHUNK, overhead: GEMINI_OVERHEAD, free_per_day: GEMINI_FREE_PER_DAY, days_at_free_tier: geminiDays, usd: 0 },
    niqqud_dicta: { calls_est_unvocalized_segments: totalUnvoc, note: "Dicta-cloud throttles under bulk → THE time bottleneck; local sidecar (P0-009) removes the cloud cap (e2e-local unverified)" },
    audio_tts: { clips_est: clips, avg_clip_KB: Math.round(AVG_CLIP_BYTES / 1024), total_GB: Math.round(audioGB * 10) / 10, tts_chars_est: ttsChars, wavenet_free_tier_months: Math.round(wavenetMonths * 10) / 10 },
  };

  fs.writeFileSync(OUT, JSON.stringify(est, null, 2));
  log("\n=== BRR-P0-006 PRE-RUN ESTIMATE (originals only) ===");
  log(`sample measured: ${perWork.length}/${SAMPLE} (fail ${failed}, empty ${emptyBody})`);
  log(`per-work chars   mean ${est.perWork.chars.mean} | p50 ${est.perWork.chars.p50} | p90 ${est.perWork.chars.p90} | p99 ${est.perWork.chars.p99} | max ${est.perWork.chars.max}`);
  log(`per-work segments mean ${est.perWork.segments.mean} | p50 ${est.perWork.segments.p50} | p90 ${est.perWork.segments.p90} | max ${est.perWork.segments.max}`);
  log(`source-vocalized ratio: ${est.perWork.sourceVocalizedRatio} (rest need Dicta niqqud)`);
  log(`→ extrapolated over ${N} originals:`);
  log(`   total segments        ≈ ${totalSeg.toLocaleString()}`);
  log(`   unvocalized segments  ≈ ${totalUnvoc.toLocaleString()}  (Dicta niqqud calls)`);
  log(`   Gemini requests       ≈ ${geminiReqs.toLocaleString()}  → ~${geminiDays} days @ ${GEMINI_FREE_PER_DAY}/day free | $0`);
  log(`   audio clips           ≈ ${clips.toLocaleString()}  → ~${est.audio_tts.total_GB} GB  | TTS chars ≈ ${(ttsChars/1e6).toFixed(1)}M → ~${est.audio_tts.wavenet_free_tier_months} WaveNet-free-months`);
  log(`estimate JSON → ${OUT}`);
  log("NOTE: extrapolation = sample mean × population; long-tail variance is high (see p99/max). Re-run with larger --sample to tighten. Translations (1814) measured separately at bulk.");
})().catch((e) => { console.error("fatal:", e); process.exit(1); });
