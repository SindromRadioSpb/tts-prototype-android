#!/usr/bin/env node
"use strict";

// run-corpus-prebake.js — BRR-P0-006 full-corpus pre-run runner (RUN LOCALLY).
//
// Owner decisions 2026-06-09 (docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md):
//   A) scope  = tiered (known-era originals first; giant-defer at run time)
//   B) speed  = free-tier only (1500 Gemini req/day, $0) → daily-quota stop + resume
//   C) audio  = on-demand computed-key (runner does NOT pre-bake tail audio)
//   D) niqqud = Dicta-cloud with backoff
//
// Modes:
//   --plan   : offline, deterministic. Select originals, order known-era-first, seed
//              the ledger, print the free-tier day-schedule + ETA. No network.
//   --bake   : the real resumable run. Per pending work (known-era first): fetch →
//              segment → giant-defer if over the cap → translate (Gemini free-tier) +
//              niqqud (Dicta-cloud) via the SHARED lib/ingestCore → R1 corpus build →
//              accumulate into a per-era shard. Stops on the daily Gemini quota
//              (proactive) or an API quota/429 (marks the in-flight work for retry),
//              saving the ledger + caches so tomorrow resumes cleanly. Writes an
//              operator status snapshot (.tmp/benyehuda/run-status.json) as it goes.
//   --status : print the operator dashboard (run-status.json + live ledger totals).
//
//   node scripts/premium/run-corpus-prebake.js --plan
//   node scripts/premium/run-corpus-prebake.js --bake --provider gemini   # needs GEMINI_API_KEY
//   node scripts/premium/run-corpus-prebake.js --bake --provider google-free --limit 5   # smoke
//   node scripts/premium/run-corpus-prebake.js --status
//
// Ledger: .tmp/benyehuda/prebake-ledger.json · shards: .tmp/benyehuda/shards/ (gitignored).
// CAVEAT: the ledger is provider-AGNOSTIC (it records done/failed per work, not which
// provider produced it). Use ONE provider for a whole run; to switch providers (e.g.
// google-free smoke → gemini real run), delete the ledger so every work re-bakes with
// the chosen provider. (The disk trans-cache is provider-KEYED, so it never mixes.)

const fs = require("fs");
const path = require("path");

const by = require("./lib/benyehuda");
const ledgerLib = require("./lib/corpusLedger");
const shelfMeta = require("../../db/premium/shelfMeta");
const { createIngestCore } = require("./lib/ingestCore");
const { segment } = require("../../db/premium/segmenter");
const JSZip = require("../../public/db/jszip.min.js");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO, ".tmp");
const BY_DIR = path.join(TMP, "benyehuda");
const CSV_PATH = path.join(BY_DIR, "pseudocatalogue.csv");
const ESTIMATE_PATH = path.join(TMP, "by-prerun-estimate.json");
const RAW_BASE = "https://raw.githubusercontent.com/projectbenyehuda/public_domain_dump/master";

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const PLAN = flag("plan");
const BAKE = flag("bake");
const STATUS = flag("status");
const GEMINI_PER_DAY = Number(arg("gemini-per-day", 1500)) || 1500;
const LEDGER_PATH = String(arg("ledger", path.join(BY_DIR, "prebake-ledger.json")));
const SHARD_DIR = String(arg("shard-dir", path.join(BY_DIR, "shards")));
const RUN_STATUS_PATH = String(arg("status-file", path.join(BY_DIR, "run-status.json")));
const PROVIDER = String(arg("provider", "gemini"));
const GEMINI_KEY = String(arg("gemini-key", process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""));
const GEMINI_MODEL = String(arg("gemini-model", "gemini-2.5-flash"));
const GEMINI_CHUNK = Number(arg("gemini-chunk", 50));
const GEMINI_TIMEOUT = Number(arg("gemini-timeout", 90000));
const GCP_KEY = String(arg("gcp-key", process.env.GCP_TRANSLATE_API_KEY || ""));
const NO_FETCH = flag("no-fetch");
const GIANT_SEGMENTS = Number(arg("giant-segments", 2000)) || 2000; // defer works over this to a later giant pass
const LIMIT = Number(arg("limit", 0)) || 0;                          // 0 = no cap (besides the daily quota)
const FLUSH_EVERY = Number(arg("flush", 300)) || 300;                // texts per era before a shard flushes
const CANON_VERSION = Number(arg("canon-version", 3)) || 3;
const CANON_ORIGIN = "benyehuda-ingest";

