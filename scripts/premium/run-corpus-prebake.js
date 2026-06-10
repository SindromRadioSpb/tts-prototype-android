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
//   --giant-pass : Проход-2 — process ONLY ledger deferred-giant works. Each giant is
//              chapterized into capped parts (lib/benyehuda.chapterizeGiant: real
//              chapter markers first, paragraph-split fallback; EVERY part ≤ the
//              --giant-segments cap), each part translates like a normal work
//              (series = {work_byehuda_id, work_title, part, total}, text_id
//              by-<id>-c<N>), and the parts + a by-work-<id> TOC shelf are emitted
//              ATOMICALLY per work (no partial works leak; a completed giant can only
//              re-emit into a fresh shard after a hard kill mid-flush, deduped on import
//              by stable text_id/slug). A giant NEVER ships as one monolithic text.
//              Incomplete giants stay deferred-giant (not failed), persist their spent
//              reqs, and retry on the next --giant-pass (proactive daily-quota paced).
//   --status : print the operator dashboard (run-status.json + live ledger totals).
//
//   node scripts/premium/run-corpus-prebake.js --plan
//   node scripts/premium/run-corpus-prebake.js --bake --provider gemini   # needs GEMINI_API_KEY
//   node scripts/premium/run-corpus-prebake.js --bake --provider google-free --limit 5   # smoke
//   node scripts/premium/run-corpus-prebake.js --giant-pass --provider gemini   # Проход-2 (после --bake)
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
const corpusMeta = require("../../db/premium/corpusMeta");
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
const GIANT_PASS = flag("giant-pass"); // Проход-2: only deferred-giant works, chapterized
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
const IDS_FILE = String(arg("ids-file", ""));                        // BRR-P1-015 A5: targeted bake (ordered work-id list from build-fill-list.js)
const FLUSH_WORKS = Number(arg("flush", 25)) || 25;                  // durable flush of ALL eras + ledger save every N processed works (crash-safety)
const WORK_TIMEOUT = Number(arg("work-timeout", 600000)) || 600000;  // per-work wall-clock watchdog (ms): a hung text aborts → marked failed → retried next run
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

