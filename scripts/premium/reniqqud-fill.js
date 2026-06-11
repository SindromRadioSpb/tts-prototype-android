#!/usr/bin/env node
"use strict";
// Tier-2 (BRR resolver-correspondence roadmap) — niqqud-only re-bake.
//
// Measured cause of weak tap-resolve on some works: the original corpus bake left
// `hebrew_niqqud` EMPTY for ~110 works (audit:corpus-niqqud → reniqqud-ids.json). Their
// `hebrew_plain` + `russian` are fine — only vocalization is missing. Dicta-cloud Nakdan
// re-vocalizes the plain text at ~98% coverage (measured), which directly feeds the
// form-first resolver (it reads niqqud) + the colour-status feature.
//
// This tool fills ONLY `hebrew_niqqud` from Dicta, in place, per work:
//   • translation (`russian`), audio keys, notes, order — UNTOUCHED;
//   • R1 skeleton-guard: a vocalized result is accepted ONLY when its consonant skeleton
//     (Hebrew letters, order) EQUALS the plain row's — else the row is left as-is and
//     flagged (never replace text with something Dicta mangled);
//   • crash-safe ledger (resumable): re-run the same command to continue;
//   • per-work before/after coverage; works that don't lift are flagged (inherently hard).
//
// Publish is owner-gated (bodies live on the prod volume): after this fills the local
// work JSONs, the owner pushes via `publish-corpus-batch` / `push-corpus-works.js` +
// AUDIO_UPLOAD_TOKEN. This tool only re-bakes the local bodies.
//
// Usage:
//   node scripts/premium/reniqqud-fill.js --dry-run            # measure achievable lift, no writes
//   node scripts/premium/reniqqud-fill.js --bake               # fill (resumable)
//   node scripts/premium/reniqqud-fill.js --bake --limit 5     # first N works
//   node scripts/premium/reniqqud-fill.js --status             # ledger dashboard
//   [--ids-file <path>]  default .tmp/benyehuda/reniqqud-ids.json
//   [--works-dir <path>] default public/data/benyehuda/works
//   [--min-cov <0..100>] only re-bake works currently below this (default 60)

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const dictaCloud = require(path.join(REPO, "db/premium/providers/dictaCloud.js"));
const RM = require(path.join(REPO, "public/js/reader-morph.js"));

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return (v == null || v.startsWith("--")) ? true : v;
}
const DRY = process.argv.includes("--dry-run");
const STATUS = process.argv.includes("--status");
const BAKE = process.argv.includes("--bake");
const IDS_FILE = path.resolve(REPO, String(arg("ids-file", ".tmp/benyehuda/reniqqud-ids.json")));
const WORKS_DIR = path.resolve(REPO, String(arg("works-dir", "public/data/benyehuda/works")));
const LEDGER = path.resolve(REPO, ".tmp/benyehuda/reniqqud-fill-ledger.json");
const LIMIT = Number(arg("limit", 0)) || 0;
const MIN_COV = Number(arg("min-cov", 60));         // skip a work already at/above this coverage
const ROW_TARGET_COV = Number(arg("row-cov", 50));  // re-niqqud a row under this word-level coverage
const YIDDISH_THRESHOLD = Number(arg("yiddish-threshold", 3)) / 100;  // skip works with ≥N% Yiddish tokens
const GENRE = String(arg("genre", "modern"));
const VOW = /[ְ-ׇּׁׂ]/;     // niqqud + dagesh/shin/sin dots

const hebSkeleton = (s) => String(s || "").replace(/[^א-ת]/g, "");
const rowsOf = (work) => ((work.library && work.library.texts) || []).flatMap((t) => t.rows || []);

// Yiddish guard (R7/R10): the Reading Room is the HEBREW canon, and Dicta-Nakdan is a
// HEBREW vocalizer — applying it to a Yiddish text collapses Yiddish digraphs (וו→ו, יי→י)
// and points the wrong language. Detect Yiddish by the share of tokens that are Yiddish
// function words with no Hebrew reading (דער/מיט/איז/ניט/געווען/זיך/…). Real Yiddish texts
// run ~20%+; Hebrew works ~0%. Such a work is SKIPPED (left unpointed — honest, not wrong).
const YIDDISH_WORDS = new Set(["דער", "דאס", "דאָס", "אַז", "מיט", "איז", "ניט", "נישט", "אויף",
  "אזוי", "אַזוי", "וואס", "וואָס", "געווען", "זיינען", "זענען", "האבן", "האָבן", "זיך", "אויך",
  "נאר", "נאָר", "אונדז", "וועל", "וועט", "ווערן", "קיין", "דאך", "דאָך", "אבער", "דעם", "ווי", "אונ", "און"]);