function defaultReqsPerWork() {
  try {
    const est = JSON.parse(fs.readFileSync(ESTIMATE_PATH, "utf8"));
    const reqs = est && est.translation_gemini && est.translation_gemini.requests_est;
    const orig = est && est.corpus && est.corpus.originals;
    if (reqs && orig) return reqs / orig;
  } catch (_) {}
  return 5.7;
}
const REQS_PER_WORK = Number(arg("reqs-per-work", defaultReqsPerWork())) || 5.7;
const worksPerDay = () => Math.max(1, Math.floor(GEMINI_PER_DAY / REQS_PER_WORK));

function readRunStatus() { try { return JSON.parse(fs.readFileSync(RUN_STATUS_PATH, "utf8")); } catch (_) { return null; } }
function writeRunStatus(obj) { try { fs.mkdirSync(path.dirname(RUN_STATUS_PATH), { recursive: true }); fs.writeFileSync(RUN_STATUS_PATH, JSON.stringify(obj, null, 2)); } catch (_) {} }
function countShards() { try { return fs.readdirSync(SHARD_DIR).filter((f) => /\.zip$/.test(f)).length; } catch (_) { return 0; } }
function nowIso() { return new Date().toISOString(); }
function utcDay() { return nowIso().slice(0, 10); }

function selectAndOrderOriginals(rows) {
  const originals = rows.filter((r) => !by.cleanField(r.translators) && by.cleanField(r.path) && by.cleanField(r.ID));
  const known = [], rest = [];
  for (const r of originals) {
    let era = null; try { era = by.eraForAuthor(r.authors); } catch (_) {}
    (era ? known : rest).push({ id: String(by.cleanField(r.ID)), tier: era ? "known-era" : "rest" });
  }
  return { originals, known, rest, ordered: [...known, ...rest] };
}

function snapshot(ledger, run, today) {
  const s = ledgerLib.stats(ledger);
  return {
    provider: PROVIDER, started_at: run.startedAt, updated_at: nowIso(), current_day: today,
    works_total: s.total, works_done: s.done, works_failed: s.failed,
    works_deferred_giant: s.deferredGiant, works_skipped: s.skipped, works_pending: s.pending,
    gemini_requests_today: ledgerLib.dayReqsUsed(ledger, today), gemini_per_day: GEMINI_PER_DAY,
    estimated_days_left: Math.ceil(s.pending / worksPerDay()),
    last_error: run.lastError, last_success_at: run.lastSuccessAt,
    current_tier: run.curTier, current_era: run.curEra,
    shard_count: countShards(),
    qa_samples_pending: null, // R7 QA-sampling not wired yet (honest null, not a fake 0)
  };
}