// Per-work watchdog: race the work against a hard wall-clock deadline so one hung network
// call (Dicta-cloud / Gemini) can never stall a multi-day unattended run. The losing promise
// is left to settle on its own (caller swallows its late rejection). [BRR-P0-006 hardening]
function withTimeout(promise, ms, label) {
  let to;
  const guard = new Promise((_, reject) => { to = setTimeout(() => reject(new Error("watchdog: " + label + " exceeded " + ms + "ms")), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(to));
}

// Next shard sequence for an era, derived from files ALREADY on disk — so periodic flushes
// (and resumed runs) never overwrite an earlier shard. [BRR-P0-006 hardening]
function nextShardSeq(slugEra) {
  try {
    const re = new RegExp("^by-era-" + slugEra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-(\\d+)\\.zip$");
    let max = 0;
    for (const f of fs.readdirSync(SHARD_DIR)) { const m = f.match(re); if (m) max = Math.max(max, Number(m[1])); }
    return max + 1;
  } catch (_) { return 1; }
}

// BRR-P1-015 A5 — optional targeting via `--ids-file` (an ORDERED work-id list, produced by
// build-fill-list.js from the v3 catalog = Wikidata eras). When present we restrict + reorder
// `ordered` to that list ∩ bakeable originals, IN LIST ORDER — so `--bake` processes only the
// targeted set (e.g. modern→mandate→unknown), in that order, without touching the runner's
// name-heuristic tiering or the rest of the ledger.
function loadIdsFile() {
  if (!IDS_FILE) return null;
  let j; try { j = JSON.parse(fs.readFileSync(IDS_FILE, "utf8")); }
  catch (e) { console.error("[run] --ids-file load failed: " + e.message); process.exit(2); }
  const arr = Array.isArray(j) ? j : (Array.isArray(j.ids) ? j.ids : null);
  if (!arr || !arr.length) { console.error("[run] --ids-file has no ids[]"); process.exit(2); }
  return arr;
}
function selectAndOrderOriginals(rows, idFilter) {
  const originals = rows.filter((r) => !by.cleanField(r.translators) && by.cleanField(r.path) && by.cleanField(r.ID));
  if (idFilter && idFilter.length) {
    const origIds = new Set(originals.map((r) => String(by.cleanField(r.ID))));
    const seen = new Set(); const ordered = [];
    for (const it of idFilter) {
      const id = String(it && it.id != null ? it.id : it);
      if (!origIds.has(id) || seen.has(id)) continue; // keep only bakeable originals, dedup
      seen.add(id);
      ordered.push({ id, tier: (it && (it.era || it.tier)) || "targeted" });
    }
    return { originals, known: [], rest: [], ordered, targeted: true, requested: idFilter.length, matched: ordered.length };
  }
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
  const idFilter = loadIdsFile();
  const sel = selectAndOrderOriginals(rows, idFilter);
  const ledger = ledgerLib.loadLedger(LEDGER_PATH);
  const added = ledgerLib.seedLedger(ledger, sel.ordered);
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  ledgerLib.saveLedger(LEDGER_PATH, ledger);
  const s = ledgerLib.stats(ledger);
  const pending = ledgerLib.pendingWorks(ledger, sel.ordered.map((e) => e.id)).length;
  const etaDays = Math.ceil(pending / worksPerDay());
  console.log("=== BRR-P0-006 PRE-RUN PLAN (free-tier, tiered, resumable) ===");
  console.log(`corpus: ${rows.length} works | originals ${sel.originals.length} (translations handled separately)`);
  if (sel.targeted) {
    const perTier = {}; for (const e of sel.ordered) perTier[e.tier] = (perTier[e.tier] || 0) + 1;
    console.log(`TARGETED: --ids-file ${IDS_FILE} → ${sel.matched}/${sel.requested} ids matched bakeable originals`);
    console.log(`          set (in bake order): ${Object.entries(perTier).map(([k, v]) => k + " " + v).join(" → ")}`);
  } else {
    console.log(`tiers:  known-era ${sel.known.length} (FIRST) → rest ${sel.rest.length}`);
  }
  console.log(`ledger: ${LEDGER_PATH} (seeded +${added} new) | done ${s.done} · pending ${s.pending} · failed ${s.failed} · deferred-giant ${s.deferredGiant} · skipped ${s.skipped}`);
  console.log(`budget: ${GEMINI_PER_DAY} Gemini req/day · ~${REQS_PER_WORK.toFixed(1)} req/work → ~${worksPerDay()} works/day`);
  console.log(`ETA:    ~${etaDays} days to drain ${pending} ${sel.targeted ? "TARGETED " : ""}pending originals ($0 free-tier) — giants (> ${GIANT_SEGMENTS} segs) deferred to a capped tail pass`);
  console.log("audio:  on-demand computed-key (NOT pre-baked here); niqqud: Dicta-cloud w/ backoff; review_status=machine.");
  console.log(`bake:   \`--bake --provider gemini${sel.targeted ? " --ids-file " + IDS_FILE : ""}\` (needs GEMINI_API_KEY) to start; resumes daily on the quota. \`--status\` for the dashboard.`);
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

async function doBake(opts) {
  const giantPass = !!(opts && opts.giantPass);
  if (PROVIDER === "gemini" && !GEMINI_KEY) { console.error("[bake] --provider gemini needs GEMINI_API_KEY env (or --gemini-key)."); process.exit(2); }
  const { rows } = by.parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const idFilter = loadIdsFile();
  const sel = selectAndOrderOriginals(rows, idFilter);
  if (sel.targeted) console.log(`[bake] TARGETED --ids-file ${IDS_FILE} → ${sel.matched}/${sel.requested} bakeable; processing ONLY this set, in list order.`);
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
  const pending = giantPass
    ? ledgerLib.giantWorks(ledger, orderedIds)
    : ledgerLib.pendingWorks(ledger, orderedIds, { includeGiant: false });
  console.log(`[bake${giantPass ? ":giant-pass" : ""}] day ${today} | provider ${PROVIDER} | ${giantPass ? "deferred-giants" : "pending"} ${pending.length} | quota ${GEMINI_PER_DAY}/day (used ${ledgerLib.dayReqsUsed(ledger, today)})`);

  const shards = new Map(); // era → [{ item, key }]
  const workShelvesByEra = new Map(); // era → [shelf] — giant-pass by-work TOC shelves (ship with the era shard)
  let processed = 0, doneN = 0, failN = 0, giantN = 0, skipN = 0, reDeferN = 0;
  // Monotonic display order for giant by-work TOC shelves, SEEDED from giants already
  // completed in prior runs (flushEvery=1 clears the per-era accumulator after every
  // work, so its length can't supply a running index → all shelves would collide on
  // order=100). Distinct + bake-ordered across resumed passes.
  let giantShelfSeq = 0;
  for (const wid in ledger.works) { const w = ledger.works[wid]; if (w.status === ledgerLib.STATUS.DONE && w.parts) giantShelfSeq++; }

  function flushShard(era) {
    const arr = shards.get(era) || [];
    if (!arr.length) return Promise.resolve();
    const texts = arr.map((x) => x.item);
    const slugEra = String(era || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
    const seq = nextShardSeq(slugEra);
    const shelf = shelfMeta.buildShelf({
      slug: "by-era-" + slugEra + "-" + seq, title: "Эпоха: " + era, track: "literary",
      editorial_intro: "Автособранный срез корпуса по эпохе «" + era + "» (часть " + seq + "). Машинный перевод + Dicta-никуд; провенанс на карточках.",
      items: arr.map((x) => x.key), order: 200 + seq,
    });
    shelf.origin = CANON_ORIGIN; shelf.canon_version = CANON_VERSION;
    // giant-pass: a chapterized work's TOC shelf ships in the same shard as its parts
    // (parts + shelf enter the accumulators atomically, and giant mode flushes every
    // work — a TOC can never be orphaned from its chapters).
    const workShelves = workShelvesByEra.get(era) || [];
    const lib = by.buildLibraryJson({ texts, shelves: [...workShelves, shelf], canonVersion: CANON_VERSION });
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
      shards.set(era, []); workShelvesByEra.set(era, []);
    });
  }

  // Durability: flush ALL accumulated shards to disk, THEN persist the ledger, every
  // flushEvery works. Flush-before-save preserves the on-disk invariant that every
  // ledger-"done" work is already in a shard — a crash loses ≤flushEvery works, which
  // re-bake from the trans-cache on resume (never orphaned done-but-unflushed rows).
  // Giant mode flushes EVERY work: parts are big, and a per-work flush keeps each TOC
  // shelf in the same shard as its chapters.
  const flushEvery = giantPass ? 1 : FLUSH_WORKS;
  async function maybeFlush() {
    if (processed % flushEvery !== 0) return;
    for (const era2 of Array.from(shards.keys())) await flushShard(era2);
    ledgerLib.saveLedger(LEDGER_PATH, ledger); core.saveCaches(); writeRunStatus(snapshot(ledger, run, today));
    process.stdout.write(`  [bake] processed ${processed} (done ${doneN} fail ${failN} giant ${giantN} redefer ${reDeferN} skip ${skipN}) reqs-today ${ledgerLib.dayReqsUsed(ledger, today)}\r`);
  }

  let stopReason = "pending drained";
  try {
    for (const id of pending) {
      if (LIMIT && processed >= LIMIT) { stopReason = "--limit " + LIMIT; break; }
      if (PROVIDER === "gemini" && ledgerLib.dayQuotaRemaining(ledger, today, GEMINI_PER_DAY) <= 0) { stopReason = "daily Gemini quota"; break; }
      const r = byId.get(id);
      if (!r) { ledgerLib.markSkipped(ledger, id, { error: "row-missing" }, today); skipN++; continue; }
      let raw;
      try {
        const fetchP = core.fetchTxt(r.path);
        fetchP.catch(() => {}); // swallow late rejection if the watchdog wins the race
        raw = await withTimeout(fetchP, Math.min(WORK_TIMEOUT, 120000), "fetch " + id);
      } catch (e) {
        run.lastError = { id, error: "fetch:" + (e && e.message), at: nowIso() };
        // In giant-pass mode a deferred-giant must STAY deferred on a (rare) fetch error
        // — markFailed would strand it (giantWorks selects only deferred-giant, so no
        // future --giant-pass would ever retry it). Persist immediately. [review fix]
        if (giantPass) { ledgerLib.markDeferredGiant(ledger, id, { error: "giant:fetch:" + (e && e.message) }, today); ledgerLib.saveLedger(LEDGER_PATH, ledger); reDeferN++; }
        else { ledgerLib.markFailed(ledger, id, run.lastError.error, today); failN++; }
        continue;
      }
      const { body } = by.stripFooter(raw);
      if (!body || !body.trim()) { ledgerLib.markSkipped(ledger, id, { error: "empty-body" }, today); skipN++; continue; }
      const segs = segment(body);
      const segCount = segs.length;
      if (!giantPass && segCount > GIANT_SEGMENTS) { ledgerLib.markDeferredGiant(ledger, id, { segments: segCount }, today); giantN++; continue; }
      if (giantPass && segCount > GIANT_SEGMENTS) {
        // ── Проход-2: chapterize the deferred giant into capped parts ────────────
        // Parts enter the shard accumulator only after ALL parts build (atomic per
        // work): a partially-translated giant stays deferred-giant and is dropped
        // from this run — the per-segment trans-cache makes its retry nearly free.
        // (Residual window: a hard kill BETWEEN the shard write and the ledger save
        // can re-emit an already-completed giant into a fresh shard on resume; stable
        // text_id + shelf-slug dedupe it on import — same trade-off as the normal pass.)
        const workTitle = by.cleanField(r.title) || ("Произведение #" + id);
        const gPlainLen = by.stripNiqqud(body).length;
        const gLineCount = body.split("\n").filter((l) => l.trim()).length;
        const cls = by.classifyWork({ genre: r.genre, author: r.authors, shape: { lineCount: gLineCount, charCount: gPlainLen } });
        const chap = by.chapterizeGiant(body, { segmenter: segment, giantSegments: GIANT_SEGMENTS });
        const total = chap.chapters.length;
        console.log(`  [giant] ${id} «${workTitle}» ${segCount} seg → ${chap.mode}${chap.forced ? " (forced)" : ""} ×${total}`);
        const builtParts = []; let reqsWork = 0; let bail = null; let partErr = null;
        for (let ci = 0; ci < total; ci++) {
          // Proactive daily-budget pacing BETWEEN parts (owner decision B). Without this
          // a giant's ~40-req-per-part loop would keep spending past GEMINI_PER_DAY until
          // Google itself hard-429s. The bail path keeps the work deferred-giant. [review fix]
          if (PROVIDER === "gemini" && ledgerLib.dayQuotaRemaining(ledger, today, GEMINI_PER_DAY) <= 0) { bail = "daily-quota"; break; }
          const c = chap.chapters[ci];
          const cDerived = { ...cls, audio_status: "none", series: { work_byehuda_id: id, work_title: workTitle, part: ci + 1, total } };
          const cTitle = c.title ? (workTitle + " · " + c.title) : (workTitle + " · " + (ci + 1));
          const reqsBefore = core.stats.geminiRequests;
          let built = null;
          try {
            const buildP = core.translateAndBuild(r, c.body, cDerived, by.stripNiqqud(c.body).length, { textId: "by-" + id + "-c" + (ci + 1), title: cTitle });
            buildP.catch(() => {}); // swallow late rejection if the watchdog wins the race
            built = await withTimeout(buildP, WORK_TIMEOUT, "giant " + id + " part " + (ci + 1) + "/" + total);
          } catch (e) { partErr = "part " + (ci + 1) + "/" + total + ": " + ((e && e.message) || String(e)); }
          const reqsDelta = core.stats.geminiRequests - reqsBefore;
          if (reqsDelta) { ledgerLib.recordReqs(ledger, today, reqsDelta); reqsWork += reqsDelta; }
          if (core.quotaExhausted) { bail = "gemini-quota"; break; }
          if (partErr || !built) { partErr = partErr || ("part " + (ci + 1) + "/" + total + ": corpus-build-R1"); break; }
          builtParts.push(built);
        }
        if (bail || partErr || builtParts.length !== total) {
          // stays DEFERRED (error recorded) — giants never leak into the normal pass
          // as plain "failed"; the next --giant-pass retries them. Persist here so the
          // re-deferral AND the reqs already spent on completed parts survive a hard kill
          // (maybeFlush only fires after a DONE work, so a run of failing giants would
          // otherwise save nothing → resumed run over-spends the daily budget). [review fix]
          const why = "giant:" + (bail || partErr || "incomplete");
          run.lastError = { id, error: why, at: nowIso() };
          ledgerLib.markDeferredGiant(ledger, id, { segments: segCount, error: why }, today);
          ledgerLib.saveLedger(LEDGER_PATH, ledger); core.saveCaches();
          reDeferN++;
          if (bail) {
            writeRunStatus(snapshot(ledger, run, today));
            stopReason = (bail === "daily-quota" ? "daily Gemini quota" : "Gemini API quota") + " (giant " + id + " stays deferred; cached parts resume free)";
            break;
          }
          continue;
        }
        const gEra = builtParts[0].corpus.era || "unknown";
        if (!shards.has(gEra)) shards.set(gEra, []);
        for (const bp of builtParts) shards.get(gEra).push({ item: bp.textItem, key: bp.textKey });
        if (!workShelvesByEra.has(gEra)) workShelvesByEra.set(gEra, []);
        // the work's own shelf = its table of contents (same contract as the curated
        // canon's chapterized novels — R8: a route, not a flat list)
        const authorClean = by.cleanField(r.authors) || "";
        const isRealChapters = chap.mode === "chapters" && !chap.forced;
        const unitWord = isRealChapters ? by.ruPlural(total, "глава", "главы", "глав") : by.ruPlural(total, "часть", "части", "частей");
        const introLead = authorClean ? ("Многоглавное произведение — " + authorClean + ". ") : "Многоглавное произведение. ";
        const wShelf = shelfMeta.buildShelf({
          slug: "by-work-" + id, title: workTitle, track: cls.track, era: builtParts[0].corpus.era || undefined,
          genre: by.cleanGenre(r.genre) || undefined,
          editorial_intro: introLead + total + " " + unitWord + "; читайте по порядку. Машинный перевод + Dicta-никуд; провенанс на карточках.",
          items: builtParts.map((bp) => bp.textKey), order: 100 + giantShelfSeq,
        });
        wShelf.origin = CANON_ORIGIN; wShelf.canon_version = CANON_VERSION;
        workShelvesByEra.get(gEra).push(wShelf); giantShelfSeq++;
        run.curTier = cls.track; run.curEra = gEra; run.lastSuccessAt = nowIso();
        ledgerLib.markDone(ledger, id, {
          tier: cls.track,
          segments: builtParts.reduce((a, bp) => a + bp.textItem.rows.length, 0),
          parts: total, reqs: reqsWork,
          ru_filled: builtParts.reduce((a, bp) => a + (bp.reportRow.ru_filled || 0), 0),
          content_hash: corpusMeta.computeContentHash(segs.map((s) => by.stripNiqqud(s.he))),
        }, today);
        doneN++; processed++;
        await maybeFlush();
        continue;
      }
      // (giant pass: a formerly-deferred work now under the cap — e.g. after a
      // --giant-segments change — falls through to the normal single-text path)

      const plainLen = by.stripNiqqud(body).length;
      const lineCount = body.split("\n").filter((l) => l.trim()).length;
      const cls = by.classifyWork({ genre: r.genre, author: r.authors, shape: { lineCount, charCount: plainLen } });
      const reqsBefore = core.stats.geminiRequests;
      let built = null, err = null;
      try {
        const buildP = core.translateAndBuild(r, body, { ...cls, audio_status: "none" }, plainLen);
        buildP.catch(() => {}); // swallow late rejection if the watchdog wins the race
        built = await withTimeout(buildP, WORK_TIMEOUT, "work " + id + " (" + segCount + " seg)");
      } catch (e) { err = (e && e.message) || String(e); }
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
      await maybeFlush();
    }
  } finally {
    for (const era of Array.from(shards.keys())) await flushShard(era);
    ledgerLib.saveLedger(LEDGER_PATH, ledger);
    core.saveCaches();
    writeRunStatus(snapshot(ledger, run, today));
  }

  const s = ledgerLib.stats(ledger);
  console.log(`\n[bake] STOP (${stopReason}). this run: +done ${doneN} / fail ${failN} / giant-deferred ${giantN} / re-deferred ${reDeferN} / skip ${skipN}; reqs-today ${ledgerLib.dayReqsUsed(ledger, today)}/${GEMINI_PER_DAY}.`);
  console.log(`[bake] ledger totals: done ${s.done} · pending ${s.pending} · failed ${s.failed} · deferred-giant ${s.deferredGiant} · skipped ${s.skipped} of ${s.total}. shards → ${SHARD_DIR}`);
  console.log(`[bake] status → ${RUN_STATUS_PATH} (run --status for the dashboard).`);
  console.log("[bake] resume: re-run the same command (failed works retry; done works skip; quota resets next UTC day).");
}

async function main() {
  if (STATUS) return doStatus();
  if (!fs.existsSync(CSV_PATH)) { console.error("CSV not found: " + CSV_PATH + "\nRun `node scripts/premium/measure-corpus-prerun.js` or ingest-benyehuda.js once to fetch it."); process.exit(2); }
  if (BAKE || GIANT_PASS) return doBake({ giantPass: GIANT_PASS });
  if (PLAN) return doPlan();
  console.error("[prebake] pass --plan (offline schedule), --bake (the resumable run), --giant-pass (Проход-2: chapterize deferred giants), or --status (dashboard).");
  process.exit(2);
}

main().catch((e) => { console.error("[prebake] fatal:", (e && e.stack) || e); process.exit(1); });