function yiddishRatio(rows) {
  let words = 0, hits = 0;
  for (const r of rows) for (const tok of String(r.hebrew_plain || "").replace(/[ְ-ׇ]/g, "").split(/\s+/)) {
    const t = tok.replace(/[^א-ת]/g, ""); if (!t) continue; words++; if (YIDDISH_WORDS.has(t)) hits++;
  }
  return words ? hits / words : 0;
}
function wordCov(str) {
  let words = 0, voc = 0;
  for (const w of RM.words(str || "")) { if (RM.stripNiqqud(w).length < 2) continue; words++; if (VOW.test(w)) voc++; }
  return { words, voc, pct: words ? (100 * voc) / words : 0 };
}
function coverage(rows, field) {
  let words = 0, voc = 0;
  for (const r of rows) { const c = wordCov(r[field] || ""); words += c.words; voc += c.voc; }
  return { words, voc, pct: words ? Math.round((100 * voc) / words) : 0 };
}
// Reconstruct a vocalized row from Dicta output PER-WORD: keep the plain row's exact
// spacing/punctuation; substitute a word's niqqud ONLY when Dicta's vocalized word has
// the SAME consonant skeleton (alignSurfaceNiqqud enforces this). Words Dicta re-spelled
// (ktiv male/haser normalization) stay bare — so the row's text skeleton is preserved by
// construction (R1: never impose a different spelling on the source text). Returns
// { niqqud, matched, total }.
function reconstructNiqqud(plain, dictaNiqqud) {
  const align = RM.alignSurfaceNiqqud(plain, dictaNiqqud);   // [{surface, niqqud:""|vocalized}]
  const toks = RM.tokenize(plain);
  let wi = 0, out = "", matched = 0, total = 0;
  for (const t of toks) {
    if (!t.isWord) { out += t.text; continue; }
    total++;
    const a = align[wi++];
    if (a && a.niqqud && VOW.test(a.niqqud) && hebSkeleton(a.niqqud) === hebSkeleton(t.text)) { out += a.niqqud; matched++; }
    else out += t.text;
  }
  return { niqqud: out, matched, total };
}
function readJson(p, def) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return def; } }
function writeJsonAtomic(p, obj) {
  const tmp = p + ".tmp" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, p);
}

function loadIds() {
  const raw = readJson(IDS_FILE, null);
  if (!raw) { console.error("[reniqqud] ids-file not found: " + IDS_FILE + " (run `npm run audit:corpus-niqqud` first)"); process.exit(2); }
  const ids = Array.isArray(raw) ? raw : (raw.ids || raw.work_ids || []);
  return ids.map(String);
}

function printStatus(led) {
  const e = Object.values(led.works || {});
  const done = e.filter((x) => x.status === "done").length;
  const failed = e.filter((x) => x.status === "failed").length;
  const excluded = e.filter((x) => x.status === "excluded");
  const lifted = e.filter((x) => x.status === "done" && (x.after_pct - x.before_pct) >= 20);
  const lowlift = e.filter((x) => x.status === "done" && (x.after_pct - x.before_pct) < 20);
  console.log("── reniqqud-fill ledger ──");
  console.log("works recorded:", e.length, "| done:", done, "| failed:", failed, "| excluded(yiddish):", excluded.length);
  if (excluded.length) console.log("excluded:", excluded.map((x) => x.id + (x.yiddish_ratio != null ? "(" + x.yiddish_ratio + "% YI)" : "")).join(", "));
  if (done) {
    const avgBefore = Math.round(e.filter(x => x.status === "done").reduce((a, x) => a + x.before_pct, 0) / done);
    const avgAfter = Math.round(e.filter(x => x.status === "done").reduce((a, x) => a + x.after_pct, 0) / done);
    console.log("avg coverage:", avgBefore + "% → " + avgAfter + "%", "| strong-lift:", lifted.length, "| low-lift(<20pp):", lowlift.length, "| rows rejected (skeleton):", e.reduce((a, x) => a + (x.rejected || 0), 0));
  }
  if (lowlift.length) console.log("low-lift works (inherently hard / check):", lowlift.map(x => x.id + "(" + x.before_pct + "→" + x.after_pct + ")").join(", "));
}