function doPlan() {
  const { rows } = by.parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const sel = selectAndOrderOriginals(rows);
  const ledger = ledgerLib.loadLedger(LEDGER_PATH);
  const added = ledgerLib.seedLedger(ledger, sel.ordered);
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  ledgerLib.saveLedger(LEDGER_PATH, ledger);
  const s = ledgerLib.stats(ledger);
  const pending = ledgerLib.pendingWorks(ledger, sel.ordered.map((e) => e.id)).length;
  const etaDays = Math.ceil(pending / worksPerDay());
  console.log("=== BRR-P0-006 PRE-RUN PLAN (free-tier, tiered, resumable) ===");
  console.log(`corpus: ${rows.length} works | originals ${sel.originals.length} (translations handled separately)`);
  console.log(`tiers:  known-era ${sel.known.length} (FIRST) → rest ${sel.rest.length}`);
  console.log(`ledger: ${LEDGER_PATH} (seeded +${added} new) | done ${s.done} · pending ${s.pending} · failed ${s.failed} · deferred-giant ${s.deferredGiant} · skipped ${s.skipped}`);
  console.log(`budget: ${GEMINI_PER_DAY} Gemini req/day · ~${REQS_PER_WORK.toFixed(1)} req/work → ~${worksPerDay()} works/day`);
  console.log(`ETA:    ~${etaDays} days to drain ${pending} pending originals ($0 free-tier) — giants (> ${GIANT_SEGMENTS} segs) deferred to a capped tail pass`);
  console.log("audio:  on-demand computed-key (NOT pre-baked here); niqqud: Dicta-cloud w/ backoff; review_status=machine.");
  console.log("bake:   `--bake --provider gemini` (needs GEMINI_API_KEY) to start; resumes daily on the quota. `--status` for the dashboard.");
}

function doStatus() {
  const st = readRunStatus();
  const ledger = ledgerLib.loadLedger(LEDGER_PATH);
  const s = ledgerLib.stats(ledger);
  const today = utcDay();
  console.log("=== BRR-P0-006 RUN STATUS ===");
  if (st) {
    console.log(`provider:      ${st.provider} | started ${st.started_at} | updated ${st.updated_at}`);
    console.log(`current:       tier ${st.current_tier || "-"} · era ${st.current_era || "-"} | shards ${st.shard_count} | qa-samples-pending ${st.qa_samples_pending === null ? "n/a (R7 sampling not wired)" : st.qa_samples_pending}`);
    console.log(`last success:  ${st.last_success_at || "-"}`);
    console.log(`last error:    ${st.last_error ? JSON.stringify(st.last_error) : "-"}`);
  } else {
    console.log("(no run-status.json yet — run --bake to start; live ledger totals below)");
  }
  console.log(`gemini today:  ${ledgerLib.dayReqsUsed(ledger, today)}/${GEMINI_PER_DAY} requests (${today})`);
  console.log(`ledger:        done ${s.done} · pending ${s.pending} · failed ${s.failed} · deferred-giant ${s.deferredGiant} · skipped ${s.skipped} of ${s.total}`);
  console.log(`ETA:           ~${Math.ceil(s.pending / worksPerDay())} days left @ ~${worksPerDay()} works/day (free-tier, $0)`);
}