async function reniqqudWork(id, led) {
  const wp = path.join(WORKS_DIR, id + ".json");
  if (!fs.existsSync(wp)) { led.works[id] = { id, status: "failed", err: "missing-file" }; return; }
  const work = readJson(wp, null);
  if (!work) { led.works[id] = { id, status: "failed", err: "bad-json" }; return; }
  const rows = rowsOf(work);
  // Yiddish guard: never apply the Hebrew vocalizer to a Yiddish text (wrong language model).
  const yr = yiddishRatio(rows);
  if (yr >= YIDDISH_THRESHOLD) { led.works[id] = { id, status: "excluded", reason: "yiddish-text-wrong-language-model", yiddish_ratio: Math.round(yr * 1000) / 10 }; return; }
  const before = coverage(rows, "hebrew_niqqud");
  if (before.pct >= MIN_COV) { led.works[id] = { id, status: "done", before_pct: before.pct, after_pct: before.pct, filled: 0, rejected: 0, skipped: "already>=min" }; return; }

  // target rows: have plain Hebrew text AND are under-vocalized at the WORD level
  // (empty OR partial niqqud). A stray vowel no longer hides an unvocalized row.
  const targets = rows.filter((r) => hebSkeleton(r.hebrew_plain).length >= 2 && wordCov(r.hebrew_niqqud || "").pct < ROW_TARGET_COV);
  if (!targets.length) { led.works[id] = { id, status: "done", before_pct: before.pct, after_pct: before.pct, filled: 0, rejected: 0, skipped: "no-targets" }; return; }

  let wordsMatched = 0, wordsTotal = 0;
  // proposed holds the reconstructed niqqud per target row; applied only when !DRY.
  const proposed = new Map();
  const BATCH = 24;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const texts = slice.map((r) => r.hebrew_plain);
    let res;
    try { res = await dictaCloud.nakdan(texts, GENRE); }
    catch (e) { led.works[id] = { id, status: "failed", err: "dicta:" + e.message, before_pct: before.pct }; return; }
    const out = (res && res.body && res.body.results) || [];
    for (let j = 0; j < slice.length; j++) {
      const voc = String(out[j] || "");
      if (!voc || !VOW.test(voc)) continue;             // Dicta gave nothing usable for this row
      const rec = reconstructNiqqud(slice[j].hebrew_plain, voc);
      wordsMatched += rec.matched; wordsTotal += rec.total;
      if (rec.matched > 0) proposed.set(slice[j], rec.niqqud);
    }
  }
  const afterRows = rows.map((r) => ({ hebrew_niqqud: proposed.has(r) ? proposed.get(r) : r.hebrew_niqqud }));
  const after = coverage(afterRows, "hebrew_niqqud");
  if (!DRY) {
    // defense-in-depth: never write a niqqud whose consonant skeleton differs from the
    // plain row (reconstructNiqqud guarantees this; assert anyway before mutating source).
    let integrity = 0;
    for (const [r, voc] of proposed) {
      if (hebSkeleton(voc) !== hebSkeleton(r.hebrew_plain)) { integrity++; continue; }
      r.hebrew_niqqud = voc;
    }
    work._reniqqud = { at: new Date().toISOString().slice(0, 10), provider: dictaCloud.MODEL_VERSION, rows_filled: proposed.size - integrity, words_matched: wordsMatched, words_total: wordsTotal };
    writeJsonAtomic(wp, work);
    if (integrity) led.works[id] = Object.assign(led.works[id] || {}, { integrity_skips: integrity });
  }
  const wordPct = wordsTotal ? Math.round((100 * wordsMatched) / wordsTotal) : 0;
  led.works[id] = { id, status: "done", before_pct: before.pct, after_pct: after.pct, filled: proposed.size, rejected: wordsTotal - wordsMatched, targets: targets.length, word_match_pct: wordPct };
}

async function main() {
  const ids0 = loadIds();
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  const led = readJson(LEDGER, { started_at: new Date().toISOString(), works: {} });
  led.works = led.works || {};

  if (STATUS) { printStatus(led); return; }

  let ids = ids0.filter((id) => !(led.works[id] && led.works[id].status === "done"));
  if (LIMIT) ids = ids.slice(0, LIMIT);
  console.log(`[reniqqud] ${DRY ? "DRY-RUN" : BAKE ? "BAKE" : "PREVIEW"} | ${ids.length}/${ids0.length} works pending | dir=${path.relative(REPO, WORKS_DIR)} | min-cov=${MIN_COV}`);
  if (!DRY && !BAKE) { console.log("Pass --bake to write, or --dry-run to measure. No changes made."); return; }

  let n = 0;
  for (const id of ids) {
    await reniqqudWork(id, led);
    if (!DRY) writeJsonAtomic(LEDGER, led);
    const w = led.works[id];
    n++;
    console.log(`  [${n}/${ids.length}] ${id}: ${w.status}` + (w.status === "done" ? ` ${w.before_pct}%→${w.after_pct}% (filled ${w.filled}${w.rejected ? ", rejected " + w.rejected : ""}${w.skipped ? ", " + w.skipped : ""})` : ` ${w.err || ""}`));
  }
  console.log("");
  printStatus(led);
  if (!DRY) console.log("\nNEXT (owner): publish updated bodies via `publish-corpus-batch` + push-corpus-works.js + AUDIO_UPLOAD_TOKEN.");
}

// Pure helpers exported for the smoke (text-integrity invariant). Run main() only as a CLI.
module.exports = { reconstructNiqqud, wordCov, coverage, hebSkeleton, VOW, yiddishRatio };
if (require.main === module) main().catch((e) => { console.error("fatal", e); process.exit(1); });