async function doBake() {
  if (PROVIDER === "gemini" && !GEMINI_KEY) { console.error("[bake] --provider gemini needs GEMINI_API_KEY env (or --gemini-key)."); process.exit(2); }
  const { rows } = by.parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const sel = selectAndOrderOriginals(rows);
  const byId = new Map(); for (const r of rows) { const id = by.cleanField(r.ID); if (id) byId.set(String(id), r); }
  const ledger = ledgerLib.loadLedger(LEDGER_PATH);
  ledgerLib.seedLedger(ledger, sel.ordered);
  fs.mkdirSync(SHARD_DIR, { recursive: true });

  const core = createIngestCore({
    provider: PROVIDER, geminiKey: GEMINI_KEY, geminiModel: GEMINI_MODEL,
    geminiChunk: GEMINI_CHUNK, geminiTimeout: GEMINI_TIMEOUT, gcpKey: GCP_KEY,
    byDir: BY_DIR, csvPath: CSV_PATH, rawBase: RAW_BASE, noFetch: NO_FETCH,
    stamp: nowIso(), log: (...a) => console.log("  [core]", ...a),
  });

  const today = utcDay();
  const prev = readRunStatus();
  const run = {
    startedAt: (prev && prev.started_at) || nowIso(),
    lastSuccessAt: (prev && prev.last_success_at) || null,
    lastError: (prev && prev.last_error) || null,
    curTier: null, curEra: null,
  };
  const orderedIds = sel.ordered.map((e) => e.id);
  const pending = ledgerLib.pendingWorks(ledger, orderedIds, { includeGiant: false });
  console.log(`[bake] day ${today} | provider ${PROVIDER} | pending ${pending.length} | quota ${GEMINI_PER_DAY}/day (used ${ledgerLib.dayReqsUsed(ledger, today)})`);

  const shards = new Map(); // era → [{ item, key }]
  const shardSeq = {};
  let processed = 0, doneN = 0, failN = 0, giantN = 0, skipN = 0;

  function flushShard(era) {
    const arr = shards.get(era) || [];
    if (!arr.length) return Promise.resolve();
    const texts = arr.map((x) => x.item);
    const slugEra = String(era || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
    const seq = (shardSeq[era] = (shardSeq[era] || 0) + 1);
    const shelf = shelfMeta.buildShelf({
      slug: "by-era-" + slugEra + "-" + seq, title: "Эпоха: " + era, track: "literary",
      editorial_intro: "Автособранный срез корпуса по эпохе «" + era + "» (часть " + seq + "). Машинный перевод + Dicta-никуд; провенанс на карточках.",
      items: arr.map((x) => x.key), order: 200 + seq,
    });
    shelf.origin = CANON_ORIGIN; shelf.canon_version = CANON_VERSION;
    const lib = by.buildLibraryJson({ texts, shelves: [shelf], canonVersion: CANON_VERSION });
    const gate = by.validateLibrary(lib);
    if (!gate.ok) console.error("[bake] ⚠ shard era=" + era + " R1 gate errors (per-work R1 already enforced; writing anyway): " + gate.errors.length);
    const zip = new JSZip();
    const rowCount = texts.reduce((a, t) => a + t.rows.length, 0);
    zip.file("manifest.json", JSON.stringify(by.buildManifest({ textCount: texts.length, rowCount, noteCount: 0, createdAt: nowIso() }), null, 2));
    zip.file("library/library.json", JSON.stringify(lib));
    const out = path.join(SHARD_DIR, "by-era-" + slugEra + "-" + seq + ".zip");
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }).then((buf) => {
      fs.writeFileSync(out, buf);
      console.log(`\n[bake] shard → ${path.basename(out)} (${texts.length} texts, ${rowCount} rows, ${Math.round(buf.length / 1024)} KB)`);
      shards.set(era, []);
    });
  }

  let stopReason = "pending drained";
  try {
    for (const id of pending) {
      if (LIMIT && processed >= LIMIT) { stopReason = "--limit " + LIMIT; break; }
      if (PROVIDER === "gemini" && ledgerLib.dayQuotaRemaining(ledger, today, GEMINI_PER_DAY) <= 0) { stopReason = "daily Gemini quota"; break; }
      const r = byId.get(id);
      if (!r) { ledgerLib.markSkipped(ledger, id, { error: "row-missing" }, today); skipN++; continue; }
      let raw; try { raw = await core.fetchTxt(r.path); }
      catch (e) { run.lastError = { id, error: "fetch:" + (e && e.message), at: nowIso() }; ledgerLib.markFailed(ledger, id, run.lastError.error, today); failN++; continue; }
      const { body } = by.stripFooter(raw);
      if (!body || !body.trim()) { ledgerLib.markSkipped(ledger, id, { error: "empty-body" }, today); skipN++; continue; }
      const segCount = segment(body).length;
      if (segCount > GIANT_SEGMENTS) { ledgerLib.markDeferredGiant(ledger, id, { segments: segCount }, today); giantN++; continue; }

      const plainLen = by.stripNiqqud(body).length;
      const lineCount = body.split("\n").filter((l) => l.trim()).length;
      const cls = by.classifyWork({ genre: r.genre, author: r.authors, shape: { lineCount, charCount: plainLen } });
      const reqsBefore = core.stats.geminiRequests;
      let built = null, err = null;
      try { built = await core.translateAndBuild(r, body, { ...cls, audio_status: "none" }, plainLen); }
      catch (e) { err = (e && e.message) || String(e); }
      const reqsDelta = core.stats.geminiRequests - reqsBefore;
      if (reqsDelta) ledgerLib.recordReqs(ledger, today, reqsDelta);

      if (core.quotaExhausted) {
        // Gemini quota hit mid-work → mark for retry (real translations were cached;
        // empties are NOT cached, so tomorrow only redoes the unfinished part), then stop.
        run.lastError = { id, error: "gemini-quota", at: nowIso() };
        ledgerLib.markFailed(ledger, id, "gemini-quota", today);
        ledgerLib.saveLedger(LEDGER_PATH, ledger); core.saveCaches();
        stopReason = "Gemini quota exhausted (work " + id + " marked for retry)";
        break;
      }
      if (err) { run.lastError = { id, error: "translate:" + err, at: nowIso() }; ledgerLib.markFailed(ledger, id, run.lastError.error, today); failN++; continue; }
      if (!built) { run.lastError = { id, error: "corpus-build-R1", at: nowIso() }; ledgerLib.markFailed(ledger, id, "corpus-build-R1", today); failN++; continue; }

      const era = built.corpus.era || "unknown";
      if (!shards.has(era)) shards.set(era, []);
      shards.get(era).push({ item: built.textItem, key: built.textKey });
      run.curTier = cls.track; run.curEra = era; run.lastSuccessAt = nowIso();
      ledgerLib.markDone(ledger, id, { tier: cls.track, segments: built.textItem.rows.length, reqs: reqsDelta, ru_filled: built.reportRow.ru_filled, content_hash: built.corpus.content_hash }, today);
      doneN++; processed++;
      if (shards.get(era).length >= FLUSH_EVERY) await flushShard(era);
      if (processed % 20 === 0) {
        ledgerLib.saveLedger(LEDGER_PATH, ledger); core.saveCaches(); writeRunStatus(snapshot(ledger, run, today));
        process.stdout.write(`  [bake] processed ${processed} (done ${doneN} fail ${failN} giant ${giantN} skip ${skipN}) reqs-today ${ledgerLib.dayReqsUsed(ledger, today)}\r`);
      }
    }
  } finally {
    for (const era of Array.from(shards.keys())) await flushShard(era);
    ledgerLib.saveLedger(LEDGER_PATH, ledger);
    core.saveCaches();
    writeRunStatus(snapshot(ledger, run, today));
  }

  const s = ledgerLib.stats(ledger);
  console.log(`\n[bake] STOP (${stopReason}). this run: +done ${doneN} / fail ${failN} / giant-deferred ${giantN} / skip ${skipN}; reqs-today ${ledgerLib.dayReqsUsed(ledger, today)}/${GEMINI_PER_DAY}.`);
  console.log(`[bake] ledger totals: done ${s.done} · pending ${s.pending} · failed ${s.failed} · deferred-giant ${s.deferredGiant} · skipped ${s.skipped} of ${s.total}. shards → ${SHARD_DIR}`);
  console.log(`[bake] status → ${RUN_STATUS_PATH} (run --status for the dashboard).`);
  console.log("[bake] resume: re-run the same command (failed works retry; done works skip; quota resets next UTC day).");
}

async function main() {
  if (STATUS) return doStatus();
  if (!fs.existsSync(CSV_PATH)) { console.error("CSV not found: " + CSV_PATH + "\nRun `node scripts/premium/measure-corpus-prerun.js` or ingest-benyehuda.js once to fetch it."); process.exit(2); }
  if (BAKE) return doBake();
  if (PLAN) return doPlan();
  console.error("[prebake] pass --plan (offline schedule), --bake (the resumable run), or --status (dashboard).");
  process.exit(2);
}

main().catch((e) => { console.error("[prebake] fatal:", (e && e.stack) || e); process.exit(1); });
